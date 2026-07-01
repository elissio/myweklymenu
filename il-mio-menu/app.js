/* =========================================================================
   LOGICA DELL'APP
   Tutto gira nel browser; i dati restano salvati sul dispositivo (localStorage).
   ========================================================================= */

const GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const ORDINE_SLOT = ["colazione", "pranzo", "cena"];

let STATE = {
  prefs: null,        // preferenze scelte
  celle: [],          // [{ giorno, slot, ricettaId }]
  spuntati: {},       // voci barrate nella lista della spesa
  giaInCasa: {},      // quantità già in casa per voce (key "categoria|nome" -> numero)
  raggruppa: true,    // lista spesa raggruppata per reparto
  filtroPasto: "tutti",
};

/* ---------------------- AVVIO ---------------------- */
document.addEventListener("DOMContentLoaded", () => {
  setTema(localStorage.getItem("menu_tema") || "auto");
  popolaPreferenze();
  collegaEventi();
  caricaRicetteImportate();
  caricaRicetteUtente();
  caricaRicetteDaLink();
  buildFormRicetta();
  renderRicettarioFiltro();
  renderRicettario();
  // Se apriamo un link "lista condivisa" mostriamo quella; altrimenti il piano salvato.
  if (!caricaDaLink()) caricaDaMemoria();
});

function popolaPreferenze() {
  // Supermercati: card colorate
  const grid = document.getElementById("super-grid");
  SUPERMERCATI.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "super" + (s.id === "lidl" ? " sel" : "");
    b.dataset.id = s.id;
    b.style.background = s.colore;
    b.style.color = s.testo;
    b.innerHTML = `${s.nome}<span class="spunta">✓</span>`;
    b.addEventListener("click", () => {
      document.querySelectorAll("#super-grid .super").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel");
    });
    grid.appendChild(b);
  });

  // Diete
  const dieta = document.getElementById("dieta");
  Object.entries(DIETE).forEach(([k, v]) => {
    const o = document.createElement("option");
    o.value = k; o.textContent = v; dieta.appendChild(o);
  });

  // Pasti (slot)
  const slot = document.getElementById("chips-slot");
  Object.entries(SLOT).forEach(([k, v]) => slot.appendChild(creaChip(v, "slot", k, true)));

  // Elettrodomestici (tutti selezionati di default)
  const eq = document.getElementById("equip-grid");
  Object.entries(ELETTRODOMESTICI).forEach(([k, v]) => {
    const d = document.createElement("div");
    d.className = "equip sel";
    d.dataset.equip = k;
    d.innerHTML = `<div class="ico">${v.emoji}</div><div class="et">${v.nome}</div><span class="spunta">✓</span>`;
    d.addEventListener("click", () => d.classList.toggle("sel"));
    eq.appendChild(d);
  });

  // Tipi di piatto e allergeni
  const tipi = document.getElementById("chips-tipi");
  Object.entries(TIPI_PASTO).forEach(([k, v]) => tipi.appendChild(creaChip(v, "tipo", k)));
  const all = document.getElementById("chips-allergeni");
  Object.entries(ALLERGENI).forEach(([k, v]) => all.appendChild(creaChip(v, "allergene", k)));
}

function creaChip(testo, attr, valore, selezionato) {
  const span = document.createElement("span");
  span.className = "chip" + (selezionato ? " sel" : "");
  span.textContent = testo;
  span.dataset[attr] = valore;
  span.addEventListener("click", () => span.classList.toggle("sel"));
  return span;
}

function collegaEventi() {
  document.querySelectorAll(".tab").forEach(t =>
    t.addEventListener("click", () => { if (!t.disabled) mostraSchermata(t.dataset.tab); }));
  document.getElementById("btn-genera").addEventListener("click", generaPiano);
  document.getElementById("btn-rigenera-tutto").addEventListener("click", rigeneraTutto);
  document.getElementById("btn-vai-spesa").addEventListener("click", () => mostraSchermata("spesa"));
  document.getElementById("overlay").addEventListener("click", e => { if (e.target.id === "overlay") chiudiModal(); });

  // Tema
  document.querySelectorAll("#chips-tema .chip").forEach(c =>
    c.addEventListener("click", () => setTema(c.dataset.tema)));
  document.getElementById("tema-toggle").addEventListener("click", () => {
    const ordine = ["chiaro", "scuro", "auto"];
    const ora = localStorage.getItem("menu_tema") || "auto";
    setTema(ordine[(ordine.indexOf(ora) + 1) % 3]);
  });
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if ((localStorage.getItem("menu_tema") || "auto") === "auto") setTema("auto");
    });
  }

  // Toggle "raggruppa per categoria"
  document.getElementById("tg-raggruppa").addEventListener("change", e => {
    STATE.raggruppa = e.target.checked;
    salvaInMemoria();
    renderSpesa();
  });

  document.getElementById("ric-cerca").addEventListener("input", renderRicettario);

  // Condivisione della lista della spesa
  document.getElementById("btn-wa").addEventListener("click", inviaWhatsApp);
  document.getElementById("btn-copia-link").addEventListener("click", copiaLink);
  document.getElementById("btn-copia-testo").addEventListener("click", copiaListaTesto);
}

/* ---------------------- TEMA ---------------------- */
function risolviTema(t) {
  if (t === "scuro") return "dark";
  if (t === "chiaro") return "light";
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function setTema(t) {
  localStorage.setItem("menu_tema", t);
  document.documentElement.dataset.theme = risolviTema(t);
  document.querySelectorAll("#chips-tema .chip").forEach(c => c.classList.toggle("sel", c.dataset.tema === t));
}

/* ---------------------- NAVIGAZIONE ---------------------- */
function mostraSchermata(nome) {
  document.querySelectorAll(".schermata").forEach(s => s.classList.remove("attiva"));
  document.getElementById("schermata-" + nome).classList.add("attiva");
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === nome));
}

/* ---------------------- PREFERENZE ---------------------- */
function leggiPreferenze() {
  const superSel = document.querySelector("#super-grid .super.sel");
  const slot = [...document.querySelectorAll("#chips-slot .chip.sel")].map(c => c.dataset.slot);
  const lista = s => s.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  return {
    supermercato: superSel ? superSel.dataset.id : SUPERMERCATI[0].id,
    persone: Math.max(1, parseInt(document.getElementById("persone").value) || 2),
    giorni: Math.min(7, Math.max(1, parseInt(document.getElementById("giorni").value) || 7)),
    budget: Math.max(1, parseFloat(document.getElementById("budget").value) || 60),
    dieta: document.getElementById("dieta").value,
    obiettivo: document.getElementById("obiettivo").value,
    slot: ORDINE_SLOT.filter(s => slot.includes(s)),
    equip: [...document.querySelectorAll("#equip-grid .equip.sel")].map(c => c.dataset.equip),
    tipi: [...document.querySelectorAll("#chips-tipi .chip.sel")].map(c => c.dataset.tipo),
    allergeni: [...document.querySelectorAll("#chips-allergeni .chip.sel")].map(c => c.dataset.allergene),
    evitare: lista(document.getElementById("evitare").value),
    dispensa: lista(document.getElementById("dispensa").value),
    pranzoUfficio: document.getElementById("tg-ufficio").checked,
    nientePiccante: document.getElementById("tg-piccante").checked,
    soloStagione: document.getElementById("tg-stagione").checked,
    cucinaDoppio: document.getElementById("tg-batch").checked,
    dataInizio: oggiISO(),
  };
}

// Data di oggi in formato YYYY-MM-DD (locale): ancora il piano al giorno di partenza.
function oggiISO() {
  const d = new Date();
  const due = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}

function stagioneCorrente() {
  const m = new Date().getMonth(); // 0 = gennaio
  if (m >= 2 && m <= 4) return "primavera";
  if (m >= 5 && m <= 7) return "estate";
  if (m >= 8 && m <= 10) return "autunno";
  return "inverno";
}

function getSupermercato(id) { return SUPERMERCATI.find(s => s.id === id) || SUPERMERCATI[0]; }

/* Una ricetta è valida per uno slot date le preferenze? */
function ricettaValida(r, slot, prefs) {
  if (!r.slot.includes(slot)) return false;
  if (prefs.dieta && !r.diete.includes(prefs.dieta)) return false;
  if (prefs.allergeni.some(a => r.allergeni.includes(a))) return false;
  if (prefs.tipi.length && !prefs.tipi.some(t => r.tipi.includes(t))) return false;
  // Elettrodomestici: servono tutti quelli richiesti dalla ricetta
  if (!r.attrezzatura.every(a => prefs.equip.includes(a))) return false;
  // Niente piccante
  if (prefs.nientePiccante && r.piccante) return false;
  // Pranzo da ufficio: solo piatti riscaldabili/trasportabili
  if (prefs.pranzoUfficio && slot === "pranzo" && r.riscaldabile === false) return false;
  // Stagionalità
  if (prefs.soloStagione && r.stagioni && !r.stagioni.includes(stagioneCorrente())) return false;
  // Ingredienti da evitare
  if (prefs.evitare.length && r.ingredienti.some(i =>
        prefs.evitare.some(e => i.nome.toLowerCase().includes(e)))) return false;
  return true;
}

/* ---------------------- COSTI ---------------------- */
function fattoreScala(prefs) { return prefs.persone / 2; }
// Prezzo del singolo ingrediente, con eventuale sconto del volantino (OFFERTE).
function prezzoIngrediente(i) {
  const off = OFFERTE[i.nome.toLowerCase()];
  return off != null ? i.prezzo * off : i.prezzo;
}
function costoRicetta(r, prefs) {
  const m = getSupermercato(prefs.supermercato).moltiplicatore;
  const base = r.ingredienti.reduce((s, i) => s + prezzoIngrediente(i), 0);
  return base * fattoreScala(prefs) * m;
}

/* ---------------------- GENERAZIONE PIANO ---------------------- */
function rigeneraTutto() {
  if (STATE.celle && STATE.celle.length &&
      !confirm("Rigenero tutto il piano da capo?\nPerderai i piatti cambiati a mano, le spunte e i \"ne ho già\".")) return;
  generaPiano();
}
function generaPiano() {
  const prefs = leggiPreferenze();
  if (prefs.slot.length === 0) { alert("Seleziona almeno un pasto da pianificare."); return; }
  prefs.planId = "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); // id unico del piano
  prefs.rev = 0; // revisione: cresce ad ogni modifica (cambio piatto, "ne ho già", spunta)

  const pools = {};
  for (const slot of prefs.slot) {
    pools[slot] = RICETTE.filter(r => ricettaValida(r, slot, prefs));
    if (pools[slot].length === 0) {
      alert(`Nessuna ricetta per "${SLOT[slot]}" con questi filtri.\nProva ad allentare dieta, tipi di piatto, allergeni, elettrodomestici o ingredienti da evitare.`);
      return;
    }
  }

  // "Cucina la sera, pranzo pronto domani": la cena del giorno N diventa il pranzo
  // del giorno N+1 (stesso piatto = una cucinata, due pasti). Attivo solo se pianifichi
  // sia pranzo sia cena. Le cene "trasportate" devono valere anche come pranzo (ufficio).
  const cucinaDoppio = prefs.cucinaDoppio && prefs.slot.includes("pranzo") && prefs.slot.includes("cena");
  const poolCenaPranzo = cucinaDoppio ? pools["cena"].filter(r => ricettaValida(r, "pranzo", prefs)) : null;

  // La colazione pesa meno di pranzo/cena: così pranzo e cena ricevono più
  // budget e possono ospitare piatti più proteici restando nel totale.
  const PESO = { colazione: 0.7, pranzo: 1.35, cena: 1.35 };
  let pesoRimanente = 0;
  for (let g = 0; g < prefs.giorni; g++) for (const slot of prefs.slot) pesoRimanente += (PESO[slot] || 1);

  const usage = {};
  const celle = [];
  let speso = 0;
  let avanzoCena = null; // ricettaId della cena di ieri, da servire oggi a pranzo
  for (let g = 0; g < prefs.giorni; g++) {
    const usateOggi = [];
    const ultimoGiorno = g === prefs.giorni - 1;
    for (const slot of prefs.slot) {
      const w = PESO[slot] || 1;

      if (cucinaDoppio && slot === "pranzo" && avanzoCena) {
        // Pranzo = avanzo della cena di ieri: stesso piatto, nessuna nuova scelta.
        usateOggi.push(avanzoCena);
        speso += costoRicetta(ricetta(avanzoCena), prefs);
        pesoRimanente -= w;
        celle.push({ giorno: g, slot, ricettaId: avanzoCena, avanzo: true });
        continue;
      }

      // Le cene che faranno da pranzo domani: scegli tra quelle valide per entrambi.
      const portaDomani = cucinaDoppio && slot === "cena" && !ultimoGiorno;
      const pool = (portaDomani && poolCenaPranzo.length) ? poolCenaPranzo : pools[slot];
      const target = pesoRimanente > 0 ? Math.max(0, (prefs.budget - speso) * (w / pesoRimanente)) : 0;
      const r = scegliRicetta(pool, usage, usateOggi, target, prefs);
      usage[r.id] = (usage[r.id] || 0) + 1;
      usateOggi.push(r.id);
      speso += costoRicetta(r, prefs);
      pesoRimanente -= w;
      const cella = { giorno: g, slot, ricettaId: r.id };
      if (portaDomani) { cella.portaDomani = true; avanzoCena = r.id; }
      celle.push(cella);
    }
  }

  STATE = { prefs, celle, spuntati: {}, giaInCasa: {}, raggruppa: STATE.raggruppa, filtroPasto: "tutti" };
  salvaInMemoria();
  abilitaPiano();
  renderTutto();
  mostraSchermata("piano");
}

/* Sceglie una ricetta dentro al "target" di spesa, privilegiando le meno usate. */
function scegliRicetta(pool, usage, evita, target, prefs) {
  let candidati = pool.filter(r => !evita.includes(r.id));
  if (candidati.length === 0) candidati = pool;
  let set = candidati.filter(r => costoRicetta(r, prefs) <= target);
  if (set.length === 0) {
    const costoMin = Math.min(...candidati.map(r => costoRicetta(r, prefs)));
    set = candidati.filter(r => costoRicetta(r, prefs) <= costoMin + 0.01);
  }
  // Prima si applica l'obiettivo nutrizionale (priorità proteine o leggerezza),
  // poi tra i candidati si privilegiano i meno usati (varietà).
  let set2 = set;
  if (prefs.obiettivo === "proteico") {
    const maxP = Math.max(...set.map(r => r.nutrizione.proteine));
    set2 = set.filter(r => r.nutrizione.proteine >= maxP - 6);
  } else if (prefs.obiettivo === "leggero") {
    const minK = Math.min(...set.map(r => r.nutrizione.kcal));
    set2 = set.filter(r => r.nutrizione.kcal <= minK + 60);
  }
  const minUso = Math.min(...set2.map(r => usage[r.id] || 0));
  const menoUsate = set2.filter(r => (usage[r.id] || 0) === minUso);
  return menoUsate[Math.floor(Math.random() * menoUsate.length)];
}

function ricetta(id) { return RICETTE.find(r => r.id === id); }

function rigeneraPiatto(giorno, slot) {
  const prefs = STATE.prefs;
  const cella = STATE.celle.find(c => c.giorno === giorno && c.slot === slot);
  if (!cella || cella.avanzo) return; // gli avanzi sono legati alla cena: non si rigenerano da soli
  // Se è una cena che diventa pranzo domani, scegli tra le valide per entrambi i pasti.
  const linkPranzo = cella.portaDomani
    ? STATE.celle.find(c => c.giorno === giorno + 1 && c.slot === "pranzo" && c.avanzo)
    : null;
  let pool = RICETTE.filter(r => ricettaValida(r, slot, prefs));
  if (linkPranzo) pool = pool.filter(r => ricettaValida(r, "pranzo", prefs));
  const alternative = pool.filter(r => r.id !== cella.ricettaId);
  if (!alternative.length) { alert("Non ci sono altri piatti per questo pasto con i tuoi filtri attuali."); return; }
  const scelta = alternative;
  cella.ricettaId = scelta[Math.floor(Math.random() * scelta.length)].id;
  if (linkPranzo) linkPranzo.ricettaId = cella.ricettaId; // tieni in sync il pranzo di domani
  potaChiaviOrfane(); // togli "ne ho già"/spunte di ingredienti non più nel piano
  segnaModifica();
  salvaInMemoria();
  renderTutto();
}

/* Rimuove dalle spunte e da "ne ho già" le voci non più presenti nel piano,
   così una quantità "ne ho già" non riemerge a sorpresa su un piatto diverso. */
function potaChiaviOrfane() {
  const valide = new Set(Object.keys(aggregaSpesa()));
  ["giaInCasa", "spuntati"].forEach(campo => {
    if (!STATE[campo]) return;
    Object.keys(STATE[campo]).forEach(k => { if (!valide.has(k)) delete STATE[campo][k]; });
  });
}

function abilitaPiano() {
  document.getElementById("tab-piano").disabled = false;
  document.getElementById("tab-spesa").disabled = false;
}
function renderTutto() {
  renderRiepilogo();
  renderBudget();
  renderFiltroPasti();
  renderPiano();
  renderSpesa();
}

/* ---------------------- RENDER RIEPILOGO ---------------------- */
function renderRiepilogo() {
  const p = STATE.prefs;
  const totale = STATE.celle.reduce((s, c) => s + costoRicetta(ricetta(c.ricettaId), p), 0);
  const tipoLabel = p.slot.map(s => SLOT[s]).join(p.slot.length === 2 ? " e " : ", ");
  const stat = (ico, val, et) => `<div class="stat"><div class="ico">${ico}</div><b>${val}</b><small>${et}</small></div>`;
  document.getElementById("riepilogo").innerHTML =
    stat("🏪", getSupermercato(p.supermercato).nome, "Supermercato") +
    stat("💶", `${euro(totale)} / ${euro(p.budget)}`, "Costo") +
    stat("👥", p.persone, p.persone === 1 ? "Persona" : "Persone") +
    stat("📅", STATE.celle.length, "Pasti") +
    stat("🍽️", tipoLabel, "Tipo");
}

/* ---------------------- RENDER BUDGET ---------------------- */
function renderBudget() {
  const p = STATE.prefs;
  const totale = STATE.celle.reduce((s, c) => s + costoRicetta(ricetta(c.ricettaId), p), 0);
  const over = totale > p.budget;
  document.getElementById("budget-spesa").textContent = euro(totale);
  document.getElementById("budget-max").textContent = euro(p.budget);
  const barra = document.getElementById("barra-budget");
  barra.classList.toggle("over", over);
  barra.querySelector("span").style.width = Math.min(100, (totale / p.budget) * 100) + "%";

  const msg = document.getElementById("budget-msg");
  const nome = getSupermercato(p.supermercato).nome;
  if (over) {
    msg.textContent = `Stima a ${nome}: sei sopra il budget di ${euro(totale - p.budget)}. Alza il budget o usa ↻ per cambiare i piatti più cari.`;
    msg.style.color = "var(--rosso)";
  } else {
    msg.textContent = `Stima a ${nome} · ti restano ${euro(p.budget - totale)} di margine. (Prezzi indicativi)`;
    msg.style.color = "var(--grigio)";
  }
}

/* ---------------------- FILTRO PASTI ---------------------- */
function renderFiltroPasti() {
  const cont = document.getElementById("filtro-pasti");
  cont.innerHTML = "";
  const voci = ["tutti", ...STATE.prefs.slot];
  voci.forEach(v => {
    const b = document.createElement("button");
    b.className = "tab" + (STATE.filtroPasto === v ? " active" : "");
    b.textContent = v === "tutti" ? "Tutti" : SLOT[v];
    b.addEventListener("click", () => { STATE.filtroPasto = v; salvaInMemoria(); renderFiltroPasti(); renderPiano(); });
    cont.appendChild(b);
  });
}

/* ---------------------- RENDER PIANO ---------------------- */
function renderPiano() {
  const griglia = document.getElementById("griglia-giorni");
  griglia.innerHTML = "";
  const p = STATE.prefs;
  const slotMostrati = STATE.filtroPasto === "tutti" ? p.slot : [STATE.filtroPasto];

  for (let g = 0; g < p.giorni; g++) {
    const et = etichettaGiorno(g);
    const div = document.createElement("div");
    div.className = "giorno";
    div.innerHTML = `<h3>${et.nome} <small style="font-weight:400;color:var(--grigio)">${et.data}</small></h3>`;
    slotMostrati.forEach(slot => {
      const cella = STATE.celle.find(c => c.giorno === g && c.slot === slot);
      if (!cella) return;
      const r = ricetta(cella.ricettaId);
      if (!r) return; // ricetta non disponibile (es. personale mancante): salta senza crashare
      const pasto = document.createElement("div");
      pasto.className = "pasto";
      const nota = cella.avanzo
        ? `<div class="nota-pasto avanzo">↩ avanzo della cena di ieri (solo da scaldare)</div>`
        : (cella.portaDomani ? `<div class="nota-pasto porta">→ cucinane in più: è anche il pranzo di domani</div>` : "");
      const azione = cella.avanzo ? "" : `<button class="rigenera" title="Cambia piatto">↻</button>`;
      pasto.innerHTML = `
        <div class="foto">${r.emoji || "🍽️"}</div>
        <div class="info">
          <div class="slot">${SLOT[slot]}</div>
          <div class="nome">${r.nome}</div>
          ${nota}
          <div class="mini"><span>⏱ ${r.tempo} min</span><span>${euro(costoRicetta(r, p))}</span><span>${r.nutrizione.kcal} kcal</span></div>
        </div>
        ${azione}`;
      pasto.querySelector(".nome").addEventListener("click", () => apriRicetta(r.id));
      const btnRig = pasto.querySelector(".rigenera");
      if (btnRig) btnRig.addEventListener("click", () => rigeneraPiatto(g, slot));
      div.appendChild(pasto);
    });
    griglia.appendChild(div);
  }
}

/* Etichetta del giorno g: nome del giorno + data, partendo dalla data di generazione. */
const MESI_ABBR = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
function dataInizioPiano() {
  const iso = STATE.prefs && STATE.prefs.dataInizio;
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const t = new Date(); t.setHours(0, 0, 0, 0); return t;
}
function etichettaGiorno(g) {
  const base = dataInizioPiano();
  const d = new Date(base); d.setDate(base.getDate() + g);
  return { nome: GIORNI[(d.getDay() + 6) % 7], data: `${d.getDate()} ${MESI_ABBR[d.getMonth()]}` };
}

/* ---------------------- RICETTARIO ---------------------- */
let ricFiltroSlot = "tutti";

function renderRicettarioFiltro() {
  const cont = document.getElementById("ric-filtro");
  cont.innerHTML = "";
  ["tutti", "colazione", "pranzo", "cena"].forEach(v => {
    const b = document.createElement("button");
    b.className = "tab" + (ricFiltroSlot === v ? " active" : "");
    b.textContent = v === "tutti" ? "Tutti" : SLOT[v];
    b.addEventListener("click", () => { ricFiltroSlot = v; renderRicettarioFiltro(); renderRicettario(); });
    cont.appendChild(b);
  });
}

function renderRicettario() {
  const q = (document.getElementById("ric-cerca").value || "").trim().toLowerCase();
  const lista = RICETTE
    .filter(r => ricFiltroSlot === "tutti" || r.slot.includes(ricFiltroSlot))
    .filter(r => !q || r.nome.toLowerCase().includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const cont = document.getElementById("lista-ricettario");
  cont.innerHTML = "";
  lista.forEach(r => {
    const tag = r.tipi.slice(0, 2).map(t => TIPI_PASTO[t]).join(" · ");
    const badge = r.utente ? `<span class="badge-utente">tua</span>`
      : (r.importata ? `<span class="badge-utente" style="background:var(--verde)">da link</span>` : "");
    const div = document.createElement("div");
    div.className = "ric-card";
    div.innerHTML = `
      <div class="foto">${r.emoji || "🍽️"}</div>
      <div style="flex:1; min-width:0">
        <div class="nome">${r.nome}${badge}</div>
        <div class="mini"><span>⏱ ${r.tempo} min</span><span>${r.nutrizione.kcal} kcal</span><span>${r.nutrizione.proteine}g prot</span></div>
        <div class="mini">${tag}</div>
      </div>
      ${r.utente ? '<button class="ric-del" title="Elimina ricetta">🗑</button>' : ""}`;
    div.addEventListener("click", () => apriRicetta(r.id));
    const del = div.querySelector(".ric-del");
    if (del) del.addEventListener("click", e => { e.stopPropagation(); eliminaRicettaUtente(r.id); });
    cont.appendChild(div);
  });

  const filtrato = q || ricFiltroSlot !== "tutti";
  document.getElementById("ric-conteggio").textContent =
    `${lista.length} ricett${lista.length === 1 ? "a" : "e"}` + (filtrato ? ` (su ${RICETTE.length})` : " in libreria");
}

/* ---------------------- RICETTE IMPORTATE DA LINK ---------------------- */
function caricaRicetteImportate() {
  if (typeof RICETTE_IMPORTATE === "undefined") return;
  RICETTE_IMPORTATE.forEach(r => { if (r && r.id && !RICETTE.some(x => x.id === r.id)) RICETTE.push(r); });
}

/* Ricette personali ricevute dentro un link condiviso: persistite così il piano
   condiviso non si rompe al refresh sul dispositivo del destinatario. */
const CHIAVE_RICETTE_LINK = "menu_ricette_link";
function caricaRicetteDaLink() {
  try {
    JSON.parse(localStorage.getItem(CHIAVE_RICETTE_LINK) || "[]")
      .forEach(r => { if (r && r.id && !RICETTE.some(x => x.id === r.id)) RICETTE.push(r); });
  } catch (e) {}
}
function salvaRicetteDaLink(extra) {
  extra.forEach(r => { if (r && r.id && !RICETTE.some(x => x.id === r.id)) RICETTE.push(r); });
  try {
    const arr = JSON.parse(localStorage.getItem(CHIAVE_RICETTE_LINK) || "[]");
    const ids = new Set(arr.map(r => r.id));
    extra.forEach(r => { if (r && r.id && !ids.has(r.id)) { arr.push(r); ids.add(r.id); } });
    localStorage.setItem(CHIAVE_RICETTE_LINK, JSON.stringify(arr));
  } catch (e) {}
}

/* ---------------------- RICETTE PERSONALI ---------------------- */
const CHIAVE_RICETTE_UTENTE = "menu_ricette_utente";

function caricaRicetteUtente() {
  try {
    const arr = JSON.parse(localStorage.getItem(CHIAVE_RICETTE_UTENTE) || "[]");
    arr.forEach(r => { if (r && r.id && !RICETTE.some(x => x.id === r.id)) RICETTE.push(r); });
  } catch (e) {}
}
function salvaRicetteUtente() {
  try { localStorage.setItem(CHIAVE_RICETTE_UTENTE, JSON.stringify(RICETTE.filter(r => r.utente))); } catch (e) {}
}

function buildFormRicetta() {
  const eq = document.getElementById("nr-equip");
  eq.innerHTML = "";
  Object.entries(ELETTRODOMESTICI).forEach(([k, v]) => {
    const c = document.createElement("span");
    c.className = "chip"; c.dataset.equip = k; c.textContent = v.emoji + " " + v.nome;
    c.addEventListener("click", () => c.classList.toggle("sel"));
    eq.appendChild(c);
  });
  resetRigheIngredienti();
  document.querySelectorAll("#nr-slot .chip").forEach(c => c.addEventListener("click", () => c.classList.toggle("sel")));
  document.getElementById("nr-piccante").addEventListener("click", e => e.currentTarget.classList.toggle("sel"));
  document.getElementById("nr-fresco").addEventListener("click", e => e.currentTarget.classList.toggle("sel"));
  document.getElementById("nr-add-ing").addEventListener("click", aggiungiRigaIngrediente);
  document.getElementById("nr-salva").addEventListener("click", salvaRicettaUtente);
  document.getElementById("btn-mostra-form").addEventListener("click", () => {
    const f = document.getElementById("form-ricetta");
    const visibile = f.style.display !== "none";
    f.style.display = visibile ? "none" : "block";
    document.getElementById("btn-mostra-form").textContent = visibile ? "➕ Aggiungi una ricetta" : "✕ Chiudi";
  });
}

function aggiungiRigaIngrediente() {
  const cont = document.getElementById("nr-ingredienti");
  const row = document.createElement("div");
  row.className = "nr-ing-row";
  const opts = CATEGORIE.map(c => `<option value="${c}">${c}</option>`).join("");
  row.innerHTML = `
    <input class="nr-ing-nome" placeholder="ingrediente" style="flex:2;min-width:120px">
    <select class="nr-ing-cat" style="flex:1.5;min-width:130px">${opts}</select>
    <input class="nr-ing-qta" placeholder="es. 200 g" style="flex:1;min-width:80px">
    <input class="nr-ing-prezzo" type="number" step="0.01" min="0" placeholder="€" style="width:74px">
    <button class="nr-ing-del" type="button" title="Rimuovi">✕</button>`;
  row.querySelector(".nr-ing-del").addEventListener("click", () => row.remove());
  cont.appendChild(row);
}
function resetRigheIngredienti() {
  document.getElementById("nr-ingredienti").innerHTML = "";
  for (let i = 0; i < 3; i++) aggiungiRigaIngrediente();
}

/* Parole chiave per riconoscere allergeni e tipo di alimento dai nomi ingredienti */
const KW_ALLERGENI = {
  glutine: ["pane","pasta","spaghet","fusilli","maniche","penne","couscous","cuscus","farro","orzo","pangrattato","fette","piadina","piada","baguette","muesli","avena","farina","grano","seitan","cracker","biscott","pizza","gnocch","tortellini","ravioli","wurst"],
  lattosio: ["latte","mozzarella","ricotta","feta","parmigiano","yogurt","panna","burro","formagg","edamer","emmental","stracchino","mascarpone","scamorza","provola","gorgonzola","grana","pecorino","besciamella"],
  uova: ["uovo","uova","maionese","frittata","albume"],
  pesce: ["tonno","salmone","merluzzo","orata","branzino","pesce","acciugh","sgombro","platessa","bastoncini","nasello","spigola","trota"],
  crostacei: ["gamber","scampi","granchio","crostace","mazzancoll","aragosta","astice"],
  frutta_a_guscio: ["mandorl","noci","nocciol","arachid","pistacch","pinoli","anacard","pesto"],
  soia: ["tofu","soia","edamame","tempeh","tamari"],
};
const KW_CARNE = ["pollo","tacchino","manzo","vitello","maiale","prosciutto","salam","salsicc","speck","bresaola","carne","macinato","mortadella","cotto","bacon","pancetta","hamburger","spezzatino","arrosto","agnello","coniglio","anatra","wurst"];

function rilevaAllergeni(ingredienti) {
  const trovati = new Set();
  ingredienti.forEach(i => {
    const n = i.nome.toLowerCase();
    Object.entries(KW_ALLERGENI).forEach(([all, kws]) => { if (kws.some(k => n.includes(k))) trovati.add(all); });
  });
  return [...trovati];
}
function rilevaDiete(ingredienti, allergeni, proteine) {
  const nomi = ingredienti.map(i => i.nome.toLowerCase());
  const has = kws => nomi.some(n => kws.some(k => n.includes(k)));
  const carne = has(KW_CARNE);
  const pesce = has(KW_ALLERGENI.pesce) || has(KW_ALLERGENI.crostacei);
  const uova = allergeni.includes("uova");
  const latte = allergeni.includes("lattosio");
  const miele = nomi.some(n => n.includes("miele"));
  const diete = [];
  if (!carne && !pesce) diete.push("vegetariano");
  if (!carne && !pesce && !uova && !latte && !miele) diete.push("vegano");
  if (!carne && pesce) diete.push("pescetariano");
  if (!allergeni.includes("glutine")) diete.push("senza_glutine");
  if (!allergeni.includes("lattosio")) diete.push("senza_lattosio");
  if (proteine >= 28) diete.push("iperproteico");
  return diete;
}
function autoTipi(nutr, tempo, costoPorzione) {
  const t = [];
  if (tempo && tempo <= 20) t.push("veloce");
  if (nutr.proteine >= 24) t.push("proteico");
  if (nutr.kcal && nutr.kcal <= 420 && (!nutr.grassi || nutr.grassi <= 18)) t.push("sano");
  if (costoPorzione > 0 && costoPorzione <= 1.80) t.push("economico");
  if (!t.length) t.push("classico");
  return t;
}

function salvaRicettaUtente() {
  const msg = document.getElementById("nr-msg");
  const nome = document.getElementById("nr-nome").value.trim();
  const slot = [...document.querySelectorAll("#nr-slot .chip.sel")].map(c => c.dataset.slot);
  const ingredienti = [...document.querySelectorAll("#nr-ingredienti .nr-ing-row")].map(r => ({
    nome: r.querySelector(".nr-ing-nome").value.trim(),
    categoria: r.querySelector(".nr-ing-cat").value,
    quantita: r.querySelector(".nr-ing-qta").value.trim() || "q.b.",
    prezzo: parseFloat(r.querySelector(".nr-ing-prezzo").value) || 0,
  })).filter(i => i.nome);

  if (!nome) return errMsg(msg, "Dai un nome alla ricetta.");
  if (!slot.length) return errMsg(msg, "Scegli almeno un pasto (colazione/pranzo/cena).");
  if (!ingredienti.length) return errMsg(msg, "Inserisci almeno un ingrediente.");

  const nutr = {
    kcal: parseInt(document.getElementById("nr-kcal").value) || 0,
    proteine: parseInt(document.getElementById("nr-prot").value) || 0,
    carboidrati: parseInt(document.getElementById("nr-carb").value) || 0,
    grassi: parseInt(document.getElementById("nr-gras").value) || 0,
  };
  const tempo = parseInt(document.getElementById("nr-tempo").value) || 20;
  const equip = [...document.querySelectorAll("#nr-equip .chip.sel")].map(c => c.dataset.equip);
  const costoPorzione = ingredienti.reduce((s, i) => s + i.prezzo, 0) / 2;
  const allergeni = rilevaAllergeni(ingredienti);
  const diete = rilevaDiete(ingredienti, allergeni, nutr.proteine);
  const tipi = autoTipi(nutr, tempo, costoPorzione);
  const passi = document.getElementById("nr-passi").value.split("\n").map(s => s.trim()).filter(Boolean);

  RICETTE.push({
    id: "u_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36),
    nome,
    emoji: document.getElementById("nr-emoji").value.trim() || "🍽️",
    tempo, slot,
    attrezzatura: equip,
    piccante: document.getElementById("nr-piccante").classList.contains("sel"),
    riscaldabile: !document.getElementById("nr-fresco").classList.contains("sel"),
    tipi, diete, allergeni,
    nutrizione: nutr,
    ingredienti,
    passi: passi.length ? passi : ["(procedimento non inserito)"],
    utente: true,
  });
  salvaRicetteUtente();
  renderRicettario();
  resetForm();

  const etTipi = tipi.map(t => TIPI_PASTO[t]).join(", ");
  const etAll = allergeni.length ? allergeni.map(a => ALLERGENI[a]).join(", ") : "nessuno";
  msg.style.color = "var(--verde-scuro)";
  msg.innerHTML = `✅ <b>${nome}</b> salvata e categorizzata!<br>🏷️ Tag: ${etTipi}<br>⚠️ Allergeni rilevati: ${etAll}` +
    (costoPorzione > 0 ? `<br>💶 Costo stimato: ${euro(costoPorzione)}/porzione` : "");
}

function errMsg(el, t) { el.style.color = "var(--rosso)"; el.textContent = "⚠️ " + t; }
function resetForm() {
  ["nr-nome", "nr-kcal", "nr-prot", "nr-carb", "nr-gras", "nr-passi"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("nr-emoji").value = "🍽️";
  document.getElementById("nr-tempo").value = "20";
  document.getElementById("nr-piccante").classList.remove("sel");
  document.getElementById("nr-fresco").classList.remove("sel");
  document.querySelectorAll("#nr-equip .chip.sel").forEach(c => c.classList.remove("sel"));
  resetRigheIngredienti();
}

function eliminaRicettaUtente(id) {
  if (!confirm("Eliminare questa ricetta dal ricettario?")) return;
  const i = RICETTE.findIndex(r => r.id === id);
  if (i >= 0) RICETTE.splice(i, 1);
  salvaRicetteUtente();
  renderRicettario();
}

/* ---------------------- RENDER LISTA SPESA ---------------------- */
function inDispensa(nome, prefs) {
  return prefs.dispensa.some(d => nome.toLowerCase().includes(d));
}

/* Somma gli ingredienti di tutto il piano (saltando ciò che è già in dispensa),
   con quantità scalate per le persone e prezzo al supermercato scelto. */
function aggregaSpesa() {
  const p = STATE.prefs;
  const scala = fattoreScala(p);
  const m = getSupermercato(p.supermercato).moltiplicatore;
  const agg = {};
  STATE.celle.forEach(c => {
    const ric = ricetta(c.ricettaId);
    if (!ric) return; // ricetta non disponibile: salta senza crashare
    ric.ingredienti.forEach(ing => {
      if (inDispensa(ing.nome, p)) return; // già in casa: salta
      const key = ing.categoria + "|" + ing.nome;
      if (!agg[key]) agg[key] = { categoria: ing.categoria, nome: ing.nome, prezzo: 0, unita: {}, altri: [] };
      agg[key].prezzo += prezzoIngrediente(ing) * scala * m;
      const q = parseQta(ing.quantita);
      if (q.num !== null) agg[key].unita[q.unit] = (agg[key].unita[q.unit] || 0) + q.num * scala;
      else agg[key].altri.push(ing.quantita);
    });
  });
  // "Ne ho già a casa": per ogni voce calcola la quantità piena (unità principale) e
  // sottrai quanto già posseduto, riducendo quantità e prezzo in proporzione.
  Object.entries(agg).forEach(([key, v]) => {
    const unita = Object.keys(v.unita);
    v.unitaPrimaria = unita.length ? unita[0] : null;
    v.totaleOrig = v.unitaPrimaria != null ? v.unita[v.unitaPrimaria] : null;
    const owned = (STATE.giaInCasa && STATE.giaInCasa[key]) || 0;
    if (owned > 0 && v.unitaPrimaria != null) {
      const oldQ = v.unita[v.unitaPrimaria];
      const newQ = Math.max(0, oldQ - owned);
      if (oldQ > 0) v.prezzo = v.prezzo * (newQ / oldQ);
      v.unita[v.unitaPrimaria] = newQ;
      v.giaInCasa = owned;
      const restano = Object.values(v.unita).some(x => x > 0) || (v.altri && v.altri.length);
      if (!restano) v.esaurito = true;
    }
  });
  return agg;
}

function renderSpesa() {
  const p = STATE.prefs;
  const agg = aggregaSpesa();

  const cont = document.getElementById("lista-spesa");
  cont.innerHTML = "";
  let totale = 0;
  document.getElementById("tg-raggruppa").checked = STATE.raggruppa;

  if (STATE.raggruppa) {
    const perReparto = {};
    Object.values(agg).forEach(v => { (perReparto[v.categoria] ||= []).push(v); });
    CATEGORIE.forEach(cat => {
      const voci = perReparto[cat];
      if (!voci || !voci.length) return;
      voci.sort((a, b) => a.nome.localeCompare(b.nome));
      const blocco = document.createElement("div");
      blocco.className = "reparto";
      blocco.innerHTML = `<h3>${cat}</h3>`;
      voci.forEach(v => { totale += v.prezzo; blocco.appendChild(rigaVoce(v)); });
      cont.appendChild(blocco);
    });
  } else {
    const voci = Object.values(agg).sort((a, b) => a.nome.localeCompare(b.nome));
    const blocco = document.createElement("div");
    blocco.className = "reparto";
    voci.forEach(v => { totale += v.prezzo; blocco.appendChild(rigaVoce(v)); });
    cont.appendChild(blocco);
  }

  document.getElementById("spesa-sub").textContent =
    `${getSupermercato(p.supermercato).nome} · totale stimato ${euro(totale)} per ${p.persone} person${p.persone === 1 ? "a" : "e"} (${p.giorni} giorn${p.giorni === 1 ? "o" : "i"})`;
}

function rigaVoce(v) {
  const key = v.categoria + "|" + v.nome;
  const riga = document.createElement("div");

  // Voce interamente "già in casa": niente da comprare.
  if (v.esaurito) {
    riga.className = "voce esaurito";
    riga.innerHTML = `
      <span class="testo"><b>${v.nome}</b> <small style="color:var(--verde-scuro)">ce l'hai già a casa</small></span>
      <span class="riga-azioni"><button class="btn-casa" title="Modifica quanto hai già">🏠</button><span class="prezzo">${euro(0)}</span></span>`;
    riga.querySelector(".btn-casa").addEventListener("click", () => chiediGiaInCasa(v, key));
    return riga;
  }

  const spuntato = !!STATE.spuntati[key];
  const qta = formattaQuantita(v);
  const notaCasa = v.giaInCasa > 0 ? ` <small style="color:var(--ambra)">(ne hai già ${formattaNumero(v.giaInCasa)})</small>` : "";
  riga.className = "voce" + (spuntato ? " check" : "");
  riga.innerHTML = `
    <label>
      <input type="checkbox" ${spuntato ? "checked" : ""}>
      <span class="testo"><b>${v.nome}</b>${qta ? " · " + qta : ""}${notaCasa}</span>
    </label>
    <span class="riga-azioni">
      <button class="btn-casa" title="Ne ho già un po' a casa">🏠</button>
      <span class="prezzo">${euro(v.prezzo)}</span>
    </span>`;
  riga.querySelector("input").addEventListener("change", e => {
    STATE.spuntati[key] = e.target.checked;
    riga.classList.toggle("check", e.target.checked);
    segnaModifica();
    salvaInMemoria();
  });
  riga.querySelector(".btn-casa").addEventListener("click", () => chiediGiaInCasa(v, key));
  return riga;
}

/* Chiede quanta quantità è già in casa e aggiorna la lista (quantità + prezzo). */
function chiediGiaInCasa(v, key) {
  if (v.unitaPrimaria == null) {
    alert(`Per «${v.nome}» usa il campo "Ingredienti che hai già in casa" nelle Preferenze (questa voce non ha una quantità numerica).`);
    return;
  }
  const u = v.unitaPrimaria ? " " + v.unitaPrimaria : "";
  const attuale = (STATE.giaInCasa && STATE.giaInCasa[key]) || 0;
  const risp = prompt(`«${v.nome}» — quanto ne hai GIÀ a casa?\n(in lista ne servono ${formattaNumero(v.totaleOrig)}${u})`, attuale || "");
  if (risp === null) return;
  const n = Math.max(0, parseFloat(String(risp).replace(",", ".")) || 0);
  if (!STATE.giaInCasa) STATE.giaInCasa = {};
  if (n <= 0) delete STATE.giaInCasa[key];
  else STATE.giaInCasa[key] = n; // salva la quantità reale posseduta (il taglio avviene in aggregaSpesa)
  segnaModifica();
  salvaInMemoria();
  renderSpesa();
}

function formattaQuantita(v) {
  const parti = [];
  Object.entries(v.unita).forEach(([u, somma]) => parti.push(formattaNumero(somma) + (u ? " " + u : "")));
  [...new Set(v.altri)].forEach(a => parti.push(a));
  return parti.join(" + ");
}

/* ---------------------- MODAL RICETTA ---------------------- */
function apriRicetta(id) {
  const r = ricetta(id);
  const p = STATE.prefs || leggiPreferenze(); // dal ricettario può non esserci ancora un piano
  const scala = fattoreScala(p);
  const m = getSupermercato(p.supermercato).moltiplicatore;
  const tagTipi = r.tipi.map(t => `<span class="tag">${TIPI_PASTO[t]}</span>`).join("");
  const tagDiete = r.diete.map(d => `<span class="tag">${DIETE[d]}</span>`).join("");

  const ingHtml = r.ingredienti.map(i => {
    const q = parseQta(i.quantita);
    const qta = q.num !== null ? formattaNumero(q.num * scala) + (q.unit ? " " + q.unit : "") : i.quantita;
    const casa = inDispensa(i.nome, p) ? ' <span class="tag">già in casa</span>' : "";
    return `<li>${i.nome} — ${qta} <span style="color:var(--grigio)">(${euro(prezzoIngrediente(i) * scala * m)})</span>${casa}</li>`;
  }).join("");

  document.getElementById("modal-ricetta").innerHTML = `
    <button class="chiudi" onclick="chiudiModal()">×</button>
    <div class="copertina">${r.emoji || "🍽️"}</div>
    <h2>${r.nome}</h2>
    <div style="color:var(--grigio);margin-bottom:8px">⏱ ${r.tempo} min</div>
    ${r.fonte ? `<div style="margin-bottom:8px"><a href="${r.fonte}" target="_blank" rel="noopener" style="color:var(--verde-scuro);font-weight:600">↗ Apri la ricetta originale</a></div>` : ""}
    <div>${tagTipi}${tagDiete}</div>
    <div class="nutri">
      <div><b>${r.nutrizione.kcal}</b><small>kcal</small></div>
      <div><b>${r.nutrizione.proteine}g</b><small>proteine</small></div>
      <div><b>${r.nutrizione.carboidrati}g</b><small>carbo</small></div>
      <div><b>${r.nutrizione.grassi}g</b><small>grassi</small></div>
    </div>
    <h3>Ingredienti <small style="color:var(--grigio);font-weight:400">(per ${p.persone} person${p.persone === 1 ? "a" : "e"})</small></h3>
    <ul>${ingHtml}</ul>
    <h3>Preparazione</h3>
    <ol>${r.passi.map(s => `<li>${s}</li>`).join("")}</ol>
    <div class="totale-stima">Costo piatto stimato: <b>${euro(costoRicetta(r, p))}</b></div>`;
  document.getElementById("overlay").classList.add("attiva");
}
function chiudiModal() { document.getElementById("overlay").classList.remove("attiva"); }

/* ---------------------- UTILITÀ ---------------------- */
function euro(n) { return "€" + n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formattaNumero(n) { return n.toLocaleString("it-IT", { maximumFractionDigits: 1 }); }
function parseQta(q) {
  const s = String(q).trim();
  const m = s.match(/^(\d+\/\d+|\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { num: null, unit: s };
  let num;
  if (m[1].includes("/")) { const [a, b] = m[1].split("/"); num = parseFloat(a) / parseFloat(b); }
  else num = parseFloat(m[1].replace(",", "."));
  return { num, unit: m[2].trim() };
}

/* ---------------------- CONDIVISIONE LISTA ---------------------- */
/* La lista vive nel browser di chi crea il piano. Per farla vedere a un'altra
   persona la "impacchettiamo" dentro al link (#lista=...): chi lo apre vede
   esattamente questa spesa, con le caselle da spuntare. Nessun server. */

function b64UtfEncode(s) { return btoa(unescape(encodeURIComponent(s))); }
function b64UtfDecode(b) { return decodeURIComponent(escape(atob(b))); }

function linkCondivisione() {
  if (!STATE.prefs || !STATE.celle.length) return null;
  // Le ricette di libreria viaggiano già col sito; includiamo per intero solo
  // le ricette personali (utente), così il link funziona su qualunque telefono.
  const base = new Set(RICETTE.filter(r => !r.utente).map(r => r.id));
  const extra = [...new Set(STATE.celle.map(c => c.ricettaId))]
    .filter(id => !base.has(id)).map(id => ricetta(id)).filter(Boolean);
  const payload = { v: 1, prefs: STATE.prefs, celle: STATE.celle, extra,
    spuntati: STATE.spuntati || {}, giaInCasa: STATE.giaInCasa || {} };
  const code = b64UtfEncode(JSON.stringify(payload))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return location.origin + location.pathname + "#lista=" + code;
}

function inviaWhatsApp() {
  const url = linkCondivisione();
  if (!url) return alert("Genera prima un piano.");
  const msg = `🛒 Ecco la lista della spesa! Aprila qui:\n${url}`;
  window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
}
async function copiaLink() {
  const url = linkCondivisione();
  if (!url) return alert("Genera prima un piano.");
  try { await navigator.clipboard.writeText(url); alert("🔗 Link copiato! Incollalo dove vuoi."); }
  catch (e) { prompt("Copia il link e mandalo su WhatsApp:", url); }
}
async function copiaListaTesto() {
  if (!STATE.prefs || !STATE.celle.length) return alert("Genera prima un piano.");
  const t = listaTesto();
  try { await navigator.clipboard.writeText(t); alert("📋 Lista copiata come testo!"); }
  catch (e) { prompt("Copia la lista:", t); }
}

/* Versione testuale della lista (per incollarla in chat senza aprire il link). */
function listaTesto() {
  const p = STATE.prefs;
  const agg = aggregaSpesa();
  const perReparto = {};
  let tot = 0;
  Object.values(agg).forEach(v => { (perReparto[v.categoria] ||= []).push(v); tot += v.prezzo; });
  const out = [`🛒 LISTA DELLA SPESA — ${getSupermercato(p.supermercato).nome}`, ""];
  CATEGORIE.forEach(cat => {
    const voci = perReparto[cat];
    if (!voci) return;
    out.push(cat.toUpperCase());
    voci.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(v => {
      if (v.esaurito) return; // ce l'hai già: non serve comprarlo
      const q = formattaQuantita(v);
      const casa = v.giaInCasa > 0 ? ` (ne hai già ${formattaNumero(v.giaInCasa)})` : "";
      out.push(`- ${v.nome}${q ? " · " + q : ""}${casa}`);
    });
    out.push("");
  });
  out.push(`Totale stimato: ${euro(tot)} · ${p.persone} person${p.persone === 1 ? "a" : "e"}`);
  return out.join("\n");
}

/* Apre la lista ricevuta via link (#lista=...). Ritorna true se ce n'era una. */
function caricaDaLink() {
  const m = location.hash.match(/lista=([^&]+)/);
  if (!m) return false;
  try {
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const p = JSON.parse(b64UtfDecode(b64));
    if (!p || !p.prefs || !p.celle || !p.celle.length) return false;
    salvaRicetteDaLink(p.extra || []); // ricette personali nel link: aggiungile e persistile (reggono al refresh)
    if (!p.prefs.giorni) p.prefs.giorni = 7;
    // Questo dispositivo ha già questo piano (stesso planId) ed è uguale o più
    // aggiornato? Allora tieni la TUA copia (piatti cambiati, spunte, "ne ho già")
    // invece di sovrascriverla con la "foto" congelata del link.
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("menu_state") || "null"); } catch (e) {}
    const stessoPiano = saved && saved.prefs && p.prefs.planId && saved.prefs.planId === p.prefs.planId;
    if (stessoPiano && (saved.prefs.rev || 0) >= (p.prefs.rev || 0)) {
      STATE = {
        prefs: saved.prefs, celle: saved.celle,
        spuntati: saved.spuntati || {}, giaInCasa: saved.giaInCasa || {},
        raggruppa: saved.raggruppa !== false, filtroPasto: saved.filtroPasto || "tutti",
      };
    } else {
      STATE = { prefs: p.prefs, celle: p.celle, spuntati: p.spuntati || {}, giaInCasa: p.giaInCasa || {},
        raggruppa: saved ? saved.raggruppa !== false : true, filtroPasto: "tutti" };
    }
    normalizzaPrefs(STATE.prefs);
    abilitaPiano();
    renderTutto();
    mostraSchermata("spesa");
    const banner = document.getElementById("banner-condiviso");
    if (banner) banner.style.display = "block";
    salvaInMemoria();
    // Togli il #lista=... dall'URL: da ora questo dispositivo usa la sua copia salvata
    // (modificabile), così un refresh non ricarica più la "foto" condivisa di prima.
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    return true;
  } catch (e) { return false; }
}

/* ---------------------- SALVATAGGIO ---------------------- */
// Ripristina gli array attesi se un piano salvato/link è malformato (evita crash).
function normalizzaPrefs(p) {
  if (!p) return p;
  ["slot", "tipi", "allergeni", "equip", "evitare", "dispensa"].forEach(k => { if (!Array.isArray(p[k])) p[k] = []; });
  return p;
}
// Aumenta la "revisione" del piano: fa vincere la copia locale modificata quando
// si riapre un vecchio link condiviso (vedi caricaDaLink).
function segnaModifica() { if (STATE.prefs) STATE.prefs.rev = (STATE.prefs.rev || 0) + 1; }
function salvaInMemoria() {
  try { localStorage.setItem("menu_state", JSON.stringify(STATE)); } catch (e) {}
}
function caricaDaMemoria() {
  try {
    const raw = localStorage.getItem("menu_state");
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s.prefs || !s.celle || !s.celle.length) return;
    STATE = {
      prefs: s.prefs, celle: s.celle, spuntati: s.spuntati || {}, giaInCasa: s.giaInCasa || {},
      raggruppa: s.raggruppa !== false, filtroPasto: s.filtroPasto || "tutti",
    };
    const p = STATE.prefs;
    if (!p.giorni) p.giorni = 7; // compatibilità con piani salvati prima dei "giorni"
    normalizzaPrefs(p);
    if (!p.planId) { // piano creato prima del planId: assegnalo ora così è protetto anche lui
      p.planId = "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      p.rev = p.rev || 0;
      salvaInMemoria();
    }
    // Riapplica le preferenze ai controlli
    document.querySelectorAll("#super-grid .super").forEach(x => x.classList.toggle("sel", x.dataset.id === p.supermercato));
    document.getElementById("persone").value = p.persone;
    document.getElementById("giorni").value = p.giorni || 7;
    document.getElementById("budget").value = p.budget;
    document.getElementById("dieta").value = p.dieta || "";
    document.getElementById("obiettivo").value = p.obiettivo || "proteico";
    document.getElementById("evitare").value = (p.evitare || []).join(", ");
    document.getElementById("dispensa").value = (p.dispensa || []).join(", ");
    document.getElementById("tg-ufficio").checked = p.pranzoUfficio !== false;
    document.getElementById("tg-piccante").checked = p.nientePiccante !== false;
    document.getElementById("tg-stagione").checked = p.soloStagione !== false;
    document.getElementById("tg-batch").checked = p.cucinaDoppio !== false;
    document.querySelectorAll("#chips-slot .chip").forEach(c => c.classList.toggle("sel", p.slot.includes(c.dataset.slot)));
    document.querySelectorAll("#equip-grid .equip").forEach(c => c.classList.toggle("sel", (p.equip || []).includes(c.dataset.equip)));
    document.querySelectorAll("#chips-tipi .chip").forEach(c => c.classList.toggle("sel", p.tipi.includes(c.dataset.tipo)));
    document.querySelectorAll("#chips-allergeni .chip").forEach(c => c.classList.toggle("sel", p.allergeni.includes(c.dataset.allergene)));

    abilitaPiano();
    renderTutto();
  } catch (e) { /* salvataggio corrotto: si riparte da capo */ }
}
