# FM91 2c — Import, export e template kit (21/11/2026)

## File
- `src/lib/kit-excel.ts` (nuovo): colonne, mappa DB, workbook (KIT/ISTRUZIONI/VALORI), lettura, analisi/anteprima.
- `src/lib/kit-api.ts`: `codiciGammaEsistenti`, `kitEsistentiPerCodice`, `salvaKitImportati`.
- `src/components/kit/ImportaKitDialog.tsx` (nuovo), `src/routes/_app/kit.index.tsx` (pulsanti / menu «Altro»).
- Migrazione `drizzle/migrations/0255_fm91_kit_import_excel.sql`: `public.importa_kit_excel(jsonb)`, SECURITY INVOKER, REVOKE PUBLIC/anon, GRANT authenticated/service_role (verificato: anon false, authenticated true).
- Test `tests/kit-excel.test.ts` (13) e fixture `tests/fixtures/kit-sm-par-2l-75-50.ts`.

## Verifiche
- Suite completa: 1270 pass, 0 fail (guardia AST compresa); build OK.
- Formule Excel ricalcolate con LibreOffice headless sull'export del kit reale: INCIDENZA identica al motore su tutte le 10 righe (es. tasselli 1,4333333, viti 0,0169167), PESO_PER_UM = incidenza × peso.
- Prova DB in transazione annullata come utente amministratore con secondo fattore: creazione (2 righe), aggiornamento con sostituzione (2 → 1 riga, nome aggiornato), linea non abilitata rifiutata; impronta del kit reale invariata.
- Conteggi dopo la prova: 1 kit, 10 componenti, 0 parametri, 0 varianti; `updated_at` del kit reale invariato (11:41:34). Nessun dato di prova rimasto.
- Foto 375 e 1280 (`fm91-kit-import/`) su pagina temporanea con dati finti, poi rimossa: nessuno scroll orizzontale, menu «Altro» su telefono, finestra di import. Anteprima con file reale e salvataggio da interfaccia autenticata non provati (nessuna sessione personale).
