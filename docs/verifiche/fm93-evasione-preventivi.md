# FM93 — Fetta 1, 21/11/2026

## Migrazione applicata

`drizzle/migrations/0257_fm93_evasione_preventivi.sql`, una transazione: trigger quantità derivate e riallineamento, colonne nullable `chiuso_at timestamptz` e `chiuso_da uuid REFERENCES profili(id)`, RPC chiusura/riapertura, trasformazione e guardia cancellazione. Il numero 0257 è quello assegnato dal registro Drizzle: `docs/migrazioni-manuali/0257_fm92_kit_pulizia_schema.sql` resta solo documentazione della precedente operazione manuale, non è stato rieseguito.

Fonte unica: `src/lib/evasione.ts`, con `statoEvasioneRiga` e `statoEvasionePreventivo`. `computeEvasione` resta un adattatore senza calcoli propri, per non introdurre il badge Chiuso nella fetta 1. Tutti i confronti delle quantità in tabella, dialog e dashboard delegano alla fonte unica. API `chiudiPreventivo` e `riapriPreventivo` pronte; nessun pulsante, colonna o messaggio nuovo nell'interfaccia.

## Verifiche reali

- `pg_get_triggerdef`: `CREATE TRIGGER trg_ricalcola_qta_ordinata AFTER INSERT OR DELETE OR UPDATE OF quantita, riga_origine_id ON public.righe_preventivo FOR EACH ROW EXECUTE FUNCTION ricalcola_qta_ordinata_origine()`.
- Funzione trigger SECURITY DEFINER, search_path public, EXECUTE revocato a PUBLIC/anon/authenticated; ricalcola entrambe le origini distinte in ordine UUID.
- `information_schema`: entrambe le colonne di chiusura nullable, tipi attesi.
- `pg_get_functiondef(trasforma_preventivo_in_ordine)`: identico al file applicato. Confronto verbatim con la precedente definizione: cambiano solo gate, controllo chiuso, store_id nell'INSERT e rimozione incremento.
- PRV-164/26: 14 righe totali, 11 contatori prima positivi riallineati a 0; tutte le 14 righe ora a 0.
- Transazione con ruolo authenticated e claims Andrea aal2: ordine parziale 4 → secondo ordine somma 8 → eliminazione secondo ordine 4 → modifica quantità ordine 6 → eliminazione ultimo ordine 0. Sede identica all'origine. Eliminazione preventivo con due ordini rifiutata con messaggio N=2.
- Chiusura registra timestamp/autore; seconda chiusura rifiutata; trasformazione chiuso rifiutata col messaggio atteso; riapertura azzera i due campi e permette nuovamente l'ordine. Claims aal1 dell'amministratore rifiutate.
- Seconda transazione con utente reale non amministratore, che vede il preventivo: trasformazione 4, chiusura e riapertura superate.
- ROLLBACK in entrambe le prove: 0 ordini, PRV-164 aperto e quantità tutte 0. Nessun dato di prova persistente.
- Prova SQL permanente: `tests/sql/fm93-evasione-preventivi.sql`.

## Test e sicurezza

- 1232 test verdi, 0 fallimenti (155 file), inclusi 12 nuovi test canonici.
- Compilazione automatica con controllo tipi: OK dopo rigenerazione dei tipi.
- Scansione database completata: nessun risultato non ignorato e nessun nuovo risultato.
- Foto Playwright 375 e 1280: badge parziale, quantità Ord. 4/10 ed Evasa 10/10, residui dialog 10/6/0 e selezione delle sole due righe residue; nessun errore runtime. Verifica su pagina temporanea con dati locali, rimossa. Accesso personale automatico indisponibile; le operazioni persistenti sono state invece verificate sul database con impersonazione reale e ROLLBACK.
- La finestra su telefono conserva la tabella con scorrimento interno precedente; nessuna modifica di impaginazione in questa fetta.

Nota documentazione: la regola di evasione/chiusura e di trasformazione per chi vede va recepita dal proprietario nelle regole di area. AGENTS.md alla capienza massima: nessuna regola preesistente abbreviata.