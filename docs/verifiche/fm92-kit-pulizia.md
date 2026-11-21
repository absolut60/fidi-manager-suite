# FM92 — Pulizia kit, fetta 1

## Ambito
Solo codice e prove: nessuna migrazione, comando di scrittura o modifica DB. Rimossi motore a sei operandi, parametri, varianti, incidenza esplicita/driver di ripiego, UI nascoste e relative API. Nessun cambiamento a formula semplice, flussi prezzo, righe/documenti esistenti o permessi.

## Verifiche
- Suite completa: **1217 pass, 0 fail**, 154 file, 4077 asserzioni. Guardia AST compresa.
- Controllo automatico TypeScript e build della piattaforma: **build OK** dopo la correzione dei tipi del campo numerico; nessun comando manuale di build/typecheck.
- Kit reale letto in sola lettura: `SM-PAR-2L-75-50-P60`, **1 kit / 10 componenti**.
- Copia dei campi semplici verificata sul dato reale e confronto completo JSON dei risultati col motore precedente: **identico**, inclusi pesi/errori.
- Incidenze, ordine 1–10: `4; 0.716666666666667; 3.3833333333333333; 1; 1; 0.05; 1.433333333333334; 0.016916666666666663; 0.08; 0.032`.
- La prima riga reale contiene Lati=4: non sostituita con la fixture storica 1+1. Peso noto totale **44.929446666666664**, tre righe senza peso.
- Test permanente per sola incidenza storica: quantità null e messaggio richiesto; zero semplice resta valido. Duplicazione conserva tutti i nove campi semplici. Test «Da kit», ricalcolo mq e round-trip Excel verdi.
- Playwright a **375×1800 / 1280×1800**: scheda, quantità montanti 3,383333, nuova riga vuota con indicazione, N. pezzi=2 e anteprima=2; overflow pagina zero e nessun errore runtime. Copia temporanea senza salvataggi: rimossa. Foto in `/tmp/browser/fm92/screenshots/` (temporanee).
- Percorso autenticato personale non verificato; nessun preventivo o kit di prova creato.

## Ricerca richiesta
Comando:
```sh
rg -l 'kit_parametri|kit_varianti|variante_ruolo|regola_base|regola_moltiplica|normalizzaOperandoKit|calcIncidenzaFromDriver|tipo_driver|valore_driver|tipo_struttura|passo_um|h_max|kit-regole-ui' src/ tests/
```
Output:
```text
src/integrations/supabase/types.ts
src/lib/kit-excel.ts
```
Nel secondo file tutte le occorrenze sono esclusioni «in rimozione FM92», nessuna lettura/scrittura. Tipi generati invariati.

## Rimozioni
- `src/lib/incidenza.ts`
- `src/lib/kit-regole-ui.ts`
- `src/components/kit/ParametriKit.tsx`
- `src/components/kit/ProvaParametriKit.tsx`
- `src/components/kit/RegolaComponenteKit.tsx`
- `tests/kit-regole.test.ts`
- `tests/kit-regole-ui.test.ts`
- `tests/fixtures/fm91-kit-componenti.json` (33 componenti storici, non più usati)
- `tests/sql/fm90-kit-1a.sql` (prova del metodo storico non più pertinente, mai eseguita qui)

## Preparazione alla fetta 2
Pubblicare il codice prima della rimozione delle colonne/tabelle. Le mappe Excel restano allineate ai tipi attuali. La futura migrazione dovrà aggiornare le funzioni SQL che dipendono dai campi ritirati; nessuna funzione SQL è cambiata in questa fetta.

## Elenco completo file modificati/aggiunti

- `docs/regole/kit.md`
- `roadmap.md`
- `src/components/kit/CampiCalcoloKit.tsx`
- `src/components/kit/ComponenteKit.tsx`
- `src/components/kit/RigaKitDialog.tsx`
- `src/lib/AGENTS.md`
- `src/lib/kit-api.ts`
- `src/lib/kit-config.ts`
- `src/lib/kit-excel.ts`
- `src/lib/kit-preventivo.ts`
- `src/lib/kit-regole.ts`
- `src/lib/kit-semplice-ui.ts`
- `src/lib/linee-preventivo.ts`
- `src/lib/preventivi-api.ts`
- `src/routes/_app/kit.$id.tsx`
- `tests/eliminazioni-fetta2b.browser.py`
- `tests/eliminazioni-verificate.browser.py`
- `tests/kit-configurazione.test.ts`
- `tests/kit-motore.test.ts`
- `tests/kit-preventivo.browser.py`
- `tests/kit-preventivo.test.ts`
- `tests/kit-semplice.test.ts`
- `tests/preventivo-fonte-prezzo.browser.py`
- `tests/preventivo-prezzi-cantiere.browser.py`
- `docs/verifiche/fm92-kit-pulizia.md` (nuovo)
- `tests/kit-pulizia.test.ts` (nuovo)
