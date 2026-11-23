# Riconciliazione lead → cliente (FM99)

Leggere prima di toccare: collegamento lead → cliente, annullamento della conversione, import anagrafica clienti, registro `lead_riconciliazioni`.

## Regola
- Dopo l'import anagrafica clienti (o con «Controlla ora», solo amministratori) il motore `public.riconcilia_lead_clienti(_importazione_id, _operatore)` cerca, per ogni lead con `cliente_id IS NULL` e `stato <> 'convertito'` (i «perso» sono inclusi), i clienti con la stessa chiave.
- **Esattamente un cliente** → collegamento automatico (`collegato_auto`). **Più clienti** → riga `da_riconciliare`, si sceglie a mano con `collega_lead_da_riconciliare` tra i candidati salvati. Nessun cliente → niente.
- Autore del collegamento automatico = `_operatore`, altrimenti `importazioni.eseguita_da`.
- Il motore è eseguibile solo da `service_role` (server); `riconcilia_lead_ora()` solo da amministratori.

## Chiavi (normalizzate allo stesso modo su lead e clienti)
- P.IVA: solo cifre; valida se di 11 cifre e non segnaposto (`102730`, `102729`).
- Codice fiscale: `upper(btrim())`; valido se di 11 o 16 caratteri.
- Confronto incrociato: ogni chiave valida del lead contro P.IVA **e** codice fiscale del cliente (società con CF = P.IVA).
- `chiave = 'partita_iva'` se ha trovato la P.IVA del lead, altrimenti `'codice_fiscale'`.

## Esiti del registro `lead_riconciliazioni`
`collegato_auto`, `da_riconciliare` (al massimo una aperta per lead), `collegato_manuale`, `annullato` (collegamento annullato da amministratore, oppure lead collegato in altro modo). Le righe portano fotografie (nome/chiavi/creatore del lead, cliente) per essere mostrate senza leggere altre tabelle. Lettura: chi ha accesso al modulo lead e chi ha creato il lead; scrittura solo dalle funzioni.

## Fonte unica del collegamento
- `public._collega_lead_a_cliente_interno(lead, cliente, operatore, conversione_tipo, nota)` è l'unico corpo che sposta contatti, cantieri, opportunità, consensi, eventi, scrive lo storico e imposta `lead.cliente_id` (i trigger spostano preventivi, allegati e Cerved). Non è eseguibile dagli utenti.
- `collega_lead_a_cliente` (manuale, `contatto_cliente`), il motore e `collega_lead_da_riconciliare` (`import_gamma`) la chiamano; non duplicare il corpo.

## Divieto di cancellare clienti da import
- I collegamenti da riconciliazione hanno `conversione_tipo = 'import_gamma'`. In `annulla_conversione_lead` seguono il ramo di `contatto_cliente`: **il cliente non viene mai cancellato** e i preventivi già passati restano al cliente. Solo `nuovo_cliente` (cliente creato dal lead) può cancellare il cliente.

## Notifiche
Solo in app, raggruppate dal trigger esistente: `lead_riconciliato` a creatore del lead (se attivo) + amministratori attivi; `lead_da_riconciliare` ai soli amministratori attivi, solo per le righe nuove. Con «Controlla ora» si esclude chi l'ha lanciato. Un errore di notifica non annulla i collegamenti.

## Nota operativa
`crea_o_riusa_contatto_in_soggetto` richiede `service_role` o un utente con accesso eventi: il motore va eseguito dal server come `service_role` (verificato).
