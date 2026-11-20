# FM90 — fetta C2: gauge nella lista lead e link al lead

- `useEntitaConReportCerved(entita, ids, enabled)` (con `leggiEntitaConReportCerved` testabile): id entità → id_soggetto (cerved-letture) → report/fotografie. `useClientiConReportCerved` involucro, chiave cliente invariata (v3); lead `["lead-con-report-cerved","v1",…]`.
- Lista lead (`src/routes/_app/lead.index.tsx`): `IconaCervedCollegato` in `angolo` delle schede e colonna sticky "Cerved" in tabella, come i clienti; clic apre il lead sulla tab Cerved.
- Scheda lead: parametro facoltativo `?tab=` per aprire direttamente una tab (es. cerved).
- Card "Report Cerved in attesa": link cliente (tab cerved), altrimenti link lead (tab cerved, nome con `nomeLead`), altrimenti testo.
- Nessuna migrazione.

## File
`src/hooks/use-clienti-con-report-cerved.ts`, `src/routes/_app/lead.index.tsx`, `src/routes/_app/lead.$leadId.tsx`, `src/components/impostazioni/report-cerved-attesa-card.tsx`, `tests/cerved-gauge-entita.test.ts`, `src/lib/cerved/AGENTS.md`, questo file.
