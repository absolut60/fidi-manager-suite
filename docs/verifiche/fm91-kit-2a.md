# FM91 — Kit, tappa 2, fetta 2a

20/11/2026. Schema del motore a regole e calcolo unico TypeScript; nessuna schermata o import Excel.

## Migrazioni applicate

- **0251 — `drizzle/migrations/0251_fm91_kit_motore_regole.sql`**: sei operandi nullable e `variante_ruolo` sui componenti; CHECK della grammatica, ordine univoco nel kit; `kit_parametri`, `kit_varianti`, `kit_varianti_articoli`, chiavi esterne e vincoli; una sola variante predefinita per kit.
- **0252 — `drizzle/migrations/0252_fm91_kit_regole_accesso_autenticato.sql`**: il controllo successivo ha rilevato privilegi `anon` ereditati dai default del database, anche se nessuna policy permetteva letture anonime. Revocati sulle **sole tre tabelle nuove**; authenticated conserva soltanto SELECT/INSERT/UPDATE/DELETE, service_role tutti i privilegi. Nessuna modifica a privilegi/policy dei componenti preesistenti.
- Verificati sul database reale: sei CHECK operandi, UNIQUE `(kit_id, ordine)`, UNIQUE dei parametri/varianti/ruoli, indice unico parziale della predefinita, FK CASCADE e fornitore SET NULL; RLS attiva, tre policy e un trigger `update_updated_at` per ciascuna tabella nuova.
- SELECT con `auth_consulta_preventivi`, gestione con `auth_puo_gestire_anagrafiche_prev`, restrittiva FM44 con `auth_mfa_ok`: stessi gate dei componenti. Tutti i gate dipendenti soltanto dall'utente sono valutati mediante SELECT. Nessuna nuova funzione SQL o firma modificata.

## Calcolo unico

- `src/lib/kit-regole.ts`: `calcolaKitRegole`, tipi di input/output e `normalizzaOperandoKit`, puro e browser-safe. Nessuna query, prezzo o dipendenza da UI; nessun confronto di linea.
- Formula unica con priorità BASE → incidenza → driver; `0` non è un vuoto. Operandi numerici normalizzati con punto, parametri e riferimenti agli ordini numerici di altre righe.
- Parametri: default → impostazioni della variante → valori esterni, incluso zero. Variante selezionata per ID oppure predefinita; articolo per ruolo Gamma/manuale, con errore se assente o duplicato.
- Dipendenze calcolate a prescindere dall'ordine dell'input, memoizzazione per riga, rilevamento dei cicli; errori italiani su righe e dipendenze, quantità null anziché NaN/Infinity/zero silenzioso. Righe indipendenti continuano a funzionare.
- Nessun arrotondamento; quantità UM1. CONFEZIONE è esclusivamente il divisore esplicito della regola, mai estratto da Gamma. Il solo ripiego driver riusa `calcIncidenzaFromDriver` e può ricevere la sua confezione storica esplicita.
- `kit-api.ts`: **solo aggiustamento del tipo DTO** `KitComponente`, escludendo i sette campi nuovi che le SELECT delle schermate 1b non leggono ancora. Query, insert/update/duplicazione, handler e comportamento attuali invariati.
- Decisione tecnica registrata nell'AGENTS di area, già sede delle regole kit; root AGENTS saturo e non modificato.

## Numeri Excel e precisione

Parametri: PASSO=0,6, MONTANTE=2, LATI=2, NR_GUIDE=1. Negli esempi di test guide/montanti corrispondono agli ordini 1/2; non sono accettati operandi `RIGA:guide` o `RIGA:montanti`, perché la grammatica richiesta usa ordini numerici.

| Riga | Risultato senza arrotondamento |
|---|---:|
| Guide | 0,716667 |
| Montanti | 3,383333333333333… |
| Tasselli PZ | 1,433334 |
| Viti CO/1000 | 0,016916666666666… |
| Stucco FAS351E1 NR/10 kg | 0,08 |
| Nastro RT/90 ml | 0,032 |
| Variante NR_GUIDE=2: guide / tasselli | 1,433334 / 2,866668 |

**Precisazione aritmetica:** usando la BASE fornita `0.716667`, la formula `BASE / 0.5` produce esattamente `1.433334`, non `1.433333`. I test rispettano formula e assenza di arrotondamenti, senza correggere artificialmente il risultato. Gli altri valori periodici indicati nel brief sono approssimazioni di visualizzazione.

## Integrità dei dati reali

Prima e dopo entrambe le migrazioni:

- Kit: **3**; componenti: **33**; nessun duplicato `(kit_id, ordine)` iniziale.
- Parametri / varianti / articoli variante: **0 / 0 / 0**. Nessun INSERT di prova, neppure da una schermata o da un test.
- I sette nuovi campi sono NULL su tutte le 33 righe.
- Impronta dei kit invariata: `095a7c162892b5cdea4776f37f1f5d06`.
- Impronta dei componenti, escludendo le sole colonne aggiunte, invariata: `1f424a3b59531ee3000729e465953a44`. Comprende date e tutti i campi storici.
- Fixture di sola lettura in `tests/fixtures/fm91-kit-componenti.json`: tutte le 33 incidenze conservano la precisione originale; applicando `round4` solo per confronto di visualizzazione coincidono con `incidenzaEffettivaKit`. Il percorso attuale, che arrotonda in visualizzazione, non è stato modificato.

## Verifiche

- `bun test`: **1196 pass, 0 fail**, 151 file, 3927 asserzioni.
- 36 test nuovi FM91: formule Excel, precedenze/default/vuoti, parametri e varianti, articoli manuali, RIGA fuori ordine/cicli/inesistenti, tre divisioni per zero, errori e valori non finiti, incidenze reali, immutabilità input.
- Guardia AST di `linee-preventivo` e guardia delle eliminazioni verdi, **non modificate**. La pulizia dello stato di ricorsione usa una Map di booleani e non aggiunge eccezioni alla guardia.
- `git diff --check`: pulito. Compilazione automatica: `build OK` (ultima verifica 19:36:28 UTC).
- Verifica `tsgo -b --noEmit` autonoma non eseguita: in questa sessione compilazioni/typecheck manuali del progetto non sono consentiti; il segnale automatico disponibile certifica la compilazione, non un'esecuzione separata di tsgo.
- Nessuna modifica a schermate kit/preventivi, `kit-legacy.ts`, percorso “Da kit”, prezzi, dati o servizi esterni. Nessuna prova UI/screenshot necessaria per questa fetta priva di variazioni visive; il motore è verificato direttamente dai test, non ancora collegato all'app.

## File modificati

- `src/lib/kit-regole.ts` (nuovo)
- `src/lib/kit-api.ts` (solo tipo DTO)
- `src/lib/AGENTS.md`
- `src/integrations/supabase/types.ts` (generato dalla piattaforma)
- `tests/kit-regole.test.ts` (nuovo)
- `tests/fixtures/fm91-kit-componenti.json` (nuovo)
- `drizzle/migrations/0251_fm91_kit_motore_regole.sql`
- `drizzle/migrations/0252_fm91_kit_regole_accesso_autenticato.sql`
- `drizzle/migrations/meta/_journal.json`, `0251_snapshot.json`, `0252_snapshot.json` (generati dalla piattaforma)
- `docs/regole/kit.md`
- `docs/verifiche/fm91-kit-2a.md`
- `roadmap.md`

Fette 2b/2c e gemello SQL esclusi come richiesto. Le integrazioni autenticate pregresse dei form 1b restano fuori ambito e hanno il loro blocco già documentato.