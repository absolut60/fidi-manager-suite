# FM90 — fetta C1: scheda Cerved nel lead e passaggio al cliente

- `SchedaCervedEntita` (in `src/components/cliente-cerved-tab.tsx`) è l'unica scheda Cerved; `ClienteCervedTab` è solo involucro (`entita="cliente"`), chiavi di query cliente invariate. Per il lead chiavi `["cerved-lead", id]`, `["cerved-report","lead",id]`, `["cerved-light-report","lead",id]`.
- Server: `aggiornaCervedSoggetto` / `apriPdfReportCerved` per entità.
- `datiMade` (via `partiMadeCerved`): per il lead nasconde Fido MADE e confronto in CardScore, Come paga MADE + semaforo (valutazioni parziali e Payline), Confronto con MADE nella Lettura.
- Hook `useLightReportEntita`; `useLightReportCliente` involucro con stessa chiave.
- Scheda lead: tab "Cerved" dopo "Commerciale" (RLS decide la visibilità, pulsante solo con `puoAggiornareCerved`).

## Migrazione
`drizzle/migrations/0249_fm90_cerved_lead_cliente.sql`: `lead_cerved_a_cliente()` SECURITY DEFINER + `trg_lead_cerved_cliente` (AFTER UPDATE OF cliente_id ON lead). Copia il collegamento del lead al cliente solo da NULL a valore, cliente senza collegamento e P.IVA uguale (sole cifre); errori → WARNING. Prova sul DB reale in transazione annullata: 1 riga cliente creata con lo stesso id_soggetto.

## File
- `src/components/cliente-cerved-tab.tsx`, `src/hooks/use-light-report-cliente.ts`, `src/lib/cerved/cerved-parti-made.ts` (nuovo), `src/routes/_app/lead.$leadId.tsx`, `src/integrations/supabase/types.ts`, `drizzle/migrations/0249_…`, `tests/cerved-scheda-entita.test.ts` (nuovo), `src/lib/cerved/AGENTS.md`, questo file.
