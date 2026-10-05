# Architecture rules

- FiltriCollassabili supports opt-in desktop collapse and a persistent summary; existing callers retain always-visible desktop filters to avoid regressions.
- The bulk credit-proposal dialog keeps business handlers unchanged and uses existing list cards below the desktop-table breakpoint to prevent compressed client names and horizontal scrolling.

- Payment-condition display in credit-request UI must use the shared helpers and text component next to useCodiciPagamento; this keeps catalog lookup, fallback and formatting consistent without changing stored or exported values.