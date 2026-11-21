# FM93 — Fetta 2 interfaccia

Nessuna migrazione e nessuna modifica al database.

## Risultato

- Testata ed elenco condividono statoEvasionePreventivo e BadgeEvasione, inclusa la chiusura parziale. Il tooltip della testata legge il nome da profili, tramite RLS, solo quando presente chiuso_da.
- Trasformazione, chiusura e riapertura sono disponibili a chi ha caricato il preventivo; nessun nuovo controllo locale di ruolo. Le RPC della fetta 1 restano l'autorità. I permessi di modifica/eliminazione restano invariati.
- Conferma chiusura, toast e invalidazione documento/elenco/dashboard. Duplica conservato.
- Colonna Evasione abilitata a livello documento, su tutti i blocchi, solo con almeno una quantità ordinata positiva oppure chiusura; ordini esclusi. Schede verticali e tabella orizzontale mantengono le viste precedenti. Rimossi i doppioni sotto Quantità.
- La select dell'elenco usa già `*`: chiuso_at è già incluso, nessuna modifica alla query necessaria.
- Il messaggio del trigger di eliminazione è mostrato verbatim, senza prefisso; la classificazione degli altri errori resta invariata.
- Il dialog prima mostrava UM1: corretto per usare UM2 quando scelta. Totale/Ordinato/Residuo/Da ordinare e importo selezionato usano le conversioni condivise; invio alla RPC in UM1.
- computeEvasione eliminato; dashboard migrata direttamente alla fonte unica, mantenendo il precedente perimetro dei suoi contatori (questa fetta non introduce nuove card dashboard).

## Verifiche

1239 test verdi su 155 file, zero fallimenti; controllo tipi della compilazione automatica OK. Sette nuove prove delle regole: visibilità della colonna, esclusione ordini, UM2 e conversione inversa, blocco trasformazione.

Playwright: 320/375/768/812 orizzontale/1280/1920. Verificati colonna assente a documento aperto senza ordini, presente quando chiuso, chiusura con conferma, riapertura, badge elenco Chiuso · evaso in parte, messaggio esatto con N=2, residuo 3 CF su totale 5 CF e dialog coerente. Nessun errore runtime e nessun overflow esterno; la tabella/dialog scorre internamente dove previsto. Foto stabili 375 e 1280 ispezionate. Verifica su componenti reali montati in pagina temporanea con dati locali, poi rimossa; nessun ordine creato e nessun dato di prova persistente. Non ripetuta la prova autenticata su documento reale: sessione personale non disponibile; le RPC sono già verificate nella fetta 1.

File applicativi: src/lib/evasione.ts, src/lib/esito-eliminazione.ts; src/components/preventivatore/AzioniEvasione.tsx, CellaEvasione.tsx, BadgeTestata.tsx, EvasioneBadge.tsx, PreventiviListView.tsx, RigheTable.tsx, TrasformaInOrdineDialog.tsx; src/routes/_app/preventivatore.$id.tsx e preventivatore.dashboard.tsx. Test: tests/evasione-preventivo.test.ts. Documentazione: src/lib/AGENTS.md, roadmap.md e questo rapporto.