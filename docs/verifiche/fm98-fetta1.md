# FM98 — Fetta 1: condizioni di vendita nei PDF cliente

## Modifiche

- `src/lib/condizioni-vendita.ts`: fonte unica delle chiavi `condizioni_vendita_<linea>`, lettura/salvataggio, resa di `{{validita}}` e riconoscimento dei titoli. Nessun testo sostitutivo locale: assenza o valore vuoto non produce pagine.
- `src/components/impostazioni/condizioni-vendita.tsx`: sezione amministratore con un riquadro per linea attiva, testo precompilato, Salva per creazione/aggiornamento, `updated_by` e `updated_at`; errore di lettura impedisce il salvataggio accidentale, errore di scrittura non mostra successo.
- `src/routes/_app/impostazioni.tsx`: monta la sezione dopo le configurazioni esistenti, senza cambiare gli altri controlli o il gate della pagina. Metadati della pagina già presenti e conservati.
- `src/lib/pdf-export.ts`: un renderer comune aggiunge le condizioni prima di `drawFooter` nei PDF cliente ufficiali (anche ordine e ramo IVA agevolata) e Proposta rapida. Testata/logo e piede sono quelli esistenti del documento; font 8 pt, titoli grassetto navy, a capo e paginazione con spazio riservato al piede e all'eventuale banda. Eliminati i due DISCLAIMER e le relative stampe; coordinate di Totale e IVA invariate. Liste interne invariate e senza letture delle condizioni.
- `src/lib/preventivo-creazione.ts`: costante unica `GIORNI_VALIDITA_PREVENTIVO = 30`, applicata da `validitaProposta`.
- `tests/preventivo-creazione.test.ts`: aggiornate date attese e verificata la costante 30.
- `tests/fm98-condizioni-vendita.test.ts`: sei test, inclusi PDF jsPDF realmente generati/riletti in processo isolato, resa date, titoli, lettura unica, errori, salvataggio e autore.
- `tests/fm98-condizioni-vendita.browser.py`: prova ripetibile della sezione con risposte locali; richiede la pagina temporanea descritta nello script, rimossa dal progetto dopo il collaudo.
- `AGENTS.md`: documentata la fonte unica e l'inserimento prima del piede.
- `roadmap.md`: registrata la fetta e l'unico limite di verifica autenticata.
- Memoria progetto: decisioni permanenti su condizioni, rimozione frase fissa e validità 30 giorni.

## Punti della validità trovati

1. `src/lib/preventivo-creazione.ts`, `validitaProposta`: unico calcolo del valore proposto, prima +7, ora +30 giorni di calendario in UTC (indipendente dal cambio ora).
2. `src/components/preventivatore/NuovoPreventivoDialog.tsx`: inizializzazione da `validitaProposta(today)`; cambio Data tramite `riallineaValidita`, che riusa il medesimo calcolo solo finché la validità non è stata modificata manualmente. Il salvataggio conserva la scelta dell'utente. Nessuna modifica al dialog necessaria.
3. `src/lib/preventivi-api.ts`, `duplicaPreventivo`: `validita: src.validita`, anche per le alternative. Non ricalcola: lasciata invariata.
4. `src/components/preventivatore/TestataPreventivo.tsx`: modifica esplicita della validità dei documenti esistenti; nessun valore predefinito, lasciata invariata.
5. `createPreventivo`: persiste i campi forniti, senza un secondo calcolo di validità. Nessuna modifica.

Nessun aggiornamento dei preventivi esistenti, nessuna modifica alla trasformazione ordine.

## Riga inserita nel database

Solo INSERT dati, **nessuna migrazione e nessuna modifica di schema/RLS/trigger**:

- Chiave: `condizioni_vendita_showroom`.
- Descrizione esatta: `Condizioni generali di vendita stampate in coda al preventivo e all'ordine della linea Showroom (FM98). {{validita}} = data di validità del preventivo.`
- Valore: testo integrale di Andrea, da `CONDIZIONI DI VENDITA` alla frase finale `dovute al prodotto naturale.`, con righe e paragrafi conservati; 1.786 caratteri.
- MD5 del valore dopo INSERT e rilettura: `02e05a6d54e1c5543af9af90de710e04`.
- `updated_at`: `2026-11-23 10:01:33.527888+00`; `updated_by`: NULL nell'inserimento tecnico (nessun autore impersonato). I successivi salvataggi dalla pagina valorizzano l'utente autenticato.
- Query prima dell'inserimento: nessuna chiave `condizioni_vendita_%`. Query dopo: solo Showroom. Nessun inserimento per Sistema MADE, Edilizia o Fotovoltaico.
- Policy esistenti verificate: SELECT per autenticati; scrittura solo `has_role(auth.uid(), 'amministratore')`. Non modificate.

## Verifiche

- Suite completa `bun test ./tests`: **1.400 test superati, 0 fallimenti**, 170 file, 4.598 assertion.
- `{{validita}}`: data `2026-12-23` → `23/12/2026`; assente → `indicata nel preventivo`; tutte le occorrenze sostituite, altri segnaposto invariati.
- Titoli: accenti, trim, vuoto, minuscole, limite 60/61 caratteri.
- PDF cliente: testo assente/vuoto/soli spazi mantiene una pagina; testo presente aggiunge la seconda; condizioni lunghe producono sei pagine con ultimo testo conservato. Numerazione `Pag. x / y` completa su ogni pagina, anche ordine e IVA agevolata. Una sola lettura per generazione. Errore di lettura: PDF senza condizioni e `console.warn`. Nessuna lettura/pagina nelle due liste interne. Frase fissa assente dai file.
- Rilettura indipendente con pypdf dei PDF breve e lungo, ufficiale e rapida: 2/6 pagine, numerazione corretta. Raster della seconda pagina verificato: titolo, logo MADE, testata documento, testo e piede senza sovrapposizioni.
- Playwright della sezione reale su pagina temporanea: **320, 375, 390, 768 touch, 1280, 1920 px**; lettura, modifica Showroom, creazione Sistema MADE, Salva con autore e rilettura dopo ricarica superati con risposte simulate. Nessuna scrittura di prova al database. Nessun errore di pagina o overflow; foto iniziali e dopo salvataggio conservate in `/tmp/browser/fm98`, visionate a 375/768/1280.
- Pagina temporanea `/verifica-fm98` rimossa dopo il collaudo; nessun bypass di accesso resta nell'app.

## Limiti

La prova con account personale non è disponibile: `lovable auth-session --json --self` segnala che nessun account dell'app corrisponde all'email del richiedente. Salvataggio/rilettura reali autenticati e generazione dal documento reale restano non verificati; prove della sezione e persistenza eseguite con risposte locali, policy reali lette senza cambiarle. Nessun account altrui impersonato, nessun permesso alterato.

Non pubblicato. Non toccati elenco Ordini, motore o file Gamma, prezzi e logica di trasformazione.