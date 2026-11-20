# FM90 — fetta A: Cerved anche sui lead (solo database)

## Migrazione applicata
`drizzle/migrations/0248_fm90_cerved_soggetti_lead.sql`
- cerved_soggetti: nuova PK `id`; `cliente_id` nullable con UNIQUE; `lead_id` (FK lead, CASCADE) con UNIQUE; CHECK `num_nonnulls(cliente_id, lead_id) = 1`.
- cerved_report / cerved_fotografie: `cliente_id` nullable; `lead_id` (FK lead, SET NULL) con indice; indici `(id_soggetto, scade_il DESC)` e `(id_soggetto, tipo, letta_il DESC)`.
- Sostituite solo le tre policy SELECT; "Secondo fattore (FM44)" invariate; nessuna policy di scrittura nuova.

## Conteggi
| Tabella | Prima | Dopo |
|---|---|---|
| cerved_soggetti | 71 | 71 |
| cerved_report | 69 | 69 |
| cerved_fotografie | 142 | 142 |

Nessun `id` nullo in cerved_soggetti dopo la migrazione.

## File toccati
- drizzle/migrations/0248_fm90_cerved_soggetti_lead.sql (+ meta)
- src/integrations/supabase/types.ts (rigenerato)
- src/lib/cerved/cerved.server.ts (tipo `cliente_id: string | null`)
- src/components/impostazioni/report-cerved-attesa-card.tsx (tipo del link)
- docs/regole/sicurezza-permessi.md
- docs/verifiche/fm90-cerved-lead-fetta-a.md
