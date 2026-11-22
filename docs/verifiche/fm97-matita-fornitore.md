# FM97 — Matita "cambia fornitore" solo quando serve

- Regola unica `fornitoreRigaCambiabile` in `src/lib/fornitori-riga-ordine.ts`: matita se l'articolo ha ≥ 2 fornitori in `articoli_gamma_fornitori`, oppure manca il preferenziale e la riga non ha fornitore, oppure la riga ha un fornitore diverso dal preferenziale.
- Conteggio in blocco dentro `fornitoriRigheOrdine` (una lettura `in(articolo_codice)` per tutte le righe del blocco, nessuna query per riga); il risultato porta `cambiabile`.
- `RigheTable.tsx`: `FornitoreRigaOrdine` riceve `modificabile` solo se il permesso esistente c'è e la riga è cambiabile; durante il caricamento niente matita.
- Nessuna modifica a DB, RLS, motore, preventivi.
- Test: `tests/fm97-matita-fornitore.test.ts` (5 casi), `tests/ordini-gamma.test.ts` invariato e verde.
- Playwright 375/1280 non eseguito: nessuna sessione con un ordine reale disponibile in questo giro.
