# Linea del preventivo (FM72)

- Il preventivatore resta unico: la linea è un attributo del documento, non un secondo preventivatore.
- Fonte unica di configurazione: `src/lib/linee-preventivo.ts`, catalogo `LINEE_PREVENTIVO`. Etichette, attivazione, colori e ogni futuro comportamento specifico passano dal catalogo; mai confronti diretti con i codici delle linee sparsi nell'app. La guardia AST in `tests/linee-preventivo.test.ts` verifica questa regola.
- Il tipo database contiene Sistema MADE, Showroom, Edilizia e Fotovoltaico. Oggi solo Sistema MADE è attiva: tutti i documenti esistenti sono Sistema MADE. Nuovi codici richiedono una migrazione `ALTER TYPE`; l'attivazione richiede solo configurazione.
- La creazione dal dialog passa sempre la linea dell'utente (tappa ③b, sotto); duplicazioni e alternative copiano quella dell'origine tramite l'opzione documentata `{ linea }` di `createPreventivo`.
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
| responsabile_showroom | tutte le sedi ∩ linee abilitate, lettura e scrittura |

- Sopra il perimetro resta identico il limite agente (`agente_vede_record`), da cui sono esenti amministratore e preventivi_manage. Direzione non è inclusa. `auth_consulta_preventivi` (gate di listini/catalogo/fornitori) non cambia.
- Cambi voluti: lo store manager vede solo la propria sede; lo showroom solo propria sede e linee abilitate.
- Test: `tests/sql/fm72-tappa3-visibilita.sql` (BEGIN/ROLLBACK, utente fixture).

### Tappa ③b — campi protetti, gestione utenti e creazione

- `linee_abilitate` e `linea_predefinita` sono campi protetti come sede, codice agente e stato attivo: il trigger `profili_blocca_campi_protetti` rifiuta la modifica a chi non è amministratore (anche sulla propria riga). Test: `tests/sql/fm72-tappa3-campi-protetti.sql`.
- Gestione utenti: sezione "Linee preventivatore" nella modifica utente (quattro linee dal catalogo, quelle non attive con "— non ancora attiva"), almeno una obbligatoria, predefinita limitata alle abilitate e riallineata con `riallineaPredefinitaProfilo`. Salvataggio via `updateUtenteRuoli` (solo amministratore).
- Creazione: `NuovoPreventivoDialog` legge la propria riga di profili (`useLineeUtente`) e usa `selettoreLineaCreazione` (`lineeUtente` = abilitate ∩ attive; `lineaPredefinitaEffettiva`). Più linee → selettore; una → nessun selettore; nessuna → "Crea" disabilitato con messaggio.
- Regola: la creazione da dialog passa SEMPRE la linea dell'utente a `createPreventivo(row, { linea })`; duplicazioni e alternative passano la linea dell'origine; una `linea` dentro `row` è sempre ignorata.
- Anche la trasformazione in ordine conserva la linea: `trasforma_preventivo_in_ordine` copia `linea` del preventivo nella testata dell'ordine (migrazione `0237_fm75_ordine_conserva_linea.sql`). Prima la colonna veniva omessa e il default `sistema_made` riattribuiva la linea, con visibilità FM72 e comportamenti di linea sbagliati. Prova transazionale con rollback: `tests/sql/fm75-articolo-definizione-ordine.sql` (verifica `showroom -> showroom` e `sistema_made -> sistema_made`).

### Tappa ④a — responsabile showroom (solo database)

- `responsabile_showroom` eredita permessi e divieti showroom senza vincolo di sede e senza sede richiesta nel profilo; nessun ruolo assegnato automaticamente.
- Fonte unica del perimetro showroom: `public.showroom_sede_ok(store_id)`, usata dalle policy lead showroom (anche INSERT restrittiva) e dai relativi helper. Gli altri ruoli mantengono i propri confronti di sede.
- Preventivi in lettura e scrittura su tutte le sedi, solo nelle linee abilitate; il limite agente resta invariato. `auth_consulta_preventivi` include il nuovo ruolo.
- Migrazioni separate per commit dell'enum e uso del valore: `0230_fm72_responsabile_showroom_enum.sql`, `0231_fm72_responsabile_showroom_perimetro.sql`. Test: `tests/sql/fm72-tappa4-responsabile-showroom.sql`, transazione aal2 con rollback. Nessuna modifica all'interfaccia in questa fetta.

### Tappa ④b — gemelli TS (solo frontend)

- I gemelli in `permessi-showroom.ts` e `permessi-preventivi.ts` riconoscono il nuovo ruolo; dettagli in `sicurezza-permessi.md`. Il responsabile, anche insieme a preventivi_write, non viene bloccato dalla mancanza del codice agente nella creazione.
- Il selettore delle linee abilitate resta identico; il database mantiene il controllo effettivo della linea. Nessuna migrazione o nuova schermata.

## Comportamenti per linea — F1 showroom (FM75)

Ogni linea nel catalogo (`src/lib/linee-preventivo.ts`, campo `blocchi`) dichiara:

| Linea | bloccoConMisure | bloccoDaKit | righeStampabili | regimiIva |
|---|---|---|---|---|
| Sistema MADE | sì | sì | no | no |
| Showroom | no | no | sì | sì |
| Edilizia | sì | sì | no | no |
| Fotovoltaico | sì | sì | no | no |

- `bloccoConMisure = false`: testata del blocco "spoglia" (trascinamento, "Blocco N", Descrizione, Importo, cestino); niente Rif., Quantità, U.M., Prezzo/U.M., ricalcolo su quantità; nelle righe niente colonna/campo Incidenza né avviso sulla quantità del blocco.
- `bloccoDaKit = false`: "Aggiungi blocco" crea solo un blocco vuoto con titolo, senza tab Kit e senza quantità base.
- Edilizia e Fotovoltaico conservano il comportamento attuale; si decide alla loro attivazione.
- La linea arriva per prop dalla pagina del preventivo (nessuna lettura extra); ogni uso passa da `lineaPreventivo(...)`, mai confronti diretti con i codici (guardia AST nei test).
- `righeStampabili = true` (F2c): occhio Stampabile Sì/No nelle azioni di ogni riga valorizzata (non sulla riga raccoglitore PEF), riga attenuata se nascosta, pulsante "Vista commerciale" (anteprima da `vistaCommerciale`, v. `vista-commerciale.md`).
- `regimiIva = true` (F3c): selettore "Regime IVA" in Testata (22% ordinaria, 10% agevolata, 10% + beni significativi); solo nel regime con beni significativi, toggle "BS" nelle azioni delle righe valorizzate e badge BS accanto alla descrizione; nel Piede e nella Vista commerciale riepilogo per aliquota da `riepilogoIva` con avvisi morbidi (`avvisiRegimeIva`). I totali salvati restano su `iva_perc` fino a F3d (v. `calcolo-iva.md`).
- Eccezione SQL ammessa (F4a): `trasforma_preventivo_in_ordine` confronta `linea = 'showroom'` perché il catalogo TS non arriva al database. Showroom: l'ordine conserva la descrizione salvata sulla riga (varianti); altre linee: descrizione ripristinata da Gamma per le righe con articolo. Ogni nuova eccezione va documentata qui.
- Righe "articolo in definizione" (F4a, solo dato): `fornitore_id`, `marca`, `codice_articolo_fornitore` (aggancio ad `articoli_gamma_fornitori`), `listino_fornitore` (listino del fornitore, non Gamma); copiati in duplicazione/alternativa e nell'ordine.
- Prezzi, `fonte_prezzo` e stampa (PDF, fetta F6) invariati.
