# FM94 — Fetta 1: articolo manuale e dati Gamma

## Migrazioni applicate

- `drizzle/migrations/0260_fm94_articoli_manuali_gamma.sql`: aggiunta di `codice_famiglia`, `codice_sottofamiglia`, `um2`, `fattore_conversione` nullable e senza default su righe preventivo e componenti kit; vista `famiglie_articoli_gamma` DISTINCT con `security_invoker=true`, SELECT a authenticated/service_role. Nessun UPDATE, backfill o dato di prova.
- `drizzle/migrations/0261_fm94_copia_campi_gamma.sql`: ricreazione delle due funzioni di copia conservando firme, gate, search_path e privilegi. Dopo l'applicazione, confronto delle definizioni reali con quelle precedenti: rimuovendo le sole aggiunte dei quattro campi i corpi risultano identici.
- Tipi generati dal database aggiornati automaticamente; journal e snapshot prodotti dallo strumento.

Verifiche sul database: otto colonne nullable, default NULL; vista security invoker; 1.128 marche attive, 11 codici famiglia. Le coppie famiglia/sottofamiglia con sottofamiglia non vuota sono **162**, non 173 come nel contesto iniziale. Non modificati i dati per adeguare il conteggio.

## Fonte unica e finestra

`esportazione-gamma.ts` definisce codice nuovo, limiti 25/70 e validazione della descrizione e del fattore. Il codice concatena marca e codice fornitore, rimuove ogni spazio e converte in maiuscolo; non tronca i codici lunghi.

La finestra condivisa da preventivi e kit ricerca solo marche attive da due lettere su codice/descrizione e salva il codice; segnala le marche storiche assenti. Famiglia e sottofamiglia vengono dalla vista, con cancellazione della sottofamiglia al cambio famiglia. Descrizione oltre 70 e UM2 senza fattore positivo a massimo quattro decimali disabilitano Salva. Famiglia mancante e codice oltre 25 rimangono avvisi non bloccanti, come richiesto.

## Unità

`rigaInUnita` usa i dati UM della riga manuale come fallback e delega sempre a `unitaArticolo`/`inUnita`. Per gli articoli Gamma conserva la precedenza del catalogo e ignora eventuali metadati manuali. `RigheTable` abilita il selettore anche per manuali convertibili; PDF, dialog ordine ed evasione riusano il medesimo adattatore. Quantità e prezzi persistiti rimangono UM1.

## Punti di copia verificati

1. Dialog → riga preventivo: `ArticoloInDefinizioneDialog.salva` scrive i quattro campi.
2. Dialog → componente kit: `patchManualeKit` in `kit-config.ts`.
3. Lettura/salvataggio/duplicazione kit: `kit-api.ts`, tipi e elenco `COMPONENTE_CAMPI`; `duplicateKit` conserva i quattro campi tramite la copia generica già esistente.
4. DTO articolo manuale kit: `risolviArticolo` in `kit-regole.ts`.
5. Componente kit → riga preventivo: `preparaRigheKitPreventivo` in `kit-preventivo.ts`.
6. Duplicazione preventivo e alternativa: unica mappa di righe in `duplicaPreventivo`, `preventivi-api.ts`.
7. Preventivo → ordine: `public.trasforma_preventivo_in_ordine(uuid,jsonb)`, aggiunte quattro colonne/valori all'INSERT delle righe.
8. Sostituzione kit da Excel: `public.importa_kit_excel(jsonb)` conserva i quattro campi dalla vecchia riga corrispondente (ordine e codice fornitore), come gli altri dati manuali esclusi dal formato Excel.
9. `kit-excel.ts`: quattro nuove voci nella guardia di copertura DB, marcate `escluso: articolo manuale, conservato`; nessuna nuova colonna nel file Excel, template/export/import invariati.

La ricerca delle funzioni SQL che menzionano marca/codice fornitore/listino con righe preventivo o componenti kit ha individuato le due funzioni sopra. `articoli_picker_apertura` legge dati per il picker e non copia righe: lasciata invariata.

## File toccati

- `src/lib/esportazione-gamma.ts` (nuovo)
- `src/components/preventivatore/ArticoloInDefinizioneDialog.tsx`
- `src/components/preventivatore/RigheTable.tsx`
- `src/lib/riga-preventivo.ts`, `src/lib/evasione.ts`
- `src/lib/kit-api.ts`, `src/lib/kit-config.ts`, `src/lib/kit-regole.ts`, `src/lib/kit-preventivo.ts`, `src/lib/kit-excel.ts`
- `src/lib/preventivi-api.ts`
- `src/integrations/supabase/types.ts` (generato)
- `tests/esportazione-gamma.test.ts` (nuovo)
- `tests/kit-configurazione.test.ts`, `tests/kit-motore.test.ts`, `tests/kit-preventivo.test.ts`
- Migrazioni 0260/0261, relativi snapshot/journal generati
- `roadmap.md`, questo rapporto

## Test e prove

- `bun test tests`: **1.258 pass, 0 fail**, 157 file, 4.221 asserzioni.
- Controllo tipi e compilazione automatici: OK nell'ultima verifica; errori transitori precedenti alla rigenerazione dei tipi risolti. Nessuna esecuzione manuale aggiuntiva di build/typecheck.
- Test concreti: spazi/minuscole/mancanti e limite 25; descrizione 70/71; virgola e fattore positivo a quattro decimali; quantità/prezzi manuali con 0,025 e 1,44; precedenza Gamma invariata; copie kit, duplicazione e alternativa.
- Playwright sulle larghezze 320, 375, 390, 768, 1280, 1920: marca storica/ricerca/selezione, famiglia/sottofamiglia e reset, validazioni, codice lungo, salvataggio locale, rilettura nel kit e passaggio UM2. Nessun overflow della pagina e nessun errore runtime. Fotografie controllate per finestra, fondo e tabella.
- Caso UI: 1 T. e prezzo UM1 1.000, fattore 0,025 → 40 NR e prezzo 25; rilettura locale mantiene quantità 1, prezzo 1.000 e `um_scelta=um2`.
- Pagina temporanea `fm94-verifica` rimossa al termine.

### Limite della verifica autenticata

Nessun account auth corrisponde all'email personale del richiedente; non è stato scelto un altro utente. Le prove di compilazione, salvataggio e rilettura usano risposte locali intercettate, non un salvataggio autenticato persistito. Nessun dato di prova lasciato nel database. Il flusso autenticato completo resta da verificare con l'account personale disponibile.

Nessuna nuova dipendenza e nessuna modifica a permessi, formule di conversione o formato Excel. Motore di esportazione Gamma escluso da questa fetta.