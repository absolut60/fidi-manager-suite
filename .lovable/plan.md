# FM54 — Mappa scadenze (sola analisi, nessuna modifica)

Questa è una mappa, non un piano da eseguire. Nessun file e nessun dato è stato toccato.

## 1. Chi scrive le colonne di `scadenze`

**Import scadenziario** (`processScadenziarioChunk`, `src/lib/inngest/functions.server.ts:2126-2131`)
- Passa all'upsert l'**oggetto intero** (`...r.payload`). In più aggiunge `cliente_id`, `importato_da` e `ultima_sincronizzazione = timestampInizio`.
- Le colonne non sono elencate esplicitamente. Il payload contiene solo le colonne che il parser trova nell'intestazione del file (`SCAD_OFFICIAL_MAP`, `src/lib/inngest/parsers.server.ts:401-436`; costruzione del payload a 820-826).
- Colonne scritte: key_documento, key_tipo_effetto, data_pagamento_effettiva, importo_pagato, importo_residuo, importo_effetto_orig, codice_pagamento, descrizione_pagamento, numero_documento, data_documento, anno_partita, tipologia_scadenza, data_scadenza, stato_contabile, importo_scadenza, importo_documento, giorni_ritardo, dilazione_effettiva, importo_ritardo, data_pagamento, importo_originario, importo_netto_prev, tempi_scadenza, tempi_scadenza_key.

**Import Scad+Assic** (`processScadAssicImport`, `functions.server.ts:2672`; parser `parseScadenziarioBlockSheet` a 2701; payload a 2823-2834)
- Scrive cliente_id, data_scadenza, descrizione_pagamento, importo_scadenza, fido_euro, assicurazione, cod_blocco, importato_da e ultima_sincronizzazione.
- Fa update per `id` (2877-2883) e insert per le righe nuove (2891). La riga esistente viene cercata con la chiave `cliente|data_scadenza|descrizione_pagamento` (2821).
- Riscrive anche `importato_da`.

**Colonne che l'import scadenziario NON scrive** (andrebbero perse passando a una riga nuova)
- `promemoria_scadenza_inviato_il`: la scrive solo il job promemoria (`src/lib/inngest/promemoria-scadenza.server.ts:254-257`, update `.in("id", …)` dopo un invio riuscito). Lo stesso job la usa per l'idempotenza (righe 141-151). Valorizzata oggi su **4.133** righe.
- `sollecitato`, `in_legale`: nessuno le scrive. Nessuna funzione del database fa UPDATE su `scadenze`, nessun punto dell'app le aggiorna, l'import ufficiale non le mappa. Restano solo le mappe vecchie: `parsers.server.ts:386, 555` (Simple) e `src/routes/_app/import-export.tsx:1192`. Oggi valgono 0 righe true (default false).
- `in_legale` è **letta** in `recupero-crediti-promemoria.tsx:865-870` e in `sollecito-massivo.server.ts:398`.
- `cod_blocco`, `fido_euro`, `assicurazione`, `sede`, `dilazione_teorica`: arrivano solo dall'import Scad+Assic o dalle mappe vecchie, non dall'import ufficiale.
- `id`, `created_at`, `updated_at`: valori di default del database e trigger `updated_at`.

## 2. Id di scadenze conservati fuori dalle 5 tabelle con FK

**`notifiche.metadata.scadenza_id`**
- Lo scrive `src/routes/api/public/hooks/check-reminder-ritardi.ts:74`. Oggi 97 righe hanno la chiave, 139 nominano "scadenz".
- Nessun punto dell'app lo legge: il link della notifica è `/clienti/{cliente_id}`.
- Se la scadenza viene ricreata: l'id resta "morto" ma senza effetti visibili.

**Reminder (stesso hook, righe 45-53)**
- Il controllo "reminder già creato negli ultimi 7 giorni" cerca per `reminder.scadenza_id`.
- Se la scadenza viene ricreata, il vecchio reminder va a NULL (SET NULL) e la nuova riga non viene riconosciuta: **reminder e notifica duplicati** per lo stesso documento.

**Job promemoria**
- La marca di idempotenza sta sulla riga (vedi 1). Una riga nuova ha la marca vuota: **lo stesso documento riceve un secondo promemoria**.
- Lo storico (`promemoria_scadenza_log_scadenze`) va in CASCADE. La lista in `recupero-crediti-promemoria.tsx:755` perde le righe del documento.

**Eventi Inngest in coda**
- Nessun evento porta id di scadenze. `sollecito-massivo` riceve solo `campagna_id` (`sollecito-massivo.server.ts:73`) e rilegge le scadenze per cliente al momento dell'invio (396-401). Le campagne marketing e WhatsApp portano solo `campagna_id`.
- Rischio solo "a metà invio": i ponti `azioni_recupero_scadenze` scritti a 506-509 puntano agli id letti in quel momento.

**Server function invio singolo** (`src/lib/email-recupero.functions.ts:36, 181-199`)
- Riceve dal browser `scadenzaIds` e filtra le scadenze attuali del cliente per id.
- Se un import ricrea la riga mentre il dialog è aperto, quella scadenza viene **esclusa in silenzio** dalla lettera e dal ponte (369-377).

**Stato nel browser**
- Le selezioni di id vivono solo nello stato React, non nell'archiviazione del browser. Punti: `invia-email-recupero-dialog.tsx:433-470`, `crea-azione-dialog.tsx:175-189`, `registra-promessa-dialog.tsx:136-140`, `piano-rientro-nuovo-dialog.tsx:127`, `scadenziario.tsx:1646-1651`, `reminder-controls.tsx:130-132`.
- Effetto: insert dei ponti con un id cancellato → errore di FK al salvataggio.
- `useFiltriPagina` (scadenziario:250, recupero-crediti:178, promesse:76) salva solo filtri, mai id. Nessun sessionStorage o localStorage con scadenze.

**Link con `scadenza_id` nell'indirizzo**
- Nessuno: i link portano a `/clienti/$clienteId?tab=insoluti`.

**Altri jsonb e log**
- `audit_log.dettagli`: 0 righe con "scadenza".
- `cache_cruscotti.dati`: 0 righe con `scadenza_id`.
- `importazioni.log_errori`: 0.
- `campagne_sollecito_destinatari`: nessuna colonna di scadenza.
- `anomalie_import`: nessuna colonna id. `scadenza_non_nel_file` salva il testo del documento, non l'id (vedi 4).

**Solo chiavi di riga React** (nessun effetto): `cruscotto-incassi.tsx:843, 1594`, `piano-rientro-dettaglio.tsx:368`, `recupero-crediti-promemoria.tsx:798, 807`.

## 3. Come l'import calcola le righe

**Chiave di conflitto**
- `cliente_id, key_documento, data_scadenza, key_tipo_effetto, importo_scadenza` (`functions.server.ts:2205, 2255`).
- Indice unico `scadenze_key_uniq` con `NULLS NOT DISTINCT`.
- Prima dell'upsert c'è una deduplica sulla stessa chiave (2143-2166): in caso di doppione vince l'ultima riga.
- **Conseguenza chiave:** `data_scadenza` e `importo_scadenza` fanno parte della chiave. Se Gamma cambia la data o l'importo di una rata dello stesso documento, l'upsert crea una **riga nuova con id nuovo** e la vecchia diventa orfana. È esattamente il caso da coprire.

**Campi del documento**
- `key_documento`: testo dal file, nessuna normalizzazione oltre `toStr`. Se manca vale NULL e vale come valore uguale agli altri NULL nella chiave.
- `anno_partita`: intero (`toInt`), fuori dalla chiave.
- `numero_documento`: testo, fuori dalla chiave.
- **ANTICIPO**: nessun trattamento speciale nell'import. Le righe sono scritte come le altre. `is_anticipo` (`src/lib/scadenze.ts:100-104`, gemello SQL) entra in gioco solo nel calcolo dello scaduto e nei promemoria.

**Riga nuova o aggiornata**
- Campo affidabile: `created_at >= timestampInizio`. `timestampInizio` è fissato una volta in `init-timestamp` (1765/1831) e passato ai chunk (1908).
- `created_at` ha default `now()`, non è nel payload e quindi non cambia sull'update. È lo stesso criterio usato per il conteggio creati/aggiornati (2169-2171, 2290).
- `ultima_sincronizzazione` e `importato_da` NON distinguono: sono uguali per righe nuove e aggiornate.
- `updated_at` cambia in entrambi i casi.

**Pulizia** (`rimuovi_orfani_scadenze`)
- È orfana ogni riga con `importato_da` diverso dall'import corrente. Guardia: almeno il 90% delle righe totali scritte da questo import.
- Per ogni orfana registra un'anomalia, poi esegue il DELETE.
- La chiamata e la verifica di completezza sono in `finalizeScadenziarioImport`, `functions.server.ts:2501-2558`.

## 4. Esito di fine import ("scadenze tolte")

**Dove si scrive**
- In `rimuovi_orfani_scadenze` (funzione del database).
- `tipo_anomalia = 'scadenza_non_nel_file'`, `campo = 'scadenza'`, `valore_nuovo = 'rimossa'`, `stato = 'risolta'`.
- Inoltre: `cliente_id`, `codice_gestionale`, `ragione_sociale`.

**Formato di `valore_attuale`**
- `numero_documento | key_documento | data_scadenza | importo_scadenza | stato_contabile`, separati da `" | "`.

**Lettura** (`src/lib/inngest/esito-import.server.ts`)
- 71-79: raccoglie i tipi distinti escludendo `scadenza_non_nel_file`. Ogni altro tipo nuovo finirebbe da solo nel blocco generico "Anomalie da controllare".
- 81-87: legge le scadenze tolte con le colonne `codice_gestionale, ragione_sociale, valore_attuale, valore_nuovo` (count exact, limite 30).
- 107-108: le passa in `scadenzeTolte` e `scadenzeTolteElenco`.

**Resa** (`src/lib/esito-import-messaggio.ts`)
- 11: tipo della riga.
- 191-197: blocco generico "Prima/Dopo".
- 208-212: sezione "Scadenze tolte perché non più nel file". Fa `split(" | ")` e usa le posizioni 0 (documento), 2 (data, mostrata in gg/mm/aaaa), 3 (importo in €) e 4 (stato). La posizione 1 (key_documento) viene ignorata.
- Una voce "collegamenti spostati" con un tipo nuovo apparirebbe da sola nel blocco generico. Una sezione dedicata richiederebbe la stessa esclusione a 75 e una lettura come a 83-87.

## 5. Altri punti che presuppongono un id stabile

- `piani_rientro_documenti` (CASCADE): il piano perde il documento e `importo_alla_selezione`. Letture in `src/lib/piani-rientro.ts:80` e `selettore-scadenze-aperte.tsx:71-80`.
- `azioni_recupero_scadenze` (CASCADE): azioni, promesse e solleciti perdono il documento collegato. Letture in `modifica-azione-dialog.tsx:103-105` e `invia-email-recupero-dialog.tsx:287-290`, che usano i documenti già sollecitati per i badge e per l'esclusione. Nelle letture in CASCADE: lo stesso documento risulta "mai sollecitato".
- `solleciti.scadenza_id`, `reminder.scadenza_id` (SET NULL): perdono il riferimento.
- `src/lib/scadenze-reset.functions.ts:14, 42-64`: azzeramento manuale delle scadenze. Prima cancella i reminder con `scadenza_id`: coerente, non presuppone stabilità.
- Il conflitto Scad+Assic (2821) usa una chiave diversa (`data_scadenza|descrizione_pagamento`) e riscrive `importato_da`. Dopo un suo import, le righe toccate risultano "scritte" da lui e non dall'ultimo import scadenziario. Va tenuto presente se le due fonti vengono usate entrambe.

Firme di funzioni del database: nessun cambiamento. Nessun file modificato.
