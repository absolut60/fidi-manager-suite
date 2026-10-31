# Architecture rules

- Official Gamma scadenziario parsing lives only in the browser-safe scadenziario-parser module; both browser staging and direct-file server entrypoints parse and resolve duplicates once before chunking, while chunk dedup remains a safety net and expected-row counters retain their existing valid-client rule.

- Alert-fidi notifications are produced only by public.invia_notifiche_alert_fidi after alert refresh; it locks eligible alerts, uses the existing grouping/push triggers and marks logical deliveries rather than INSERT RETURNING rows, because grouping may cancel inserts.

- TooltipDettaglio owns delayed tooltip mounting for recovery actions, commercial calendar events and task rows, so content and any detail queries mount only while open without changing click or touch handlers.

- FiltriCollassabili supports opt-in desktop collapse and a persistent summary; existing callers retain always-visible desktop filters to avoid regressions.
- The bulk credit-proposal dialog keeps business handlers unchanged and uses existing list cards below the desktop-table breakpoint to prevent compressed client names and horizontal scrolling.

- Payment-condition display in credit-request UI must use the shared helpers and text component next to useCodiciPagamento; this keeps catalog lookup, fallback and formatting consistent without changing stored or exported values.
- FM55 publishes v2 values into fido_teorico_cliente after both block upserts; all screens and request reference amounts read this canonical table while semaforo fields and preview-only Alert access remain independent.
- "Scaduto oltre N giorni" and the 12-month real collected amount are computed only by public.scaduto_oltre_giorni (per-row, RiBa threshold, excluded codes, anticipi offset via calcola_scaduto); the zeroing rule also requires the configured share of pagato_12m, below it only the signal from public.segnalazioni_fido applies; rule scaduto_non_incassato zeroes the theoretical credit and riferimentoRichiesta skips debt and extra protections for it, so the published zero is what every request proposes.
- Request references apply fidoPropostoPerRichiesta only inside fetchFidoTeoricoPerRichiesta, using canonical precalculated debt and the configured alert threshold; arrotondaFidoV2 mirrors SQL rounding in this same module, keeping displayed, initial and saved references consistent without altering theoretical credit calculations.
- Import/Export refreshes precalculation state on completed imports observed in its existing history query; bounded automatic polling uses the shared readiness rule and never starts recalculation itself.
- Automatic recalculation readiness and missing-source labels are evaluated only by fido-teorico-import-completi; its query retains the entire local calendar day plus all processing imports so earlier same-day sources remain available after a recalculation.
- Alert-fidi request state is read live in src/lib/alert-fidi.ts (esitoRichiestaAlert, using isRichiestaAttiva), while aggiorna_alert_fidi mirrors it at refresh by linking any active request, closing only once processed and reopening on reject; this keeps the page current without waiting for recalculation.
- Margin, out-of-cycle orders and the cap on base for normal behaviour profiles under rule calcolo are computed only by public.fido_v2_margine_tetto, used by get_fido_teorico_v2 and by the block recalculation that publishes ordini_fuori/tetto/valore_senza_tetto for segnalazioni_fido; requests keep their own protections so a lower theoretical value never cuts committed credit.
