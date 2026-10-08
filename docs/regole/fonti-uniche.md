# Fonti uniche e regole da FM37–FM39

Estratto dal knowledge di progetto il 08/10/2026 (sessione 40). Si aggiorna modificando questo file.

## 11. Fonti uniche e regole da FM37–FM39

- **Richiesta fido:** modulo unico `RichiestaFormDialog`; cambio condizione `condizionePagamentoCambiata` (`fidi.ts`); testo `CondizionePagamentoTesto`, codici da `useCodiciPagamento()`; evidenza `cambio-condizione-pagamento.tsx`; dati `mapRichiestaFido`; decisione solo via RPC `processa_richiesta_fido` (fido e condizione separati, condizione approvata anche diversa dalla proposta); permesso `puoDecidereRichiesta`; file Gamma solo in `export-fidi-tracciato.ts`.
- **Lead/eventi:** `lead_evento_provvisorio`, `trova_contatto_equivalente`, `trasferisci_privacy_contatto`, `sposta_lead_ambito` (unico modo di cambiare `lead.ambito`), `collega_lead_a_cliente`; filtri lead in `applicaFiltri`.
- **Import** (`functions.server.ts`): scritture a sotto-blocchi da 250 con 3 tentativi; verifica di completezza a fine import e, se incompleto, NIENTE pulizie distruttive (orfani). Anagrafica via RPC `bulk_update_clienti_anagrafica` (chiave presente = scrive anche null) con ripiego per riga: nuova colonna = aggiornare entrambi. Limiti: `statement_timeout` 8 s, 1.000 righe per chiamata PostgREST.
- **Audit clienti:** `audit_clienti()` registra solo i campi cambiati (`dettagli.campi {campo:{da,a}}`), mai la riga intera.
- **Email solleciti:** avviso rosso "forniture sospese" solo in `wrapEmailHtml` (sollecito_1/2, messa_in_mora).
- **RLS:** funzioni che dipendono solo dall'utente come `(SELECT f())` (initPlan).
