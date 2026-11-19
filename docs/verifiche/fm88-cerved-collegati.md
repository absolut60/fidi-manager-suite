# FM88 — Esponenti e società collegate

## Numerazione
La scheda Cerved e la lettura del report precedenti sono registrate come **FM87**, nel rapporto rinominato `fm87-cerved-lettura.md` e nella roadmap. **FM86** resta la correzione sede/logo PDF PRV-172/26. Questa estensione è **FM88**.

## Fonte e normalizzazione
- Unico percorso verificato nel caso G-E TRADE: `LightReport/PositionCompany/PositionRelatedCompany`.
- Director → `esponenti`: IDPerson, SubjectId, nome/cognome, CF, data/luogo/provincia nascita, tutti i Position con codice, tipo, inizio/fine e ActiveLink.
- RelatedCompany → `societa_collegate`: IDCompany, nome, forma giuridica/descrizione/codice, CF, stato/descrizione/data stato, costituzione, ATECO2025 codice e testo, capitale, Revenue/Profit con data e valuta, NegativeEvents, Group, richieste 12 mesi, LinkSubjectId e tutti i Position.
- Revenue/Profit già in euro nell'XML G-E TRADE, senza moltiplicazione per mille. Codici sconosciuti non decodificati. Assenti → null; PositionCompany assente → elenchi vuoti.
- Persona e impresa individuale FILIPPI CORRADO restano distinte: IDPerson 850589 e IDCompany 12745313, anche con stesso CF. Nessuna deduplica per CF/nome nella nuova sezione.

## Riallineamento
Letti 60 XML da `cerved_chiamate.risposta.contenuto_xml` tramite il chiamata_id della fotografia. Aggiornate soltanto **esponenti** e **societa_collegate** in 60 fotografie: 60 esponenti e 281 società complessivi; 11 XML senza questa sezione hanno entrambi gli elenchi vuoti.

Rilettura completa: le nuove chiavi sono identiche al risultato del normalizzatore TypeScript su tutti i 60 XML, **zero differenze**. Tutte le chiavi precedenti sono identiche alla copia precedente: nessuna modifica di bilanci, score, lettura report o dati cliente. Nessuna migrazione né chiamata Cerved.

## Risultato G-E TRADE
- Un esponente FILIPPI CORRADO, Amministratore unico dal 26/11/2019 e Socio unico dal 17/02/2020, entrambi in corso.
- Sette società, ordinate: CENTRO DENTALE 33 SRL (attiva, ruolo cessato 30/12/2016), LEXUS (cancellata 17/07/2024), R.S. (01/09/2023), CHRISTIAN (23/11/2016), FILIPPI CORRADO impresa individuale (10/02/2014), G.L.C. (16/11/2011), EDIL VENETA (29/01/2009).
- Centro Dentale: fatturato 2015 938 mila €, perdita 10 mila €, gruppo SARTORI.
- Lexus: fatturato 2018 554 mila €, utile 5 mila €, badge Stesso settore (primi quattro caratteri ATECO coincidenti), due ruoli cessati.
- Christian: tutti e tre i ruoli; Consigliere senza EndDate limitato alla cancellazione, Vicepresidente e Consigliere delegato cessati 07/05/1997.
- G.L.C., EDIL VENETA e FILIPPI impresa individuale: ruoli senza EndDate → fino alla cancellazione, non in corso.
- NegativeEvents assente su Lexus e Christian: nessuna voce evento per queste società. Altre cinque false → Nessuno. Nessun flag numerico o di relazione interpretato come evento.
- Casella Elementi principali considera booleani persone e NegativeEvents società: Nessuno segnalato sul caso reale; test con eventi true restituisce nomi e tono rosso.

## Interfaccia e verifiche
- Nuova sezione al posto del precedente Soggetti collegati, subito dopo Elementi principali: sintesi, Esponenti, sette società in schede impilate su telefono/tablet verticale e due colonne su PC.
- Stato cancellato grigio, attività e legami in corso verdi, rosso soltanto per eventi negativi true o descrizioni di liquidazione/fallimento/procedura.
- Tutti i sette elementi fotografati con Playwright a **375×812, 768×1024 touch, 1280×1800, 1920×1080**: sette società a ogni dimensione, overflow 0, nessun errore JavaScript, nessuna richiesta Cerved. Sintesi e ultimi elementi controllati; due imprese individuali e un badge Stesso settore.
- Verifica usa VistaCerved effettiva con fotografia reale riletta dal database su pagina temporanea, poi rimossa. Accesso all'indirizzo reale della scheda verificato: porta al login. Sessione personale indisponibile; collaudo autenticato non eseguito e non dichiarato completato.
- L'app non espone un selettore di tema; verifica nello stile chiaro disponibile.
- **bun test: 1111 superati, 0 falliti**, 144 file; test nuovi di normalizzazione, persona/società distinte, date, importi, ordinamento, settore, ActiveLink e negatività.
- Compilazione automatica OK. File della Lettura del report invariato, nessuna regola nuova.

## File
- `src/lib/cerved/cerved.server.ts` (solo tipi e normalizzazione nuove sezioni)
- `src/lib/cerved-collegati.ts` (presentazione condivisa)
- `src/components/cerved/esponenti-societa.tsx`
- `src/components/cliente-cerved-tab.tsx`
- `tests/cerved-collegati.test.ts` (fixture G-E TRADE già presente riutilizzata)
- `src/lib/cerved/AGENTS.md`, `roadmap.md`
- `docs/verifiche/fm87-cerved-lettura.md` (solo rinomina/correzione numerazione)
- questo rapporto

Nuova fonte unica documentata in AGENTS Cerved; l'eventuale aggiornamento di docs/regole resta al proprietario. Da ripubblicare per rendere visibile FM88 nell'app pubblicata.