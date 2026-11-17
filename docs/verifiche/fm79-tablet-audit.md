# FM79 — Tablet, fase 0: analisi (16/11/2026)

Solo analisi: nessun file dell'app è stato modificato. Nessuna pagina temporanea nel progetto: utente e dati sono stati **simulati nel browser di prova** (vedi "Metodo").

## Metodo

- Inventario: 74 pagine in `src/routes/_app` (esclusi i tre contenitori `lead.tsx`, `task.tsx`, `opportunita.tsx`) + 10 finestre/menu principali = **84 elementi controllati**.
- Playwright con touch attivo (`hasTouch:true`, `isMobile:true`) a **768×1024, 820×1180, 1180×820, 1366×1024** → 296 fotografie di pagina + 39 di finestre.
- Accesso simulato: sessione finta in `localStorage` e ogni chiamata al backend intercettata nel browser. Le tabelle ricevono 14 righe finte generate dallo schema (nomi come "CARICO MONGIUSTI COSTRUZIONI EDILI E RISTRUTTURAZIONI GENERALI S.R.L.", importi da 1.234.567,89 a 3.703.703,67 €). Ruolo: amministratore. Nessuna scrittura reale.
- Misure automatiche per ogni pagina e dimensione: scroll orizzontale della pagina, tabelle che scorrono di lato (px nascosti), testo in colonne strettissime (< 36 px su ≥ 3 righe), elementi tagliati a destra, intestazioni più larghe della colonna, target touch < 40 px, finestre fuori schermo.

### Limiti (da sapere prima di leggere la tabella)

- **Pagine di dettaglio non verificabili con dati finti** (restano sullo scheletro di caricamento): scheda cliente `clienti/$clienteId`, preventivo `preventivatore/$id`, richiesta fido `richieste/$richiestaId`, richiesta interna, lead, opportunità, task, evento, articolo (2), fornitore, kit, `cambia-password`. Leggono i dati con funzioni del database, a cui la simulazione risponde con elenchi vuoti. **Vanno verificate con un accesso vero** (fetta 0 del piano).
- Le pagine che leggono soprattutto da funzioni del database (scadenziario, dashboard, cruscotto incassi, promemoria) sono state viste **vuote**: si è controllata l'impaginazione, non le righe.
- `/legali` va in errore con i dati finti ("This page didn't load"): quasi certamente dovuto ai dati simulati, da ricontrollare con dati veri. Non conteggiato come problema.
- Tastiera virtuale: il browser di prova non la simula. Valutata leggendo il codice e misurando lo spazio delle finestre (vedi M10).

## Esito in breve

- **Nessuna pagina ha scroll orizzontale dell'intera pagina** a nessuna delle 4 dimensioni.
- Nessuna finestra esce dallo schermo; il menu laterale da telefono (sotto 1024 px) si apre correttamente.
- Rotazione: nessuna pagina si rompe solo ruotando; il passaggio verticale → orizzontale fa comparire il menu laterale fisso (256 px) da 1024 px in su, che toglie spazio alle tabelle (vedi A1 e M11).
- I problemi veri sono **tabelle larghe che scorrono dentro il riquadro** (Totale e azioni fuori vista), **colonne con nomi spezzati parola per parola o lettera per lettera**, e **target touch da 16–36 px** quasi ovunque.

**28 problemi: 11 alta, 12 media, 5 bassa.**

## Tabella dei problemi

"Nascosto" = pixel di tabella fuori vista a destra (768 / 820 / 1180 / 1366).

| # | Pagina / route | Dimensioni | Problema | Gravità | File coinvolti | Correzione proposta |
|---|---|---|---|---|---|---|
| A1 | `/clienti` | tutte | Tabella nascosta 922 / 870 / 782 / 596 px: punto vendita, rischio, fido e azioni fuori vista; filtri compressi fino a "Solo Imp", "Tutti …", campo ricerca largo 1 lettera ("C") a 1180 | alta | `src/routes/_app/clienti.tsx` | Con `tablet:` vista a schede (`ElencoSchede`) in verticale; in orizzontale colonne essenziali + dettagli nella riga; filtri su 2 colonne |
| A2 | `/richieste-interne/tutte` | tutte | Nascosto 798 / 746 / 658 / 472 px; Richiedente e Sede una parola per riga; Tipo/Importo tagliati | alta | `src/components/richieste-interne/richieste-table.tsx` | Con `tablet:` schede o colonne ridotte (Richiedente+Sede uniti), Importo sempre visibile |
| A3 | `/richieste-interne/mie` | tutte | Nascosto 651 / 599 / 511 / 325 px, stessi sintomi | alta | come A2 | stessa correzione (componente condiviso) |
| A4 | `/richieste-interne/archivio` | tutte | Nascosto 1133 / 1081 / 993 / 807 px | alta | come A2 | stessa correzione |
| A5 | `/richieste` (anche `/approvazioni`, che vi rimanda) | tutte | Nascosto fino a 606 px nella scheda "In approvazione", 206 px nelle altre; importi tagliati | alta | `src/routes/_app/richieste.tsx` | Con `tablet:` schede già usate su telefono (`lista-responsive`) |
| A6 | `/lead` | tutte | Nascosto 411 / 359 / 271 / 85 px; Città e Sede a 1–4 lettere per riga ("CARI MONI COST"); 15 celle tagliate | alta | `src/routes/_app/lead.index.tsx` | Con `tablet:` schede; in orizzontale togliere Città/Sede dalle colonne e mostrarle nella riga |
| A7 | `/utenti` | tutte | Nascosto 1219–1359 px: righe su una sola linea lunghissima | alta | `src/routes/_app/utenti.tsx` | Con `tablet:` schede (`lista-responsive`) |
| A8 | `/marketing/invii` | tutte | Nascosto 634 / 582 / 494 / 308 px; contatori e totali tagliati | alta | `src/routes/_app/marketing.invii.tsx` | Colonne ridotte + schede in verticale |
| A9 | `/recupero-crediti` | 768, 820 | Titolo e sottotitolo schiacciati dai 4 pulsanti: "Clienti / con / azioni / di / recupero" una parola per riga; tabella nascosta 432 / 380 / 292 / 106 px | alta | `src/routes/_app/recupero-crediti.tsx` | Intestazione a griglia (titolo sopra, pulsanti sotto) con `tablet:`; tabella a schede in verticale |
| A10 | Tutte le pagine | tutte | Target touch sotto 40 px: pulsanti 36 px (`h-9`) e 32 px (`size="sm"`), campi e menu a tendina 36 px, caselle 16 px; voci del menu laterale 29 px in orizzontale | alta | `src/components/ui/button.tsx`, `input.tsx`, `select.tsx`, `checkbox.tsx`, `src/components/app-shell.tsx` | Varianti `tablet:` nei componenti base (altezza ≥ 44 px, casella con area tocco ≥ 40 px): corregge quasi tutte le pagine in un colpo, telefono e PC invariati |
| A11 | Tutti i campi di testo | tutte | `Input` usa `md:text-sm` (14 px): su iPad Safari ingrandisce la pagina a ogni tocco su un campo (sotto 16 px) | alta | `src/components/ui/input.tsx`, `textarea.tsx`, `select.tsx` | `tablet:text-base` (16 px) |
| M1 | `/opportunita` | 768, 820, 1180 | Nascosto 234 / 182 / 94 px; nomi impilati | media | `src/routes/_app/opportunita.index.tsx` | Colonne ridotte con `tablet:` |
| M2 | `/marketing/campagne` | 768, 820, 1180 | Nascosto 310 / 258 / 170 px; Oggetto e Stato tagliati | media | `src/routes/_app/marketing.campagne.tsx` | Colonne ridotte |
| M3 | `/recupero-crediti-campagne` | 768, 820, 1180 | Nascosto 277 / 225 / 137 px; colonne Falliti/Avanzamento fuori vista | media | `src/routes/_app/recupero-crediti-campagne.tsx` | Colonne ridotte |
| M4 | `/richieste-interne/approva` | 768, 820, 1180 | Nascosto 282 / 230 / 142 px | media | `src/routes/_app/richieste-interne.approva.tsx` (+ `richieste-table.tsx`) | Come A2 |
| M5 | `/listini` | tutte | Nascosto 300 / 248 / 160 px; a 1366 intestazioni "COD. GAMMA" e "DESCRIZIONE" sovrapposte; 119–136 comandi sotto 40 px | media | `src/components/listini/ListinoAcquistoView.tsx`, `ListinoVenditaView.tsx`, `MatriceRicarichiView.tsx` | Larghezze minime di colonna e intestazioni a capo con `tablet:` |
| M6 | `/marketing/iscritti-whatsapp` | 768, 820, 1180 | Nascosto 308 / 256 / 168 px; colonne Data/Azioni tagliate | media | `src/routes/_app/marketing/iscritti-whatsapp.tsx` | Colonne ridotte |
| M7 | `/contatti` | 768, 820, 1180 | Nascosto 154 / 102 / 14 px; Nome ripetuto e impilato su 10+ righe | media | `src/routes/_app/contatti.tsx` | Schede in verticale |
| M8 | `/marketing/segmenti` | 768, 820, 1180 | Nascosto 157 / 105 / 17 px nell'elenco clienti | media | `src/routes/_app/marketing.segmenti.tsx` | Colonne ridotte |
| M9 | `/cantieri` | 768, 820 | Nascosto 99 / 47 px; Indirizzo e Cliente impilati su 15+ righe | media | `src/routes/_app/cantieri.tsx` | Schede in verticale |
| M10 | Finestre (Nuovo preventivo, Nuovo lead, Nuova opportunità, ecc.) | 1180×820 soprattutto | Le finestre stanno nello schermo e scorrono (alte 738 px), ma con la tastiera aperta (circa 330–400 px) resta poco spazio; manca `interactive-widget=resizes-content` nel viewport; 7–22 comandi sotto 40 px per finestra | media | `src/components/ui/dialog.tsx`, `sheet.tsx`, `src/routes/__root.tsx` | `tablet:` piede delle azioni fisso in basso; il meta viewport cambia anche il telefono → **decisione del proprietario** |
| M11 | Menu laterale in orizzontale | 1180, 1366 (e 1024×768) | Menu fisso 256 px (22% dello schermo a 1180) con voci da 29 px; è la causa principale delle tabelle che non stanno in orizzontale | media | `src/components/app-shell.tsx` | Con `tablet:` voci ≥ 44 px; valutare menu richiudibile sul tablet |
| M12 | `/calendario-commerciale`, `/recupero-crediti-calendario` | tutte | Celle dei giorni e pulsanti vista da 16–20 px | media | `src/routes/_app/calendario-commerciale.tsx`, `recupero-crediti-calendario.tsx` | Celle e comandi più alti con `tablet:` |
| B1 | `/privacy` | 768, 820 | Nascosto 78 / 26 px (colonna Scarica PDF) | bassa | `src/routes/_app/privacy.tsx` | Colonne ridotte |
| B2 | `/template-email` | 768, 820 | Nascosto 89 / 37 px (Azioni) | bassa | `src/routes/_app/template-email.tsx` | Azioni sempre visibili |
| B3 | `/template-lettera` | 768, 820, 1180 | Nascosto 164 / 112 / 24 px | bassa | `src/routes/_app/template-lettera.tsx` | Azioni sempre visibili |
| B4 | `/audit` | 768, 820 | Nascosto 58 / 6 px; colonna Dettagli tagliata | bassa | `src/routes/_app/audit.tsx` | Colonne ridotte |
| B5 | Riquadro "Attiva le notifiche" | verticale | Occupa 52 px fissi sotto la barra in alto su ogni pagina finché non si configura | bassa | `src/components/banner-attiva-notifiche.tsx` | Più compatto con `tablet:` |

Pagine senza problemi oltre ai target touch (A10): dashboard, preventivi e ordini (già corretti nel giro precedente), scadenziario (impaginazione), alert fidi, aree, assicurazioni, chat, variazioni blocco, cruscotto incassi, dashboard commerciale, dashboard fidi, fidi da processare, eventi, fornitori, articoli, kit, notifiche, task, piani di rientro, promemoria, promesse, andamento, agenzia, impostazioni, import/export, il mio profilo, WhatsApp, QR WhatsApp, disiscrizioni, richieste interne (pannello e gestione), attiva notifiche.

## Regola unica per il tablet (proposta)

```css
/* src/styles.css — accanto a pv-orizzontale e pv-tabella */
/* tablet = schermo touch senza mouse, da 768 px, non telefono in orizzontale */
@custom-variant tablet { @media (pointer: coarse) and (hover: none) and (min-width: 768px) and (min-height: 501px) { @slot; } }
```

Gemello in JS, solo se serve (es. scegliere schede o tabella in un componente), con la **stessa** media query in un solo punto:

```ts
// src/hooks/use-tablet.ts
export const MEDIA_TABLET = "(pointer: coarse) and (hover: none) and (min-width: 768px) and (min-height: 501px)";
// useIsTablet(): matchMedia(MEDIA_TABLET) letta in useEffect (mai nel primo render: evita differenze con il rendering lato server)
```

Verifica eseguita con Playwright sulla pagina vera dell'app:

| Schermo | tablet | pv-orizzontale | pv-tabella | use-mobile (< 768) | menu laterale (lg) |
|---|---|---|---|---|---|
| Telefono 375×812 | no | no | no | sì | no |
| Telefono orizz. 812×375 | no | sì | sì | no | no |
| Telefono grande orizz. 932×430 | no | sì | sì | no | no |
| Tablet 768×1024 | **sì** | no | sì | no | no |
| Tablet 820×1180 | **sì** | no | sì | no | no |
| Tablet 1024×768 | **sì** | no | sì | no | sì |
| Tablet 1180×820 | **sì** | no | sì | no | sì |
| Tablet 1366×1024 | **sì** | no | sì | no | sì |
| PC 1280×800 (mouse) | no | no | sì | no | sì |
| PC 1440×900 (mouse) | no | no | sì | no | sì |
| PC finestra stretta 800×900 (mouse) | no | no | sì | no | no |

Note:
- Senza `min-height: 501px` la regola si accendeva anche sul telefono in orizzontale (812×375): così è il complemento esatto di `pv-orizzontale` (`max-height: 500px`) e le due non si sovrappongono mai.
- `pv-tabella` resta com'è: dice *come* si vede il corpo del preventivo, non *che dispositivo* è. `tablet:` si somma, non la sostituisce.
- `use-mobile.tsx` (768) e il menu laterale (`lg`, 1024 in `app-shell.tsx`) non cambiano. Attenzione: `useIsMobile` (sidebar shadcn) e il menu reale (`lg`) usano già due soglie diverse; la regola tablet non le tocca.
- PC con schermo touch e mouse: `pointer` è quello principale (mouse = `fine`), quindi la regola resta spenta. iPad con tastiera e trackpad: Safari continua a dichiarare `pointer: coarse` → resta "tablet", che è il comportamento voluto.
- Regola di lavoro: ogni correzione usa **solo** classi `tablet:` (o `useIsTablet`) e non tocca le classi esistenti, così telefono e PC restano identici; lo dimostra lo script di non-regressione.

## Piano a fette (3–5 file ciascuna)

Ordine per gravità e uso quotidiano. Ogni fetta: `regressione.py prima` → correzione → `regressione.py dopo` → `confronta` = 0 differenze, più fotografie touch alle 4 dimensioni tablet.

| Fetta | Contenuto | File | Problemi |
|---|---|---|---|
| 0 | Verifica con accesso vero delle pagine di dettaglio (scheda cliente, preventivo, richiesta fido, richiesta interna, lead) e di `/legali`; integra questa tabella. Serve che il proprietario entri nell'anteprima | nessuno (solo analisi) | limiti |
| 1 | Regola `tablet` + gemello JS + componenti base touch e niente zoom sui campi | `src/styles.css`, `src/hooks/use-tablet.ts` (nuovo), `src/components/ui/button.tsx`, `input.tsx`, `select.tsx` | A10, A11 |
| 2 | Clienti | `src/routes/_app/clienti.tsx`, `src/components/lista-responsive/scheda-lista.tsx` (solo se serve un'opzione), `src/components/ui/checkbox.tsx`, `textarea.tsx` | A1, resto di A10/A11 |
| 3 | Richieste fido e richieste interne | `src/routes/_app/richieste.tsx`, `src/components/richieste-interne/richieste-table.tsx`, `src/routes/_app/richieste-interne.approva.tsx` | A2, A3, A4, A5, M4 |
| 4 | Recupero crediti e menu laterale | `src/routes/_app/recupero-crediti.tsx`, `recupero-crediti-campagne.tsx`, `recupero-crediti-calendario.tsx`, `src/components/app-shell.tsx` | A9, M3, M11, M12 (metà) |
| 5 | Commerciale | `src/routes/_app/lead.index.tsx`, `opportunita.index.tsx`, `contatti.tsx`, `cantieri.tsx`, `calendario-commerciale.tsx` | A6, M1, M7, M9, M12 |
| 6 | Finestre e tastiera | `src/components/ui/dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx` (+ `src/routes/__root.tsx` solo dopo decisione) | M10 |
| 7 | Marketing | `src/routes/_app/marketing.invii.tsx`, `marketing.campagne.tsx`, `marketing.segmenti.tsx`, `marketing/iscritti-whatsapp.tsx` | A8, M2, M6, M8 |
| 8 | Amministrazione | `src/routes/_app/utenti.tsx`, `src/components/listini/ListinoAcquistoView.tsx`, `ListinoVenditaView.tsx`, `MatriceRicarichiView.tsx` | A7, M5 |
| 9 | Rifiniture | `src/routes/_app/privacy.tsx`, `template-email.tsx`, `template-lettera.tsx`, `audit.tsx`, `src/components/banner-attiva-notifiche.tsx` | B1–B5 |

Da decidere (proprietario): aggiungere `interactive-widget=resizes-content` al meta viewport (M10) cambia il comportamento della tastiera anche sui telefoni Android, pur senza cambiare l'immagine; e se il menu laterale sul tablet in orizzontale debba potersi richiudere (M11).


## Stato finale dopo la fetta 9 — 17/11/2026

L’analisi e i valori sopra restano la fotografia iniziale, non lo stato corrente. Esiti delle fette documentati in fm79-prova-statica.md. “Risolto” riguarda la presentazione verificata con fixture, non certifica permessi o tastiera reale.

| Problema | Stato | Fetta / limiti |
|---|---|---|
| A1 | Risolto | 2 |
| A2 | Risolto | 3 |
| A3 | Risolto | 3 |
| A4 | Risolto | 3 |
| A5 | Risolto | 3 |
| A6 | Risolto | 5 |
| A7 | Risolto | 7–8 |
| A8 | Risolto | 7–8 |
| A9 | Risolto | 4 |
| A10 | Risolto nei componenti base e nelle pagine delle fette; dettagli da provare sul dispositivo | 1 + 3–9; nessuna certificazione di tutti i controlli nelle pagine non accessibili alle fixture. |
| A11 | Risolto nei campi condivisi; comportamento Safari da provare sul dispositivo | 1; 16px sui tablet. |
| M1 | Risolto | 5 |
| M2 | Risolto | 7–8 |
| M3 | Risolto | 4 |
| M4 | Risolto | 3 |
| M5 | Risolto con eccezione voluta | 9; scroll interno nelle tre tabelle, codice/descrizione fissi, target ≥40px e intestazioni leggibili. |
| M6 | Risolto | 7–8 |
| M7 | Risolto | 5 |
| M8 | Risolto | 7–8 |
| M9 | Risolto | 5 |
| M10 | Presentazione risolta; tastiera reale da provare sul dispositivo | 6; viewport non modificato per decisione Andrea. Su iPad tastiera riduce visual viewport, non layout viewport: 1180×480 Playwright non è prova del caso reale. |
| M11 | Risolto | 4 |
| M12 | Risolto | 4 + 5 |
| B1 | Risolto | 9 |
| B2 | Risolto | 9 |
| B3 | Risolto | 9 |
| B4 | Risolto | 9 |
| B5 | Risolto | 9 |

### Da provare sul dispositivo (non verificabili con fixture complete)

- Scheda cliente, preventivo, richiesta fido e richiesta interna.
- Schede lead, opportunità, task ed evento.
- Scheda articolo nei due percorsi (ID/codice), fornitore e kit.
- Cambia password.
- Area Legali: fixture non valida, esclusa dai confronti.
- Tastiera iPad nei moduli lunghi, PDF reali e anteprime/download, rotazione dell’app installata.
- Dashboard, scadenziario, cruscotto incassi e promemoria: involucro verificato con dati vuoti, righe reali da provare sul dispositivo.

Decisioni chiuse: menu tablet richiudibile e sovrapposto (fetta 4); nessuna modifica interactive-widget/meta viewport (fetta 6). Le tabelle WhatsApp incorporate in Campagne/Segmenti non erano nel perimetro dei problemi M2/M8, riferiti agli elenchi Email; non dichiarate collaudate. Nessun problema A/M/B rimane privo di stato.
