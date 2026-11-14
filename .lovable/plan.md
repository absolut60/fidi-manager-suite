# FM68 – Autocompletamento indirizzi: inventario (sola analisi, nessuna modifica)

Questo non è un piano da approvare: è il resoconto richiesto. Nessun file toccato.

## 1) Servizio usato oggi
- **Google Maps Platform**, con chiave propria nel segreto server **`GOOGLE_MAPS_API_KEY`**. Non c'è la chiave browser del connettore (`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_*` non compare nel codice).
- Geocodifica lato server: `src/lib/cantieri-geo.server.ts:46` `geocodificaIndirizzo()` → Geocoding API legacy `maps/api/geocode/json` (:60), chiave letta a :50. Distance Matrix legacy a :192 (chiave a :182).
- Server function: `src/lib/cantieri.functions.ts:13` `geocodificaCantiere` (salva lat/lng + `geocodifica_stato`), `:71` `geocodificaSedi`, `:114` `getChiaveMappe` → **manda al browser la stessa `GOOGLE_MAPS_API_KEY`** (:117). `src/lib/sedi.functions.ts:15` `geocodificaIndirizzoSede` (non salva), `:34` `geocodificaTutteLeSedi`.
- Caricamento nel browser: `src/lib/google-maps-loader.ts:9` `caricaMaps(key)`, script Maps JS con `libraries=places`, `loading=async`, callback, `language=it&region=IT` (:24-25). Usato da `src/components/cantieri-mappa.tsx:11` e dall'autocompletamento.
- **Places è già usata**: `src/components/indirizzo-autocomplete.tsx` (`AutocompleteSuggestion` + `AutocompleteSessionToken` nel browser, Places API New, solo Italia, attesa prima della richiesta, poi dettagli del luogo → via/CAP/città/provincia/lat/lng). `.pac-container` in `src/styles.css:167-168` serve a mostrare la tendina sopra i dialog.

## 2) Moduli con campi indirizzo
| File:riga | Componente | Campi | Autocompletamento | Geocodifica al salvataggio |
|---|---|---|---|---|
| `src/components/cantiere-dialog.tsx:374-407` | Cantiere (dialog) | indirizzo, CAP, città, provincia | **Sì** (`IndirizzoAutocomplete` :375, chiave da `getChiaveMappe` :59) | Sì, server `geocodificaCantiere` :244 dopo insert/update :310/:314 |
| `src/components/preventivatore/NuovoCantiereForm.tsx:56-63` | Nuovo cantiere dal preventivo | indirizzo, CAP, città, provincia | No | Sì, server `geocodificaCantiere` :32 |
| `src/routes/_app/impostazioni.tsx:641-654` | `StoreDialog` (:476), sedi | indirizzo, CAP, città, provincia (max 2, maiuscolo) | No | Sì, server `geocodificaIndirizzoSede` :496/:501; salva su `stores` :567/:570 |
| `src/routes/_app/clienti.tsx:3185-3199` | `StepImpresa` (:3115), nuovo cliente/contatto | indirizzo, CAP, città, provincia (max 2) | No | No; salva su `clienti` :2639/:2643 |
| `src/routes/_app/clienti.$clienteId.tsx:2067-2080` | `EditClienteDialog` (:1857) | indirizzo, città, CAP, provincia | No | No |
| `src/components/lead/nuovo-lead-dialog.tsx:274-288` | `NuovoLeadDialog` | indirizzo, città, CAP, provincia | No | No |
| `src/routes/_app/lead.$leadId.tsx:824-849` | modifica lead | indirizzo, città, CAP, provincia | No | No; salva su `lead` :274 |
| `src/components/eventi/aggiungi-partecipante-dialog.tsx:425-438` | `AggiungiPartecipanteDialog` | indirizzo, città, CAP, provincia | No | No |

Non sono moduli di inserimento (solo filtri o visualizzazione): `marketing/segmenti-whatsapp-tab.tsx:364-369` e `marketing.segmenti.tsx:1107-1111` (filtri città/provincia), `lead.$leadId.tsx:661-664`, `clienti.$clienteId.tsx:658`, `fornitori/SchedaFornitore.tsx:78`, `preventivatore/CantierePicker.tsx:110-112`. Non ho controllato riga per riga le pagine pubbliche (consensi, recesso, firma privacy, iscrizioni): la ricerca non ha trovato campi indirizzo modificabili.

## 3) Parti condivise
- Esistono già: `IndirizzoAutocomplete` (componente) e `caricaMaps` (caricamento). Lato server la geocodifica ha una funzione sola: `cantieri-geo.server.ts` con `componiQuery` + `geocodificaIndirizzo`.
- Però l'autocompletamento è usato **solo** in `cantiere-dialog.tsx`. Gli altri 7 moduli hanno 4 `Input` scritti a mano, ciascuno per conto suo.

## 4) Come si salvano città e provincia
- Testo libero in colonne `indirizzo`, `cap`, `citta`, `provincia` su `clienti`, `lead`, `cantieri`, `stores` e sui partecipanti agli eventi. **Non esiste una tabella dei comuni né una colonna `comune_id`**: la ricerca nel codice e nelle migrazioni non trova nulla. La provincia ha al massimo 2 caratteri ed è in maiuscolo solo in sedi e nuovo cliente; nel lead il limite è 5 caratteri e nella modifica cliente non c'è.
- Coordinate (`lat`, `lng`, `geocodifica_stato`, `geocodificato_il`) solo su `cantieri` e `stores`.

## Punti da conoscere per la decisione
- Le regole del connettore Google Maps vietano nel browser `AutocompleteSuggestion`/Places e chiedono di passare dal server con login. Oggi invece `IndirizzoAutocomplete` lo fa nel browser con la chiave server mandata al client (`getChiaveMappe`). Estenderlo a tutti i moduli moltiplicherebbe questa esposizione.
- Le chiamate server usano endpoint legacy (Geocoding/Distance Matrix diretti con chiave), non il gateway del connettore.
- `clienti` arriva dall'import Gamma: va deciso se l'autocompletamento in `StepImpresa`/`EditClienteDialog` può scrivere indirizzi che l'import poi sovrascrive.
