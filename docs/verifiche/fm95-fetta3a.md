# FM95 — Esportazione ordini Gamma, fetta 3a

## Perimetro

Solo struttura, logica pura, scrittura del file e letture aggregate. Nessuna schermata, pulsante, stato «esportato», modifica alle pagine Ordini/Lead o pubblicazione. Nessun dato di prova inserito e nessun dato esistente aggiornato.

## Migrazione applicata

`drizzle/migrations/0263_fm95_ordini_riferimenti_gamma.sql`

- Aggiunta `lead.codice_sdi text NULL`, senza default né aggiornamenti di dati. Verifica sul DB: `udt_name=text`, `is_nullable=YES`, default assente, zero lead con SDI valorizzato.
- Ricreata `public.trasforma_preventivo_in_ordine(uuid,jsonb)` dalla definizione attuale letta con `pg_get_functiondef`.
- Modificati soltanto i tre campi nell'INSERT della testata e i tre valori corrispondenti: `listino_rif`, `macrocategoria_rif`, `categoria_rif`.
- `SECURITY DEFINER`, `search_path=public`, gate `auth_mfa_ok() AND auth_vede_preventivo_id`, blocco sui chiusi, sede, stato automatico Ordinato, contatore derivato e quattro campi FM94 delle righe invariati.
- ACL prima/dopo identica: postgres, authenticated e service_role mantengono EXECUTE; PUBLIC/anon esclusi. Firme non cambiate.
- Confronto della definizione prima/dopo riletta dal DB: eliminando le sole due aggiunte di tre nomi/tre valori, testo identico. Guardia permanente nel test confronta anche 0261 e 0263.
- Types rigenerati automaticamente: soltanto le tre rappresentazioni Row/Insert/Update del nuovo SDI.

### Testata ordine: prima e dopo

| Campo dell'ordine | Prima | Dopo |
|---|---|---|
| tipo | costante `ordine` | invariato |
| numero | progressivo ORD calcolato dalla RPC | invariato |
| data | CURRENT_DATE | invariato |
| cliente_id | v_prev.cliente_id | invariato |
| agente_codice | v_prev.agente_codice | invariato |
| cantiere_id | v_prev.cantiere_id | invariato |
| filiale | v_prev.filiale | invariato |
| fascia_listino | v_prev.fascia_listino | invariato |
| stato | costante `bozza` (ordine creato) | invariato |
| tipo_doc | v_prev.tipo_doc | invariato |
| iva_perc | v_prev.iva_perc | invariato |
| preventivo_origine_id | v_prev.id | invariato |
| titolo | v_prev.titolo | invariato |
| condizione_pagamento_cod | v_prev.condizione_pagamento_cod | invariato |
| alternativa_di | NULL | invariato |
| regime_iva | v_prev.regime_iva | invariato |
| linea | v_prev.linea | invariato |
| store_id | v_prev.store_id | invariato |
| listino_rif | non copiato | v_prev.listino_rif |
| macrocategoria_rif | non copiato | v_prev.macrocategoria_rif |
| categoria_rif | non copiato | v_prev.categoria_rif |

Nota preesistente: la definizione attuale non copia `lead_id` nella testata. Non è stato aggiunto perché la richiesta impone la funzione verbatim salvo i tre riferimenti. Il motore gestisce ordini con `lead_id` già valorizzato; la trasformazione di preventivi a lead rimane fuori da questa correzione.

## File applicativi e test

- **Esteso** `src/lib/esportazione-gamma.ts`: colonne esatte, tipi input/output, regole provvisorie centralizzate, motore puro, problemi per ordine/riga e separazione degli ordini bloccati.
- **Creato** `src/lib/esportazione-gamma-file.ts`: foglio unico Sheet1, intestazione completa di 47 colonne, BIFF8 Excel 97–2003; date con formato `dd/mm/yyyy` e prezzi `0.0000`; nome `.xls`.
- **Creato** `src/lib/esportazione-gamma-dati.ts`: client autenticato esistente, blocchi di 150 chiavi, pagine di 1.000 risultati con ordinamento stabile, letture di tutte le entità richieste e del numero del preventivo di origine. Listini limitati alle coppie articolo/listino realmente richieste dalle sedi degli ordini, senza prodotto cartesiano. Errori propagati; ID mancanti, invisibili o non ordine non vengono saltati silenziosamente. Client iniettabile nei test, nessun client privilegiato.
- **Creato** `tests/esportazione-gamma-motore.test.ts`: 43 casi.
- **Creato** `tests/esportazione-gamma-dati.test.ts`: 7 casi.
- **Aggiornati** `src/lib/AGENTS.md` e `roadmap.md`: fonte unica e stato della fetta. Il registro/snapshot della 0263 sono stati generati esclusivamente dallo strumento migrazioni.

## Fonti uniche riusate

- `isRigaValorizzata`: esclusione di note, separatori, sottototali e intestazioni kit; nessuna formula di totale duplicata.
- `unitaArticolo` / `inUnita`: metadati unità e valori UM1, indipendenti da `um_scelta`.
- `rigaInUnita`: costo unitario manuale dalla rappresentazione salvata.
- `lineaPreventivo`: etichetta della linea nelle NOTE.
- `fornitoreRigaOrdine`, `codiceArticoloNuovo`, `LIMITI_GAMMA`: regole già presenti e API esistenti invariate.

## Tracciato e controlli

- Tutti i documenti fornitore precedono tutti quelli cliente; ordine naturale per numero ordine, poi codice fornitore.
- Una T per coppia ordine/fornitore, una T cliente per ordine, R con i tre identificatori della relativa T.
- QTA1/prezzi UM1, prezzi arrotondati a quattro decimali. Sconti/trasporti zero o nulli diventano celle vuote; il costo/prezzo effettivamente zero resta zero.
- Gli slot sconto Gamma sono conservati; l'extra occupa il primo slot libero. Eventuali sconti nei successivi slot Gamma vengono collocati nei posti liberi; oltre tre sconti effettivi, incluso l'extra, l'intero ordine è bloccato.
- UM2 assente: UM2=UM1 e fattore=1 espliciti per entrambe le tipologie di articolo.
- Anagrafica cliente esistente vuota; per il lead SDI persona fisica `0000000` solo se assente, condizioni dell'ordine prioritarie, sede lead con ripiego sulla sede ordine.
- Ogni bloccante elimina tutti i documenti dell'ordine, senza compromettere gli altri ordini; tutti i problemi restano nel risultato.

## Lettura listini e RLS FM64

Verificati sul DB reale:

```sql
SELECT relrowsecurity, relacl::text,
       has_table_privilege('authenticated','public.articoli_gamma_listini','SELECT')
FROM pg_class WHERE oid='public.articoli_gamma_listini'::regclass;

SELECT policyname, roles, qual FROM pg_policies
WHERE schemaname='public' AND tablename='articoli_gamma_listini' AND cmd='SELECT';

SELECT pg_get_functiondef('public.auth_listini_sede()'::regprocedure),
       pg_get_functiondef('public.auth_consulta_preventivi()'::regprocedure);
```

- RLS attiva, authenticated ha SELECT; authenticated ha EXECUTE sui due helper (PUBLIC/anon no).
- Policy: `auth_consulta_preventivi() AND listino <> 9 AND EXISTS(auth_listini_sede(): globale OR listino corrispondente)`.
- **Amministratore**: `auth_listini_sede` restituisce `globale=true`, indipendentemente dalla propria sede; quindi la policy consente anche i listini delle altre sedi, **tranne il listino 9**, escluso esplicitamente anche per l'amministratore.
- **Altri ruoli con accesso preventivi**, inclusi store_manager/showroom/responsabile_showroom: se hanno sede con listino di riferimento, vedono solo quel listino. Se il profilo non ha sede, oppure la sede non ha listino di riferimento, l'helper corrente concede ambito globale, sempre con esclusione del 9. Chi non soddisfa `auth_consulta_preventivi` non legge i listini.
- Se il listino dell'ordine è escluso dalla RLS, la lettura restituisce zero dati d'acquisto: il motore segnala `acquisto_assente` e lascia PRZ1 fornitore vuoto, senza usare il listino di un'altra sede. Nessuna RLS modificata.

**Limite della verifica autenticata**: il tool di lettura opera con ruolo tecnico e non consente `SET ROLE authenticated` (`permission denied to set role "authenticated"`); non può nemmeno eseguire gli helper riservati ad authenticated. Il tentativo di sessione personale `auth-session --self` non trova un account associato al richiedente. Sono verificati struttura, ACL e predicati effettivi, ma **non è stata eseguita una lettura live con sessione amministratore attraverso il nuovo loader**. Non sono stati mintati accessi ad account altrui né ampliati permessi. I test del loader esercitano il vero client PostgREST con trasporto locale isolato, non dimostrano la RLS live.

## Verifiche

- **1.313 test verdi**, zero fallimenti, 160 file: tutti i 1.263 preesistenti e 50 nuovi.
- **Typecheck automatico OK**: ultimo esito del controllo della piattaforma dopo gli aggiornamenti del motore è `build OK` (22/11/2026, 17:38:39 UTC). Nessun build/typecheck lanciato manualmente.
- Test includono elenco colonne letterale, documenti e raggruppamento, fornitore preferenziale/override, doppia sede e listino d'acquisto, costo manuale, sconti con slot libero, limiti 25/70, tutti i bloccanti richiesti, avvisi, esclusione totale del singolo ordine, unità e condizioni lead.
- Loader: 1.205 righe senza perdita in due pagine, 151 ordini in due blocchi, selezione delle coppie listino/articolo, propagazione errori, invisibilità, duplicati e input vuoto.
- Flusso integrato isolato: letture → motore → scrittura .xls → rilettura XLSX, con prezzi diversi per le due sedi.
- File verificato anche a livello binario: contenitore CFB (`D0 CF 11 E0 A1 B1 1A E1`), stream Workbook con BOF BIFF8 versione `0x0600`, non .xlsx rinominato; Sheet1 unico, tutte le 47 intestazioni, data `10/12/2026`, prezzo a quattro decimali.
- Nessuna pagina toccata: verifiche fotografiche non applicabili a questa fetta senza interfaccia.

## Scostamenti e motivazioni

1. **Costo manuale**: contrariamente al contesto della richiesta, `righe_preventivo.costo` è un costo **totale** (`costoRiga` e `docs/regole/prezzi-preventivo.md`, riga 103), anche nella finestra manuale. Copiarlo direttamente in PRZ1 moltiplicherebbe il prezzo per la quantità. Il motore riusa `rigaInUnita(..., um_scelta='um1').costo_unit`: ad esempio quantità 5/costo totale 100 → PRZ1=20. Nessun dato o formula di salvataggio cambiati.
2. La chiave effettiva del catalogo pagamento è `codici_pagamento.cod`, non `codice`: lettura e lookup usano il nome reale, verificato sul DB.
3. Il nome file usa data/ora `Europe/Rome`, con locale italiano, per un nome coerente tra dispositivi; la richiesta non specifica il fuso.
4. Due controlli difensivi aggiuntivi evitano file scorretti quando il destinatario o l'articolo Gamma non sono leggibili: `destinatario_assente` e `articolo_non_leggibile`, bloccanti. Nessun dato nascosto viene ricostruito o sostituito con un articolo manuale.
5. Limite di verifica RLS live e mancata copia preesistente di `lead_id` documentati sopra; nessuna correzione fuori perimetro.

**Pubblicazione non eseguita.**