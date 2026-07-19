/* =========================================================================
   SERVICE WORKER — "prima la rete, poi la cache"
   Obiettivo: quando aggiorno l'app, il telefono mostra SEMPRE l'ultima versione
   (niente più cache vecchia), ma l'app funziona lo stesso anche offline.
   Bump di VERSIONE ad ogni rilascio: invalida la cache precedente.
   ========================================================================= */
const VERSIONE = "v16";
const CACHE = "menu-" + VERSIONE;

// File del "guscio" dell'app: precaricati all'installazione così l'app parte anche offline.
const CORE = [
  "./",
  "./index.html",
  "./data.js",
  "./ricette-importate.js",
  "./sync.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fallirebbe tutto se un file manca: li aggiungiamo uno a uno, tolleranti.
    // { cache: "reload" } bypassa la cache HTTP del browser: al bump di VERSIONE
    // precarica davvero l'ultima versione dal server, non copie stantie.
    await Promise.all(CORE.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting(); // il nuovo SW diventa attivo subito
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // Elimina le cache delle versioni vecchie.
    const nomi = await caches.keys();
    await Promise.all(nomi.filter((n) => n.startsWith("menu-") && n !== CACHE).map((n) => caches.delete(n)));
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Solo file nostri (stessa origine). Firebase, WhatsApp, ecc. passano diretti alla rete.
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      // PRIMA LA RETE: se online, prendi la versione fresca e aggiorna la cache.
      // { cache: "reload" } salta la cache HTTP del browser -> mai una versione vecchia.
      const fresca = await fetch(req, { cache: "reload" });
      if (fresca && fresca.ok && fresca.type === "basic") {
        const cache = await caches.open(CACHE);
        cache.put(req, fresca.clone());
      }
      return fresca;
    } catch (err) {
      // OFFLINE: usa la copia in cache; per la navigazione, ripiega sull'index.
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === "navigate") {
        const home = await cache.match("./index.html") || await cache.match("./");
        if (home) return home;
      }
      throw err;
    }
  })());
});

// Permette alla pagina di forzare l'attivazione immediata di un nuovo SW.
self.addEventListener("message", (e) => {
  if (e.data === "salta-attesa") self.skipWaiting();
});
