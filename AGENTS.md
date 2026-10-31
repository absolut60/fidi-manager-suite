# Architecture rules

- Official Gamma scadenziario parsing lives only in the browser-safe scadenziario-parser module; both browser staging and direct-file server entrypoints parse and resolve duplicates once before chunking, while chunk dedup remains a safety net and expected-row counters retain their existing valid-client rule.

- Alert-fidi notifications are produced only by public.invia_notifiche_alert_fidi after alert refresh; it locks eligible alerts, uses the existing grouping/push triggers and marks logical deliveries rather than INSERT RETURNING rows, because grouping may cancel inserts.

- TooltipDettaglio owns delayed tooltip mounting for recovery actions, commercial calendar events and task rows, so content and any detail queries mount only while open without changing click or touch handlers.

- FiltriCollassabili supports opt-in desktop collapse and a persistent summary; existing callers retain always-visible desktop filters to avoid regressions.
- The bulk credit-proposal dialog keeps business handlers unchanged and uses existing list cards below the desktop-table breakpoint to prevent compressed client names and horizontal scrolling.

- Payment-condition display in credit-request UI must use the shared helpers and text component next to useCodiciPagamento; this keeps catalog lookup, fallback and formatting consistent without changing stored or exported values.
- FM55 publishes v2 values into fido_teorico_cliente after both block upserts; all screens and request reference amounts read this canonical table while semaforo fields and preview-only Alert access remain independent.
- Request references apply fidoPropostoPerRichiesta only inside fetchFidoTeoricoPerRichiesta, using canonical precalculated debt and the configured alert threshold; arrotondaFidoV2 mirrors SQL rounding in this same module, keeping displayed, initial and saved references consistent without altering theoretical credit calculations.
- Import/Export refreshes precalculation state on completed imports observed in its existing history query; bounded automatic polling uses the shared readiness rule and never starts recalculation itself.
- Automatic recalculation readiness and missing-source labels are evaluated only by fido-teorico-import-completi; its query retains the entire local calendar day plus all processing imports so earlier same-day sources remain available after a recalculation.
