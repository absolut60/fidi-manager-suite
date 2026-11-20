# FM90 — Kit motore unico, tappa 1a

Verifica del 20/11/2026. Migrazione applicata: `drizzle/migrations/0250_fm90_kit_motore_unico.sql`.

## Diagnosi e intervento

- Database iniziale: 3 kit di prova, 33 componenti; famiglie ancora enum `kit_famiglia`.
- Policy reali di kit/componenti: SELECT con `auth_consulta_preventivi`, ALL con `auth_puo_gestire_anagrafiche_prev` e WITH CHECK, più restrittiva “Secondo fattore (FM44)”. Le policy esistenti non sono state modificate.
- Nuova `kit_famiglie` con gli stessi gate, chiamate dipendenti solo dall'utente come `(SELECT f())`, grant espliciti ad authenticated/service_role e trigger `update_updated_at` esistente.
- Le sei righe Sistema MADE sono il backfill dell'enum esistente tramite `INSERT ... SELECT ... unnest(enum_range(...))`, parte del passaggio additivo alla nuova tassonomia; nessun catalogo estraneo modificato.
- Kit: codice univoco, linea, famiglia e specifiche nuove; codici PROVA deterministici per `created_at, id`; chiavi specifiche `spessore_mm`/`h_max_m` con valori/unità dei campi storici.
- Componenti: codice Gamma soltanto se presente davvero in `articoli_gamma`; gli altri diventano manuali nei nuovi campi (codice storico Gamma, altrimenti codice fornitore storico; descrizione e U.M. conservate). Nessun costo, marca, listino o fornitore inventato nel backfill.
- Nessuna rimozione, nessuna modifica a `blocchi_preventivo`, `righe_preventivo` o `preventivi`, nessuna nuova funzione SQL o firma modificata.

## Conteggi finali, riletti dopo la prova annullata

| Dato | Conteggio |
|---|---:|
| Kit | 3 |
| Kit con codice, linea Sistema MADE e famiglia_id | 3 |
| kit_famiglie | 6 |
| kit_componenti | 33 |
| Componenti con articolo_codice Gamma | 30 |
| Componenti manuali | 3 |
| Righe di prova rimaste | 0 |

Specifiche dei kit PROVA-1/2: `tipo_struttura=SINGOLO`, `passo=600`, `passo_um=MM`; PROVA-3: `{}`. Campi nulli esclusi, non convertiti in valori fittizi.

Impronte di **tutti i campi storici**, date incluse, identiche prima/dopo:

- Kit: `f33fc98284f3a2cee3c33b9979a1499d`.
- Componenti: `16f83ff155f31af9c95a93943cf400cd`.

I trigger delle date sono stati disabilitati solo durante il backfill nella transazione della migrazione e riabilitati: tutti risultano `O` (abilitati) dopo l'applicazione.

## Compatibilità e limiti della transizione

- Nessuna schermata o logica di calcolo modificata; la configurazione kit è solo dichiarata nel catalogo linee.
- Gli INSERT della schermata attuale non inviano codice: default tecnico transitorio `LEGACY-<uuid>` per non bloccarli con il nuovo NOT NULL. Nuovi kit dalla schermata storica non compilano ancora famiglia_id/specifiche; la 1b porterà le schermate ai nuovi campi. I tre kit richiesti sono interamente riallineati.
- La duplicazione attuale copiava ogni campo ottenuto da `SELECT *`: avrebbe ricopiato il nuovo codice univoco. Unico adeguamento necessario in `kit-api.ts`: omettere il codice originale e usare il default per la copia, conservando il comportamento visibile.
- **Pubblicazione necessaria per la duplicazione sull'app pubblicata:** la migrazione è già sul database condiviso; il vecchio codice pubblicato copierebbe il codice originale e riceverebbe un errore di unicità finché questo adeguamento non viene pubblicato. Creazione/modifica storiche sono state provate nel database. Non è stata eseguita una pubblicazione automatica.
- Il backfill non sincronizza continuamente nuovi campi e campi storici; tale passaggio resta nella 1b. Nessuna eliminazione nella 1a.

## Verifiche

- `bun test`: **1146 pass, 0 fail**, 149 file, 3722 asserzioni; 7 test nuovi per copertura enum/configurazione, duplicazione e precedenza incidenza esplicita anche a zero.
- `tsgo -b --noEmit`: uscita 0, nessun errore.
- Compilazione automatica: `build OK`, ultimo controllo 18:56:08 UTC.
- `tests/sql/fm90-kit-1a.sql` eseguito sul database reale: verifiche puntuali backfill, conteggi, RLS/grant, anon vede zero famiglie, default, codice duplicato rifiutato, creazione kit/componente e modifica con i campi storici.
- Esito positivo `OK_ROLLBACK`: l'eccezione finale intenzionale annulla tutte le scritture; successiva lettura conferma 3/6/33, 30 Gamma + 3 manuali, zero fixture e impronte storiche immutate.
- Il database eredita grant anon sulle nuove tabelle come già sui kit; nessuna policy anon e prova `SET ROLE anon` = zero righe. Non è stato ampliato alcun accesso applicativo.
- Nessuna prova browser autenticata in questa tappa puramente strutturale; interfacce non modificate. Nessuna chiamata ad API esterne.

## File modificati

- `drizzle/migrations/0250_fm90_kit_motore_unico.sql`
- `drizzle/migrations/meta/_journal.json` (generato dallo strumento)
- `drizzle/migrations/meta/0250_snapshot.json` (generato dallo strumento)
- `src/integrations/supabase/types.ts` (rigenerato dallo strumento)
- `src/lib/linee-preventivo.ts`
- `src/lib/kit-api.ts`
- `tests/kit-configurazione.test.ts`
- `tests/sql/fm90-kit-1a.sql`
- `docs/regole/kit.md`
- `docs/regole/README.md`
- `docs/verifiche/fm90-kit-1a.md`
- `roadmap.md`

Nuova fonte di configurazione documentata: `LINEE_PREVENTIVO[linea].kit`; principi in `docs/regole/kit.md`. Root `AGENTS.md` lasciato invariato perché al limite di dimensione, senza riscrivere regole del proprietario.