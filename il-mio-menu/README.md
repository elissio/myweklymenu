# Il mio menu settimanale

Web app personale per creare un **menu di 7 giorni** e la **lista della spesa**,
ispirata alle app di pianificazione pasti. Funziona interamente nel browser: nessun server,
nessun account, i dati restano sul tuo dispositivo.

## Come aprirla
Fai **doppio clic su `index.html`** (si apre nel browser). Tutto qui.

## Usarla dai telefoni (Wi-Fi di casa)
1. Sul Mac fai **doppio clic su `avvia-app.command`** (nella cartella `home workspace/`):
   si apre una finestra che resta accesa e mostra l'indirizzo, es.
   `http://192.168.1.77:4173`.
2. Dai telefoni, **sulla stessa Wi-Fi**, apri quell'indirizzo nel browser
   (Safari su iPhone, Chrome su Android).
3. Per averla come icona: **Condividi → Aggiungi a Home** (iPhone) o
   **menu ⋮ → Aggiungi a schermata Home** (Android).

Note: funziona solo a casa, con il Mac acceso e quella finestra aperta. Alla prima
connessione macOS può chiedere di consentire a Python le connessioni in entrata
(→ Consenti). Per usarla **ovunque e sempre** serve pubblicarla online (es. Netlify).

## Come funziona
1. **Preferenze** — scegli il supermercato (card colorate), numero di persone,
   budget, dieta, pasti da pianificare, **cosa hai in cucina** (elettrodomestici),
   tipi di piatto e allergeni. In *Opzioni avanzate*: ingredienti da evitare e
   ingredienti che hai già in casa (la "dispensa"). In *Aspetto*: tema chiaro/scuro.
2. **Piano settimanale** — l'app compone 7 giorni pescando dalla libreria di
   ricette e restando nel budget. In alto una card di riepilogo (supermercato,
   costo/budget, persone, pasti, tipo); i tab filtrano per pasto. Clicca un
   piatto per vedere la ricetta (con tempo e valori nutrizionali); usa ↻ per cambiarlo.
3. **Lista della spesa** — ingredienti raggruppati per reparto (disattivabile),
   con quantità sommate e prezzo stimato totale. Gli ingredienti "già in casa"
   non compaiono. Spunta ciò che metti nel carrello.

C'è anche la scheda **📖 Ricettario** (sempre accessibile): sfoglia tutte le
ricette della libreria con ricerca e filtro per pasto; clicca per la scheda completa.

I dati del piano e il tema vengono salvati automaticamente: riaprendo l'app li ritrovi.

## Funzioni principali
Già presenti: supermercati colorati (Lidl default), elettrodomestici, dieta/allergeni,
**obiettivo nutrizionale** (più proteine / equilibrato / leggero), ingredienti da
evitare, dispensa, **pranzo da ufficio** (solo piatti riscaldabili al microonde),
**niente piccante**, **solo prodotti di stagione**, budget (più peso a pranzo/cena),
tempo di preparazione, tab pasti, card riepilogo, dark mode.

Non ancora fatte: **notifiche** (serve trasformarla in PWA), **foto reali** dei
piatti (ora c'è un'emoji).

## Prezzi: tarati su Lidl
- I prezzi sono **tarati sui prezzi reali Lidl** (dagli scontrini in
  `../scontrini-lidl/`). Lidl ha moltiplicatore 1.00 (riferimento); gli altri
  supermercati sono stimati rispetto a Lidl.
- **Offerte del volantino**: in `data.js` c'è `OFFERTE` (vuoto). Quando inserisci
  gli sconti della settimana (`"nome ingrediente": 0.7` = -30%), l'app applica lo
  sconto al prezzo e li puoi preferire.
- **Nota precisione**: il prezzo è quello della quantità usata nel piatto. Al
  supermercato compri confezioni intere (es. pollo €6,99 dura più pasti) e ci sono
  extra non-cibo: lo scontrino reale è quindi un po' più alto della stima del piano.

## I prezzi sono STIME
I supermercati non pubblicano i prezzi in modo accessibile, quindi:
- ogni ingrediente ha un **prezzo di base stimato** (in `data.js`);
- ogni supermercato ha un **"livello prezzi"** (moltiplicatore), così la stima
  cambia se scegli Eurospin invece di Esselunga.

Puoi correggere i prezzi quando vuoi modificando `data.js`.

## Aggiungere ricette dall'app (consigliato)
Vai su **📖 Ricettario → ➕ Aggiungi una ricetta**, inserisci nome, pasti,
ingredienti (con prezzo), tempo e valori nutrizionali: l'app **assegna da sola**
i tag (proteico/leggero/economico/veloce), gli **allergeni** e le **diete**
analizzando i dati. Le tue ricette restano salvate sul dispositivo (marcate "tua",
eliminabili col 🗑) ed entrano subito nei menu generati.

> Come decide i tag: proteico se proteine ≥ 24 g/porzione · sano se kcal ≤ 420 e
> grassi ≤ 18 g · economico se ≤ €1,80/porzione · veloce se ≤ 20 min. Allergeni e
> diete sono dedotti dai nomi degli ingredienti. Verifica sempre gli allergeni.

## Importare ricette da link (Instagram, siti, video)
Quando trovate ricette online, **incollate i link in chat a Claude** e chiedete
di importarle. Claude legge i link, estrae la ricetta, la auto-categorizza e la
aggiunge a `ricette-importate.js` (compaiono nel Ricettario col badge "da link"
e il pulsante "↗ Apri la ricetta originale").
- Funziona bene con i **siti di ricette** (dati strutturati nella pagina).
- Per **Instagram/video**: incollate anche la **didascalia/testo** della ricetta,
  perché dal solo link il contenuto del video spesso non è leggibile.

## Modificare a mano la libreria
Apri **`data.js`** con un editor di testo. Le ricette sono nella lista
`RICETTE`: copia un blocco `{ ... }`, cambia i valori e salva. Ogni campo è
spiegato nei commenti del file (nome, emoji, tempo, slot, attrezzatura, tipi,
diete, allergeni, nutrizione, ingredienti, passi). Le ricette valgono per 2
porzioni: l'app le scala automaticamente in base al numero di persone.

Nello stesso file puoi anche aggiungere **supermercati** (con colore del brand
e livello prezzi) ed **elettrodomestici**.

## File del progetto
- `index.html` — struttura e stile della pagina
- `data.js` — supermercati, reparti e libreria ricette (la parte che farai crescere)
- `app.js` — logica: generazione piano, budget, lista della spesa, salvataggio
