# Linea del preventivo (FM72)

- Il preventivatore resta unico: la linea è un attributo del documento, non un secondo preventivatore.
- Fonte unica di configurazione: `src/lib/linee-preventivo.ts`, catalogo `LINEE_PREVENTIVO`. Etichette, attivazione, colori e ogni futuro comportamento specifico passano dal catalogo; mai confronti diretti con i codici delle linee sparsi nell'app. La guardia AST in `tests/linee-preventivo.test.ts` verifica questa regola.
- Il tipo database contiene Sistema MADE, Showroom, Edilizia e Fotovoltaico. Oggi solo Sistema MADE è attiva: tutti i documenti esistenti sono Sistema MADE. Nuovi codici richiedono una migrazione `ALTER TYPE`; l'attivazione richiede solo configurazione.
- Creazione ordinaria omette la linea e usa il default database; duplicazioni e alternative copiano quella dell'origine attraverso l'opzione interna di `createPreventivo`.
- `BadgeLinea` presenta sempre colore e testo in elenco (incluse alternative), scheda e tab Preventivi del cliente/lead. Il filtro multiplo è conservato da `useFiltriPagina` ma mostrato/applicato solo quando `mostraFiltroLinee` è vero, cioè quando esistono almeno due linee attive.
- Nessuna modifica ai prezzi. La visibilità per linea e per sede è attiva dalla tappa ③ (sezione sotto).
- Migrazione: `0227_fm72_linea_preventivo.sql`. Prova database transazionale: `tests/sql/fm72-linea-preventivo.sql`.
## Tappa ③ — abilitazioni sul profilo e visibilità per sede/linea

- `profili.linee_abilitate` (default `{sistema_made}`) e `profili.linea_predefinita` (default `sistema_made`): il default ha fatto da backfill, nessuno ha cambiato linee.
- Helper unico `public.auth_linee_abilitate()` (linee dell'utente corrente, `{}` senza profilo).
- Lettura: `auth_vede_preventivo(agente, cliente, cantiere, lead, linea, store)`; scrittura: `auth_puo_scrivere_preventivo(agente, linea)`. Le firme vecchie non esistono più; i wrapper (`auth_vede_preventivo_id`, `auth_puo_scrivere_preventivo_id`, `auth_puo_scrivere_blocco`) e le RPC cliente del preventivatore passano `linea` e `store_id` della riga.

| Ruolo | Perimetro di lettura |
|---|---|
| amministratore | tutti |
| preventivi_manage / write / read | tutte le sedi, solo linee abilitate |
| store_manager | solo la propria sede (`profili.store_id`), tutte le linee |
| showroom | propria sede ∩ linee abilitate |

- Sopra il perimetro resta identico il limite agente (`agente_vede_record`), da cui sono esenti amministratore e preventivi_manage. Direzione non è inclusa. `auth_consulta_preventivi` (gate di listini/catalogo/fornitori) non cambia.
- Cambi voluti: lo store manager vede solo la propria sede; lo showroom solo propria sede e linee abilitate.
- Test: `tests/sql/fm72-tappa3-visibilita.sql` (BEGIN/ROLLBACK, utente fixture).
