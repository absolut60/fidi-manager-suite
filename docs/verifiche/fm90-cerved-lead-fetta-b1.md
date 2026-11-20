# FM90 — fetta B1: "Collega / Aggiorna Cerved" unico per cliente e lead (solo server)

## Cosa cambia
- Nuove server function `aggiornaCervedSoggetto({ entita, id })` e `apriPdfReportCerved({ entita, id })` in `cerved-soggetto.functions.ts`: unica implementazione per cliente e lead.
- `aggiornaCervedCliente` / `apriPdfReportCervedCliente` restano con stessa firma e risultato, solo involucri (entità "cliente").
- Lettura entità con RLS utente ("Cliente non trovato" / "Lead non trovato"); P.IVA a 11 cifre.
- Nuovo collegamento: riusa id_soggetto e denominazione da un collegamento esistente con la stessa P.IVA, senza entitySearch; altrimenti ricerca Cerved come prima.
- Report valido (anti doppio acquisto) per `id_soggetto`, non più per cliente.
- Acquisto: origine `cliente_id` o `lead_id`; reference = codice gestionale solo per il cliente.
- Registro chiamate: `clienteId` per il cliente, null per il lead.
- `recuperaESalvaLightReport` riceve l'origine esplicita (`cliente_id`, `lead_id`) e la scrive sulla fotografia; job orario e "Riprova ora" leggono anche `lead_id`.
- PDF: entità → collegamento → report più recente del soggetto con PDF; URL firmato 10 minuti.
- Interfaccia invariata; nessuna migrazione.

## Test
1118 pass, 0 fail; tsgo pulito. Nuovi test: colonna/origine per entità, P.IVA con spazi e IT, collegamento lead, riuso stessa P.IVA, involucri senza logica.

## File toccati
- src/lib/cerved/cerved-soggetto.functions.ts (nuovo)
- src/lib/cerved/cerved-entita.ts (nuovo, funzioni pure)
- src/lib/cerved/cerved-cliente.functions.ts
- src/lib/cerved/cerved.server.ts
- src/lib/cerved/cerved-attesa.server.ts
- src/lib/cerved/cerved-attesa.functions.ts
- src/lib/cerved/AGENTS.md
- tests/cerved-aggiornamento.test.ts, tests/cerved-recupero.test.ts
- docs/verifiche/fm90-cerved-lead-fetta-b1.md
