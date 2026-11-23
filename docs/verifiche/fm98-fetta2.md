# FM98 — Fetta 2: informativa privacy da firmare

## File toccati

- `src/lib/scheda-pdf.ts`: opzione facoltativa `daFirmare`; solo in questa modalità le caselle sono tutte vuote, la data è `Li ____________`, la riga Firma è senza immagine e non viene stampata alcuna prova telematica/IP. Testi legali, posizioni, tabella dati e numerazione privacy restano invariati. Nessun chiamante esistente modificato.
- `src/lib/privacy-preventivo.ts`: fonte unica per mappatura e lettura autorizzata dei dati, unione pdf-lib e ripiego in caso d'errore. Nessuna lettura o riscrittura del PDF senza spunta: stesso oggetto e stessi byte.
- `src/components/preventivatore/GeneraDocumentoDialog.tsx`: spunta transitoria, inizialmente vuota e azzerata ad ogni riapertura; solo PDF ufficiale e Proposta rapida. Il risultato unito è salvato una sola volta in `preview`; errore → toast «Informativa privacy non accodata» e documento originale.
- `tests/fm98-privacy-preventivo.test.ts`: mappatura, modulo, identità precedente, unione e ordine pagine, ripiego, letture mirate e integrazione delle quattro linee/preventivo/ordine/rapida.
- `tests/fixtures/fm98-privacy-inputs.ts`: cinque input sintetici rappresentativi delle forme degli attuali chiamanti.
- `tests/fixtures/fm98-privacy-baseline.json`: SHA-256 del motore precedente, ottenuti **prima** della modifica.
- `tests/fm98-privacy-preventivo.browser.py`: collaudo ripetibile con risposte locali e invio intercettato; la pagina temporanea necessaria alla ripetizione è descritta nello script e rimossa dopo il collaudo.
- `AGENTS.md`: fonte unica mappatura/unione e blob condiviso; `roadmap.md`: avanzamento e limite di verifica reale; questo rapporto.

Nessuna modifica a database, policy, trigger, dati esistenti, testi legali, motore Gamma, `pdf-export.ts`, preferenze di stampa o agli invii server.

## Campi reali usati

Tipi verificati in `src/integrations/supabase/types.ts`, tabelle `clienti` e `lead`:

| Modulo | Provenienza |
|---|---|
| Societa' | `nomeIntestatarioPdf(prev)`: cliente `ragione_sociale`; lead `ragione_sociale` oppure `nome` + `cognome` |
| P.IVA | `partita_iva` |
| Codice fiscale | `codice_fiscale`, solo con `tipo_soggetto = persona_fisica`; vuoto per azienda |
| Residenza | `indirizzo`, `cap`, `citta`, `provincia`, solo parti presenti |
| Email | `email` |
| Cell. | `cellulare` (mai il telefono fisso né contatti del dichiarante) |

Nome, cognome, luogo/data di nascita del dichiarante non sono passati. `tipo: nuovo`, `daFirmare: true`, `dataFirma: ''`. Campi assenti → vuoti; nessuna sede MADE o cantiere sostituisce l'indirizzo del soggetto.

Il DTO ordinario del preventivo non contiene tutti questi dati: **non ampliato**. Quando la spunta è selezionata, cliente letto tramite `fetchDatiClientePreventivo`/RPC `dati_cliente_preventivo` già esistente; lead letto tramite client utente con SELECT delle sole colonne sopra e filtro sull'ID collegato al documento. Nessun accesso privilegiato, nuova RPC o modifica RLS. Senza spunta non parte questa lettura.

## Anteprima, stampa, scarico e invio

`GeneraDocumentoDialog` genera il PDF esistente (condizioni FM98 comprese), poi accoda le due pagine privacy. `preview.blob` è lo stesso passato sia a `AnteprimaPdfDialog` sia a `InviaPreventivoEmailDialog`.

Percorso email verificato: `InviaPreventivoEmailDialog` → `inviaPreventivoPerEmail({pdf: blob})` → `blobInBase64` → `inviaEmailPreventivo`, che allega `data.pdf.base64` senza rigenerare il documento. Ricerca in tutto `src/`: nessun altro percorso di invio preventivo che rigeneri il PDF e richieda la propagazione della scelta.

Unione: prima tutte le pagine documento/condizioni, poi informativa e consenso. Documento mantiene `Pag. x / y`; modulo mantiene `Pag. 1 di 2` e `Pag. 2 di 2`. Nome file invariato. Anteprima/stampa/scarico continuano a usare i controlli esistenti.

## Identità del modulo esistente

Prima e dopo sono stati generati cinque moduli con dati **sintetici**, nelle forme attuali di cliente con firma, QR WhatsApp, evento con canali separati, finalizzazione telematica e finalizzazione con dettaglio canali. Non esistevano test specifici del generatore: aggiunte queste fixture, senza usare documenti o firme reali.

La data dei metadati PDF è congelata a `2026-11-23T10:10:00Z` nel processo di prova e TZ UTC; altrimenti CreationDate/ModDate cambierebbero a prescindere dal contenuto. Gli input Date restano quelli della fixture.

**Cinque confronti byte prima/dopo identici**, più **dieci pagine raster identiche pixel per pixel** a 1.000 px. Il test conserva gli hash prima della modifica e verifica sia opzione omessa sia `daFirmare: false`.

| Fixture | SHA-256 precedente e successivo |
|---|---|
| cliente_firma | `0bb9b046c7c33485687c6b55f1dd8bd0d583d78a4eb3cfdad5c30532a844e126` |
| qr_whatsapp | `f515c9601482dcf837cdd13421a0c734d39c2218f4f8fe83a6c6e61a415ed8a9` |
| evento_canali | `323a4c5b83ea5778662b6f69871dc66301f239638cc5061033895ed82ea29054` |
| finalizzazione_flag | `7dc1d2cdac9acdf5823316346902e6cc6b875705ae942d41ba079c265a4f69ae` |
| finalizzazione_dettaglio | `c107b7e4fa9cc3426cf5222a9f77704b16e9d500bec63bfc03b32ca507208deb` |

## Test e collaudo

- Modulo da firmare: tre coppie di caselle vuote, nessuna X, data/IP/prova telematica assenti, riga Firma presente. Anche canali separati vuoti. Campi compilati solo quando passati.
- Mappatura: cliente azienda con PIVA/contatti, privato senza PIVA con CF, lead persona fisica senza dati, lead azienda e soggetto assente.
- Unione pdf-lib: documento +2 pagine e ordine corretto; numerazioni indipendenti. Spunta assente restituisce originale intatto senza chiamare il generatore. Errori di modulo o merge restituiscono originale e segnale di avviso.
- Integrazione: tutte le quattro linee, preventivo/ordine, PDF ufficiale/rapida; nome file invariato, numero pagine originale +2.
- Suite completa finale: **1.412 test superati, 0 fallimenti**, 171 file.
- Playwright: **320, 375, 390, 768 touch, 1280, 1920 px** sulla finestra e anteprima reali montate in pagina temporanea. Spunta iniziale vuota/reset, disponibilità su rapida ed esclusione dalle liste, generazione 4 pagine (2 documento/condizioni +2 privacy), download PDF verificato con pypdf. Stampa: stessi byte del file scaricato. Invio email intercettato: base64 decodificato **identico byte per byte** al PDF scaricato/anteprima. Nessun invio reale.
- Errore lettura lead simulato: avviso visibile e anteprima della rapida senza modulo, ancora 2 pagine documento/condizioni. Nessun overflow né errore di pagina; foto visionate a 375, 768, 1280. Raster pagina consenso visionato con dati precompilati, caselle vuote e Firma senza sovrapposizioni.
- Foto e PDF sintetici in `/tmp/browser/fm98-privacy`; pagina `/verifica-fm98-privacy` rimossa dal progetto dopo le prove. Nessun bypass di sessione rimane nell'app.

## Limiti

Sessione personale non disponibile: `lovable auth-session --json --self` segnala nessun account dell'app corrispondente all'email del richiedente. Letture reali con permessi dell'utente e recapito email reale non verificati; flusso end-to-end eseguito con risposte locali e invio bloccato/intercettato. Nessun utente altrui impersonato e nessun dato reale modificato. Non pubblicato.