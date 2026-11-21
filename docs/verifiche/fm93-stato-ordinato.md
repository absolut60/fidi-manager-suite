# FM93 — Fetta 3, stato Ordinato e badge Chiuso

## Migrazioni applicate

- `drizzle/migrations/0258_fm93_stato_preventivo_ordinato.sql`: solo ADD VALUE dell'enum, in transazione separata.
- `drizzle/migrations/0259_fm93_stato_ordine_ripristino.sql`: colonna nullable `stato_prima_ordine`, funzione di trasformazione e trigger AFTER DELETE dell'ordine.
- Tipi rigenerati dalla piattaforma. Nessun backfill degli ordini esistenti: la richiesta riguarda le nuove trasformazioni, nessuno stato precedente viene inventato.

Confronto con pg_get_functiondef prima/dopo: funzione di trasformazione verbatim, unica aggiunta il blocco che salva lo stato precedente e imposta Ordinato prima del RETURN, dopo righe e totali. Ordini creati ancora Bozza, permessi/MFA/sede/quantità/chiusura invariati. Il secondo ordine non sovrascrive lo stato precedente.

Trigger di ripristino SECURITY DEFINER, search_path public, EXECUTE negato a PUBLIC/anon/authenticated, con GRANT service_role. Blocca la riga di origine prima della verifica dell'ultimo ordine, condividendo la serializzazione della trasformazione. Ripristina solo preventivi Ordinato; non altera altri stati.

## Invio email e altri percorsi

`statoDopoInvioPreventivo` porta a Inviato solo Bozza. L'UPDATE effettivo in `invio-preventivo-email.functions.ts` è inoltre condizionato da `.eq("stato", "bozza")`: anche un invio iniziato prima di una trasformazione non sovrascrive Ordinato. Nessuna correzione al percorso email necessaria; aggiunta copertura test per Ordinato. Ricerca sul DB delle funzioni con aggiornamenti di stato Bozza/Inviato/Confermato e riferimenti ai preventivi: oltre alla trasformazione nessuna funzione corrispondente. Nessun trigger di stato Inviato trovato.

## Interfaccia

STATI e STATI_LABEL includono Ordinato; filtro elenco già alimentato da STATI. Badge azzurro attraverso i token esistenti, condiviso da testata ed elenco. Menu Stato: Ordinato assente negli altri stati, unico valore corrente disabilitato quando Ordinato, handler protetto dalle funzioni condivise in preventivi-api. Modificabilità dei campi, residuo trasformabile e chiusura non cambiano.

`etichettaEvasioneDocumento` resta fonte unica di etichetta e sottotesto: badge Chiuso outline grigio e sottotesto «evaso in parte» separato, senza ritorni a capo. Il contenitore condiviso applica anche le classi di visibilità dei badge di elenco, così il sottotesto non rimane visibile quando il badge è nascosto.

## Query e prove reali annullate

Query permanenti complete: `tests/sql/fm93-stato-ordinato.sql`.

Eseguite via strumento database, transazione BEGIN/ROLLBACK con ruolo authenticated e claims reali amministratore aal2, su duplicato temporaneo del preventivo PRV-164/26 (il documento reale era già chiuso e collegato a un ordine: non è stato riaperto né alterato).

Assert SQL con RAISE EXCEPTION in caso di errore:

1. Trasformazione 4 su 10: preventivo Ordinato, stato_prima_ordine Inviato; ordine Bozza.
2. UPDATE email condizionato a Bozza: preventivo resta Ordinato.
3. DELETE unico ordine: preventivo Inviato, stato_prima_ordine NULL.
4. Due ordini da 4: DELETE del primo mantiene Ordinato e precedente Inviato, quantità ordinata derivata = 4.
5. DELETE ultimo dei due: Inviato, precedente NULL.
6. Precedente NULL prima del DELETE: fallback Bozza.

Tutti gli assert superati; query successiva `SELECT count(*) FROM preventivi WHERE titolo='TEST FM93 F3 ROLLBACK'` = 0.
Verificate colonna enum nullable, valore Ordinato e privilegi trigger (prosecdef=true, anon_execute=false, authenticated_execute=false). Firma della RPC invariata.

## Test e fotografie

- Suite completa: 1248 test verdi, 0 falliti, 156 file. Copertura stato automatico/non manuale, mantenimento delle regole di evasione e protezione email; etichetta/sottotesto verificati nei test della fonte unica.
- Controllo tipi della compilazione automatica: OK.
- Playwright su componenti reali con dati locali: 320/375/390/768/1280/1920, menu Ordinato disabilitato, filtro Ordinato selezionabile, badge e sottotesto separati, nessun overflow esterno e nessun errore runtime. Fotografie 375 e 1280 ispezionate. Pagina temporanea rimossa.
- Flusso UI autenticato completo non disponibile: il tentativo di ottenere la sessione personale non trova un account associato al richiedente; verifiche SQL effettuate con l'utente reale delle precedenti prove e UI con dati locali. Nessun invio email reale.