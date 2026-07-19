/* =========================================================================
   SYNC CROSS-DEVICE — "spazio condiviso" con un codice famiglia.
   Tu e la tua ragazza inserite lo stesso codice: menu + lista + spunte si
   aggiornano da soli su tutti i dispositivi. Nessun account nell'app: la
   parte cloud usa Firebase (gratis). L'app funziona anche senza sync.

   Struttura:
   - MOTORE (backend-agnostico): decide cosa inviare/ricevere, fonde gli stati
     dei due dispositivi (merge), evita rimbalzi (echo) e converge.
   - ADATTATORI: "firebase" (reale, cross-device) e "local" (BroadcastChannel,
     stesso browser due schede) usato solo per i test con ?sync=local.
   ========================================================================= */
(function () {
  "use strict";

  // === CONFIGURAZIONE FIREBASE ===============================================
  // Progetto "il-mio-menu" (Realtime Database europe-west1 + Anonymous Auth).
  // NON è un segreto: la sicurezza sta nelle regole del DB (solo autenticati).
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBZRRlCS1aUx0MUHDzA4JmO44Pksi6tFtw",
    authDomain: "il-mio-menu.firebaseapp.com",
    databaseURL: "https://il-mio-menu-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "il-mio-menu",
    storageBucket: "il-mio-menu.firebasestorage.app",
    messagingSenderId: "52410507838",
    appId: "1:52410507838:web:91ba5248a0a1698491a76f",
  };

  const PARAMS = new URLSearchParams(location.search);
  const MODO_LOCALE = PARAMS.get("sync") === "local"; // solo per test: due schede stesso browser

  const CHIAVE_CODICE = "menu_sync_codice";
  const CHIAVE_DEVICE = "menu_sync_device";

  function deviceId() {
    let id = localStorage.getItem(CHIAVE_DEVICE);
    if (!id) { id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); localStorage.setItem(CHIAVE_DEVICE, id); }
    return id;
  }

  /* ---------------------- CODICE FAMIGLIA ---------------------- */
  function generaCodice() {
    const parole = ["casa", "cena", "menu", "spesa", "cucina", "tavola", "pranzo", "orto", "forno"];
    const p = parole[Math.floor(Math.random() * parole.length)];
    let s = "";
    const alfabeto = "abcdefghijkmnopqrstuvwxyz23456789"; // niente l/1/0/o per evitare confusione
    for (let i = 0; i < 4; i++) s += alfabeto[Math.floor(Math.random() * alfabeto.length)];
    return p + "-" + s;
  }
  function normalizzaCodice(c) { return String(c || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""); }

  /* ---------------------- MERGE DEGLI STATI ---------------------- */
  // "Firma" di uno stato: cambia solo quando cambia qualcosa di sincronizzabile
  // (piatti, spunte, "ne ho già"). Le preferenze di sola vista (raggruppa,
  // filtro pasto) NON entrano: restano personali di ogni dispositivo.
  function firma(s) {
    if (!s || !s.prefs) return "";
    return JSON.stringify({
      pid: s.prefs.planId || null,
      rev: s.prefs.rev || 0,
      celle: s.celle || [],
      spuntati: s.spuntati || {},
      giaInCasa: s.giaInCasa || {},
    });
  }
  // rev = revisione DENTRO un piano (cresce ad ogni modifica); ts = orario dell'ultima
  // modifica (orologio). Confronti diversi a seconda che il piano sia lo stesso o no.
  function revOf(s) { return (s && s.prefs && s.prefs.rev) || 0; }
  function tsOf(s) { return (s && s.prefs && s.prefs.ts) || (s && s.updatedAt) || 0; }

  // Fonde due mappe (valori + orari per-chiave) scegliendo per ogni voce il valore
  // con l'orario più recente. Così le modifiche concorrenti dei due dispositivi
  // (spunte diverse, "ne ho già" diversi) non si cancellano a vicenda.
  function fondiPerChiave(vLoc, tLoc, vRem, tRem) {
    vLoc = vLoc || {}; tLoc = tLoc || {}; vRem = vRem || {}; tRem = tRem || {};
    const val = {}, ts = {};
    const chiavi = new Set(Object.keys(vLoc).concat(Object.keys(vRem)));
    chiavi.forEach((k) => {
      const tl = tLoc[k] || 0, tr = tRem[k] || 0;
      const inLoc = Object.prototype.hasOwnProperty.call(vLoc, k);
      const inRem = Object.prototype.hasOwnProperty.call(vRem, k);
      const vinceRemoto = tr > tl || (tr === tl && inRem); // a parità preferisci il remoto
      if (vinceRemoto && inRem) { val[k] = vRem[k]; ts[k] = Math.max(tl, tr); }
      else if (inLoc) { val[k] = vLoc[k]; ts[k] = Math.max(tl, tr); }
      else if (inRem) { val[k] = vRem[k]; ts[k] = tr; }
    });
    return { val, ts };
  }

  // Fonde lo stato locale con quello remoto ricevuto dall'altro dispositivo.
  function fondiStato(locale, remoto) {
    if (!remoto || !remoto.prefs) return locale;
    if (!locale || !locale.prefs) return remoto;
    const stessoPiano = locale.prefs.planId && locale.prefs.planId === remoto.prefs.planId;
    // Piani DIVERSI (uno dei due ha rigenerato da capo): il "rev" non è confrontabile
    // (è locale al piano), quindi vince quello modificato più di recente (orologio).
    if (!stessoPiano) return tsOf(remoto) >= tsOf(locale) ? remoto : locale;
    // STESSO piano: per piatti/quantità vince la revisione più alta (poi l'orario);
    // spunte e "ne ho già" si fondono PER-VOCE (vince chi ha toccato quella voce
    // per ultimo) così mentre siete al supermercato nessuno cancella l'altro.
    const remotoVince = revOf(remoto) > revOf(locale) ||
      (revOf(remoto) === revOf(locale) && tsOf(remoto) > tsOf(locale));
    const base = remotoVince ? remoto : locale;
    const sp = fondiPerChiave(locale.spuntati, locale.spuntatiT, remoto.spuntati, remoto.spuntatiT);
    const gc = fondiPerChiave(locale.giaInCasa, locale.giaInCasaT, remoto.giaInCasa, remoto.giaInCasaT);
    return Object.assign({}, base, {
      spuntati: sp.val, spuntatiT: sp.ts,
      giaInCasa: gc.val, giaInCasaT: gc.ts,
    });
  }

  /* ---------------------- MOTORE ---------------------- */
  const SYNC = {
    attiva: false,
    codice: null,
    stato: "spento", // spento | collego | attivo | offline | errore
    // Ganci impostati da app.js:
    getLocal: null,  // () => stato corrente {prefs, celle, spuntati, giaInCasa, ...}
    onRemote: null,  // (statoFuso) => applica lo stato all'app e ridisegna
    onExtra: null,   // (ricetteExtra[]) => carica ricette personali arrivate dall'altro device
    onStato: null,   // (stato, codice) => aggiorna la UI

    _backend: null,
    _timer: null,
    _firmaVista: null,   // firma dell'ultimo stato ricevuto dal remoto
    _firmaInviata: null, // firma dell'ultimo stato inviato da noi
    _primoValore: false, // abbiamo già ricevuto il primo valore dallo spazio?

    configurata() { return MODO_LOCALE || !!FIREBASE_CONFIG; },
    modoTest() { return MODO_LOCALE; },

    init() {
      const salvato = localStorage.getItem(CHIAVE_CODICE);
      if (salvato && this.configurata()) this.collega(salvato, { silenzioso: true });
      else this._notifica();
    },

    async collega(codice, opt) {
      opt = opt || {};
      codice = normalizzaCodice(codice);
      if (!codice) { if (!opt.silenzioso) alert("Inserisci un codice valido."); return; }
      if (!this.configurata()) { if (!opt.silenzioso) alert("La sincronizzazione non è ancora configurata su questo sito."); return; }
      this.codice = codice;
      localStorage.setItem(CHIAVE_CODICE, codice);
      this._setStato("collego");
      this._primoValore = false;
      try {
        // attiva=true PRIMA di connetti: alcuni backend consegnano il primo valore
        // in modo sincrono dentro connetti() e la semina (push) deve poter partire.
        this.attiva = true;
        this._backend = MODO_LOCALE ? backendLocale() : backendFirebase(FIREBASE_CONFIG);
        await this._backend.connetti(codice, {
          onValue: (payload) => this._daRemoto(payload),
          onStato: (st) => this._setStato(st),
        });
        // NB: non pubblichiamo "alla cieca". Aspettiamo il primo valore dello spazio:
        // se è VUOTO seminiamo il nostro piano, se ha già dati li fondiamo prima di
        // scrivere (così collegandosi non si sovrascrive il piano dell'altro).
      } catch (e) {
        console.warn("[sync] errore di collegamento:", e);
        this.attiva = false;
        this._setStato("errore");
      }
    },

    scollega() {
      try { if (this._backend) this._backend.chiudi(); } catch (e) {}
      this._backend = null;
      this.attiva = false;
      this.codice = null;
      clearTimeout(this._timer);
      this._firmaVista = this._firmaInviata = null;
      localStorage.removeItem(CHIAVE_CODICE);
      this._setStato("spento");
    },

    // Programma l'invio dello stato locale (debounce) per non scrivere ad ogni tocco.
    push(opt) {
      opt = opt || {};
      if (!this.attiva || !this._backend) return;
      clearTimeout(this._timer);
      const esegui = () => {
        if (!this.attiva || !this._backend) return;
        const doc = this.getLocal ? this.getLocal() : null;
        if (!doc || !doc.prefs || !doc.celle || !doc.celle.length) return; // niente piano: niente da inviare
        const f = firma(doc);
        // Già inviato o identico a ciò che abbiamo appena ricevuto: non ripubblicare.
        if (f === this._firmaInviata || f === this._firmaVista) return;
        this._firmaInviata = f;
        this._backend.scrivi(this._payload(doc));
      };
      if (opt.subito) esegui(); else this._timer = setTimeout(esegui, 700);
    },

    _payload(doc) {
      return {
        v: 1,
        stato: {
          prefs: doc.prefs, celle: doc.celle,
          spuntati: doc.spuntati || {}, spuntatiT: doc.spuntatiT || {},
          giaInCasa: doc.giaInCasa || {}, giaInCasaT: doc.giaInCasaT || {},
        },
        extra: (typeof raccogliExtra === "function") ? raccogliExtra() : [],
        updatedAt: Date.now(),
        aggiornatoDa: deviceId(),
      };
    },

    _daRemoto(payload) {
      const primo = !this._primoValore;
      this._primoValore = true;
      // Spazio remoto VUOTO (o payload assente): se siamo i primi ad arrivare,
      // seminiamo il nostro piano (push() salta comunque se non abbiamo un piano).
      if (!payload || !payload.stato || !payload.stato.prefs) {
        if (primo) this.push({ subito: true });
        return;
      }
      const remoto = payload.stato;
      remoto.updatedAt = payload.updatedAt || 0;
      const fRem = firma(remoto);
      this._firmaVista = fRem;
      if (fRem === this._firmaInviata) return; // è il nostro stesso invio tornato indietro: ignora
      // Carica eventuali ricette personali dell'altro dispositivo (senza le quali
      // il piano non si potrebbe disegnare).
      if (payload.extra && payload.extra.length && this.onExtra) this.onExtra(payload.extra);
      const locale = this.getLocal ? this.getLocal() : null;
      const fuso = fondiStato(locale, remoto);
      if (this.onRemote) this.onRemote(fuso);
      // Se dal merge sono emerse informazioni locali non presenti nel remoto
      // (es. una spunta che l'altro non aveva), ripubblica per far convergere tutti.
      if (firma(fuso) !== fRem) this.push({ subito: true });
    },

    _setStato(st) { this.stato = st; this._notifica(); },
    _notifica() { if (this.onStato) this.onStato(this.stato, this.codice); },

    // Helper esposti alla UI
    nuovoCodice: generaCodice,
  };

  /* ---------------------- ADATTATORE FIREBASE (reale) ---------------------- */
  // REQUISITI nel progetto Firebase (altrimenti la sync non parte):
  //  1) Authentication > Sign-in method > abilita "Anonimo".
  //  2) crea "Realtime Database" (NON Firestore), regione es. europe-west1.
  //  3) copia il databaseURL completo dentro FIREBASE_CONFIG (in cima al file).
  //  4) Regole del DB per soli autenticati, es.:
  //     { "rules": { "spazi": { "$codice": { ".read": "auth != null", ".write": "auth != null" } } } }
  function backendFirebase(config) {
    let ref = null, connRef = null, onStato = null;
    let permessiOk = false, connesso = false;
    // Mostriamo "🟢 Sincronizzato" SOLO se connessi E i permessi sono OK (prima
    // lettura riuscita): così regole/auth mal configurate non appaiono come "a posto".
    function refresh() {
      if (!onStato) return;
      if (!connesso) onStato("offline");
      else if (permessiOk) onStato("attivo");
      else onStato("collego");
    }
    return {
      async connetti(codice, cbs) {
        onStato = cbs.onStato;
        await caricaFirebaseSDK();
        if (!window.firebase.apps.length) window.firebase.initializeApp(config);
        await window.firebase.auth().signInAnonymously();
        const db = window.firebase.database();
        ref = db.ref("spazi/" + codice);
        connRef = db.ref(".info/connected");
        connRef.on("value", (s) => { connesso = !!s.val(); refresh(); });
        // Ascolto in tempo reale. Il 2° callback intercetta la lettura NEGATA
        // (regole/permessi) così non resta un silenzio ingannevole.
        ref.on("value",
          (snap) => {
            permessiOk = true; refresh();
            const v = snap.val();
            if (!v) { cbs.onValue(null); return; } // spazio vuoto: lo segnaliamo (semina)
            try { cbs.onValue(JSON.parse(v.json)); } catch (e) { console.warn("[sync] payload illeggibile", e); }
          },
          (err) => { console.warn("[sync] lettura negata:", err); permessiOk = false; if (onStato) onStato("errore"); }
        );
      },
      scrivi(payload) {
        if (!ref) return;
        // Salviamo l'intero stato come stringa JSON in un solo campo: così evitiamo
        // i limiti di Firebase sui caratteri delle chiavi (es. "|", ".") e sui valori vuoti.
        ref.set({ json: JSON.stringify(payload), updatedAt: payload.updatedAt || Date.now(), aggiornatoDa: payload.aggiornatoDa || "" })
          .catch((e) => { console.warn("[sync] scrittura fallita", e); if (onStato) onStato("errore"); });
      },
      chiudi() { try { if (ref) ref.off(); if (connRef) connRef.off(); } catch (e) {} },
    };
  }

  let _sdkPromise = null;
  function caricaFirebaseSDK() {
    if (window.firebase && window.firebase.database && window.firebase.auth) return Promise.resolve();
    if (_sdkPromise) return _sdkPromise;
    const base = "https://www.gstatic.com/firebasejs/10.12.2/";
    const files = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-database-compat.js"];
    const p = files.reduce((acc, f) => acc.then(() => new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = base + f; s.async = false; s.onload = res; s.onerror = () => rej(new Error("SDK non caricato: " + f));
      document.head.appendChild(s);
    })), Promise.resolve());
    _sdkPromise = p;
    // Se il caricamento fallisce (es. offline), azzera la cache: il prossimo
    // tentativo di collegamento riproverà invece di restare bloccato per sempre.
    p.catch(() => { if (_sdkPromise === p) _sdkPromise = null; });
    return _sdkPromise;
  }

  /* ---------------------- ADATTATORE LOCALE (test, stesso browser) ---------------------- */
  function backendLocale() {
    let ch = null, key = null, cbs = null;
    return {
      async connetti(codice, callbacks) {
        cbs = callbacks;
        key = "menu_sync_local_" + codice;
        ch = new BroadcastChannel("menu_sync_" + codice);
        ch.onmessage = (e) => { if (e.data && e.data.tipo === "doc" && cbs.onValue) cbs.onValue(e.data.doc); };
        if (cbs.onStato) cbs.onStato("attivo");
        let iniziale = null;
        try { const raw = localStorage.getItem(key); iniziale = raw ? JSON.parse(raw) : null; } catch (e) {}
        cbs.onValue(iniziale); // segnala anche lo spazio vuoto (null) così scatta la semina
      },
      scrivi(payload) {
        try { localStorage.setItem(key, JSON.stringify(payload)); } catch (e) {}
        if (ch) ch.postMessage({ tipo: "doc", doc: payload });
      },
      chiudi() { try { if (ch) ch.close(); } catch (e) {} },
    };
  }

  window.SYNC = SYNC;
})();
