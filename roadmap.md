# FM65 — Correzioni A
- [ ] Finestre Duplica/Nuovo senza overflow; selettore clienti chiaro alla fonte.
- [ ] Filiale dalla sede cliente solo al cambio; primo blocco solo dalla finestra Nuovo, errore non bloccante.
- [ ] Test e screenshot 375/1280/1440; nessun dato di prova nel database.

# FM65 — Ridisegno R2
- [x] Codice/descrizione separati, picker Gamma di sostituzione, conversioni UM2 condivise per righe e PDF; lettura batch unità/pesi.
- [x] 0202 descrizione Gamma negli ordini, firma/permessi invariati e verificati; anon 0.
- [x] 680 test verdi; prova DB PRV-161 11 NR → 39,6 MQ / 148,51 / costo 119,196; ripristino 40 MQ UM1 / 150,01 e totale 170,01. PDF NR generato dal componente su dati reali, riga 11,11 / 15,0012 / 13,5011 / 150,01. Immagini e salvataggi simulati a 375/1024/1280/1920/360, nessun errore/overflow; pagina temporanea rimossa.
- [ ] Prova autenticata PRV-161 e trasformazione cliccata: account Andrea non trovato da --self; prova DB distinta dalle interazioni simulate, nessuna sessione di altri utenti scelta.

# FM65 — Ridisegno R1b
- [x] Componenti fascia/testata/piede, tab URL, cliente sovrapposto con RLS/fallback, Corpo invariato.
- [x] Dati PRV-161 170,01 / 20,9% / 35,61 / 37,40 / 207,41; test 664 verdi, immagini 375/1024/1280/1920 e 360 senza overflow/errori, tab persistente e modifica simulata. Pagina prova rimossa.
- [ ] Verifica autenticata scheda/cliente completa: sessione Andrea indisponibile; componenti provati con risposte simulate, DB solo letto. Scheda completa riusata tramite pagina esistente in iframe, percorso autenticato non verificato.

# FM65 — Ridisegno R1a
- [x] 0201 additiva, trigger alternative/autore, lettori cliente e lettera; impronte di 9 preventivi/13 blocchi/92 righe invariate, prove SQL annullate, anon 0.
- [x] Creazione: titolo, validità +7, pagamento, cantiere Da definire; duplicazione e ordine UM1 con um_scelta copiata. Nessuna tab R1b né conversione R2.
- [x] 663 test verdi; screenshot 375/1280 e flusso simulato 320–1920 senza errori/overflow; documentazione aggiornata, pagina temporanea rimossa.
- [ ] Prova autenticata creazione: --self non trova account Andrea; prove cliccate con risposte simulate, SQL impersonato separatamente. Mockup esterno non leggibile (contenuto non restituito).

# FM65 — Fetta 3a
- [x] Fonte unica incidenza/quantità in patchConImporto/updateRiga e ricalcolo blocco/kit, incluse manuali; formati italiani con formatNumeroIt. 657 test verdi, build OK.
- [x] PRV-161 modificato/riletto nel DB: 1,5 → 30/112,51/costo 90,30; ripristino 2 → 40/150,01/costo 120,40. Imponibile 170,01, totale con IVA 207,41. Altre 90 righe impronta 09e5c915e3e5c81a0d83cff4723c6564 invariata.
- [x] Prova cliccata del salvataggio reale del componente con risposte simulate a 375/1280; screenshot e controlli 320–1920 senza overflow/errori. Route temporanea rimossa.
- [ ] Prova completa nell'account reale PRV-161: --self non trova account Andrea; DB verificato separatamente con patch calcolata dalla fonte unica, non tramite sessione app.

# FM65 — Fetta 2b-3
- [x] Margine condiviso blocco/preventivo, intestazioni kit escluse, peso Gamma per quantità; 642 test verdi e build OK.
- [x] Screenshot componenti con campioni a 375/1280 e controllo 320–1920, senza overflow o errori; pagina temporanea rimossa. PRV-161 19,7%, kit PRV-160 239,30 verificati sui dati reali in sola lettura.
- [ ] Totale PRV-160 atteso 357,51: riga ARENA preesistente da 6,38 senza importo salvato porta il calcolo a 363,89 già prima della correzione; attende decisione Andrea, nessun dato modificato.
- [ ] Verifica nell'account reale: --self non trova account del richiedente; non eseguita, nessun bypass.

# FM64 — Fetta 4
- [x] URL email unico, log mascherati, controllo allegati e oggetti letterali; 542 test verdi e build automatica OK; send-email distribuita senza invii di prova.
- [x] Ignorati 9 avvisi warn/info con le motivazioni di Andrea; risultati riletti: 15 attivi (11 critical + 4 warn corretti, non ignorati).
- [ ] Ignorare gli 11 critical accettati: lo strumento richiede ignore_security_finding, non disponibile in questa sessione; non marcati come corretti in alternativa.

# FM64 — Fetta 1: RLS listini per sede
- [x] Ricerca completa src/supabase/tests: nessuna lettura diretta dei due listini con client utente.
- [x] Migrazione 0196 applicata: solo due policy SELECT e commenti; regola documentata nel README delle regole.
- [x] Impersonazioni aal2 e test SQL superati: admin L10 63364/L20 62284/L30 62954, 776 depositi; Cambiago L10 63364, 35 prezzi CA e zero fuori sede; Cinisello L30 62954, zero prezzi deposito. Impronte delle due RPC identiche prima/dopo per admin e Cambiago.

# FM62 — Schede fornitore, fetta E
- [x] Menu, elenco con filtri URL, scheda e note interne tramite sole funzioni fornitore esistenti; nessuna migrazione o scrittura dati.
- [x] Finestra articolo senza cambio pagina e link articolo → fornitore; 416 test verdi, screenshot componenti con campioni reali a 390/1280/375 e controlli 320/768/1920, nessun overflow o errore browser; campioni rimossi.
- [ ] Verifica autenticata completa e salvataggio note: --self non trova l'account Andrea; occorre sessione personale nell'anteprima. Screenshot eseguiti su campioni reali, nessun bypass né salvataggio reale.

# FM62 — Schede fornitore, fetta D
- [x] Migrazione 0173 applicata: quattro funzioni SQL protette, wrapper con client utente e schemi condivisi per la validazione; nessuna UI o modifica dati.
- [x] Tutte SECURITY DEFINER, search_path public, EXECUTE authenticated soltanto (oltre al proprietario); anon e service_role esclusi. Zero funzioni applicative eseguibili da anon. 7 test nuovi, 411 totali superati e compilazione automatica OK.

# FM61 — Articoli fetta B2
- [x] Ridisegno con Card/Tabs/Progress esistenti, tab nell'URL, margine condiviso; nessuna modifica ai dati o funzioni server.
- [x] 404 test superati, compilazione automatica OK; screenshot componente AKINAF01007 Panoramica/Vendita/Acquisto e ALP46142 Disponibilità a 390/1280/375, controllo 320/768/1920 senza overflow né errori. Campioni temporanei rimossi; prezzi AKI riletti nel DB, disponibilità ALP campionata dai valori confermati 2676 + 936 = 3612.
- [ ] Verifica autenticata delle tab su dati live: --self non trova l'account Andrea; serve sessione personale nell'anteprima. Nessun bypass né modifica dati.

# FM61 — Articoli fetta C
- [x] Disponibilità tramite RPC esistente in query indipendente; sedi, logistica separata, totale aggregati e depositi espandibili chiusi di default. Errori locali con Riprova senza bloccare scheda.
- [x] Fornitori completi ordinati, kit con route /kit/$id esistente e conteggio distinto preventivi tramite blocchi; paginazione completa delle righe con RLS.
- [x] Dati reali: ALP46142 sedi 2676 + ZM logistica 936 = 3612; FASL00H003300A0 sedi 3358,8 senza logistica. Confronto col criterio SQL dell’elenco sulle righe reali, funzioni invariate; RPC protette non eseguibili con strumento di lettura.
- [x] ABBGEB109.790.00.1: ABBATTISTA 469 preferenziale e PRESSIANI 2316. KNA68367 usato fra gli altri in PARETE 100/50 LASTRE 2+2, ruolo LASTRE 1, quattro preventivi distinti.
- [x] 402 test superati; screenshot 375/1280 e controllo 320/390/768/1920 su componente reale con campioni misti e riga aggiuntiva di prova, nessun overflow o errore browser; pannello aperto/chiuso e link kit controllati. Pagina temporanea rimossa.
- [ ] Verifica autenticata scheda → kit e RPC disponibilità → elenco: --self non trova account Andrea; serve sessione personale nell’anteprima. Nessun bypass, scrittura o modifica SQL.

# FM61 — Articoli fetta B
- [x] Scheda Gamma completa, prezzi in sola lettura e dati tecnici con RPC permesso esistente; updateArticolo riceve soltanto gli otto campi tecnici.
- [x] Vecchia scheda: redirect replace dei collegati, rimozione tab listini e parametro tab; adeguati quattro link dalle viste listini senza alterare le viste.
- [x] 398 test superati e build automatico OK. Screenshot componente reale a 320/375/390/768/1280/1920: nessun overflow pagina; form e sola lettura a 375/1280, nessun errore browser. Pagina temporanea rimossa; nessuna scrittura dati.
- [x] Prezzi AKINAF01007 letti dal DB: fornitore 1,03593, trasporto 3%, netto 1,067008 su quattro listini; vendita 2,017/2,017/2,049/2,006. Screenshot con questi valori e anagrafica di prova, non sessione autenticata.
- [ ] Prova autenticata redirect 00b28602-5038-42ff-bee6-66413b555ec9 → KNA58186, scheda solo preventivatore 005b25cb-486c-4b2b-bcf7-7802e8da2bfa e salvataggio: --self non trova account Andrea; occorre sessione personale nell’anteprima. Nessun bypass o modifica dati.

# FM61 — Articoli fetta A2
- [x] Migrazione 0172: sei numeric nullable senza default/backfill, sole due RPC richieste; corpi applicati identici al file ed EXECUTE solo service_role, senza modificare flusso import.
- [x] Parser: normalize conserva % ed euro, whitelist con 24 intestazioni reali, sei valori numerici per listino; file vecchio supportato con null, netto non ricalcolato. 395 test superati, build automatico OK.
- [x] Prima/dopo migrazione e prova: 231538 listini, MD5 deebbf5e198a24aa67741bf8b288adfa, 64556 articoli attivi. Sei colonne nullable senza default e nessun valore valorizzato; tipi rigenerati.
- [x] tests/sql/fm61-articoli-a2-freno.sql eseguito tramite strumento database in BEGIN/ROLLBACK: chiamata con 10 codici intercettata con messaggio esatto «Disattivazione bloccata: 64546 articoli assenti su 64556 attivi, oltre il 5%: controllare il file»; asserzioni su count e MD5 delle righe complete passate. Nessun import avviato.

# FM61 — Articoli fetta A
- [x] SQL elenco/facets e disponibilità condivisa; tre EXPLAIN finali 944,262 / 586,202 / 181,310 ms e impronte disponibilità invariate.
- [x] Elenco Gamma, filtri e intestazione dettaglio; 392 test, immagini 320/375/390/768/1280/1920 con dati sintetici e selezione famiglia; pagina temporanea rimossa.
- [ ] Verifica autenticata elenco → dettaglio → Indietro su dati reali: sessione personale non disponibile (--self non trova account). Nessun dato modificato.

# FM61 — Sicurezza dopo il blocco database
- [x] Chiusa solo l'importazione 1b1cd18d come fallita con il problema richiesto, riletta dal database.
- [x] Lotti Gamma sequenziali, articoli da 1000; migrazione 0168 elimina INSERT marche dai lotti, invariati/listini preservati.
- [x] Prove annullate su dati reali: EXPLAIN campione misto 421,617 ms inclusa preparazione; RPC sola su 1000 sincronizzati 313,508 ms, 3788 listini e xmin invariati, zero riscritture.
- [x] Evento verifica fido solo per le quattro fonti canoniche, dalla chiusura condivisa; job filtra anche eventi vecchi. 389 test superati, build automatico OK.
- [ ] Pubblicare e sincronizzare Inngest prima del prossimo import reale: dipende dal proprietario, nessun import avviato.

# FM61 — Fornitori da Gamma, fetta 1 (confermata da Andrea)
- [x] Fetta 2A (0161): catalogo articoli, marche e listini base come gestore "articoli" dell'import unico
- [x] Lettura del file spostata nel browser (Web Worker), server solo JSON di staging; importazione 2dc096b8 chiusa come fallita
- [ ] Primo import reale: verificare 64.556 articoli, 1.125 marche, fornitore preferenziale su 54.728
- [ ] Dopo la pubblicazione: risincronizzare Inngest (nuova funzione process-articoli-listini-gamma-import) e fare il primo import col file reale
- [x] (0159) Migrazione: colonne fornitori, unicità nome solo tra manuali, tabella fornitore_cliente + RLS, funzione ricalcola_collegamenti_fornitori_clienti()
- [x] Filtro origine=manuale: fetchFornitori, due ArticoloPicker, richieste interne; cerca-poi-inserisci manuale in richieste interne e migrazione-richieste
- [x] (fetta 1B, 0160) Import Inngest a lotti da 500 (parser whitelist, staging, step per lotto, disattiva assenti, ricalcolo collegamenti) + sezione /import-export

# FM60 — Avvisi clienti a orari fissi
- [x] Tre cron Europe/Rome (10:00, 14:30, 18:00), un solo avviso per negozio e uno per agente con variazioni e alert; eliminati i tre innesci immediati e la vecchia funzione differita del legale.
- [x] SQL 0158 applicato: definizione precedente md5 7e9d2fcd74c74324bc3c77db9bd7e5ce, nuova a8927078b468fb0b5d5103c13ba20dc8; eleggibili prima 0, md5 ids d41d8cd98f00b204e9800998ecf8427e; transazione annullata: 0 e stesso md5, nessuna marcatura persistita. Solo il job chiama la funzione; nessun riferimento in altre funzioni o trigger; grant solo service_role.
- [x] 358 test verdi, controlli automatici build/tipi OK, regole aggiornate. Nessun invio reale eseguito.
- [ ] Dopo la pubblicazione: risincronizzare Inngest per registrare i tre cron e rimuovere i vecchi trigger.

# FM60 — Fetta 2-quinquies: lettore MSG senza Buffer
- [x] Lettore CFB fornito portato in TypeScript con import dinamico; msgreader/Buffer diretti, alias/plugin e relativo test rimossi; interfaccia preservata con conteggio nascosti facoltativo.
- [x] 353 test verdi; fixture MSG/EML e regole X500/0x7FFE verificate con CFB sintetici reali. Processo fresco e moduli reali Vite dev WebKit/Chromium senza Buffer: oggetto corretto, 1 PDF (%PDF-). Controllo automatico build/tipi OK.
- [x] Artefatti di produzione non accessibili: grafo verificato, cfb → adler-32/crc-32 (nessuna dipendenza), postal-mime → nessuna dipendenza; nessun percorso email verso iconv-lite/safer-buffer (restano transitive di strumenti server). Verifica pubblicata affidata a Claude come richiesto.

# FM60 — Fetta 2: anteprima email allegate
- [x] Lettore unico MSG/EML e anteprima condivisa sicura (HTML sanitizzato e isolato, risorse remote e immagini CID ignorate), allegati interni e download originale. Nessuna modifica database/storage/permessi/upload.
- [x] Fixture sintetiche MSG/EML con PDF, 347 test verdi e controlli automatici senza errori; screenshot 375/1280 di entrambe le email e PDF interno, ritorno all'email verificato. Pagina temporanea rimossa. Safari/iPhone fisico e allegati reali non provati.

# FM60 — Rimpaginazione recupero crediti
- [x] Timeline condivisa, conteggio allegati e modifica nota/promessa senza cambiare permessi.
- [x] Pulsanti compatti e riepilogo non duplicato nello scadenziario.
- [x] 343 test verdi, tipi automatici puliti; screenshot 375/1280 con componenti reali e dati finti di striscia/timeline, Sheet, nota/promessa e scheda Promesse; showroom sola lettura verificato. Pagina temporanea rimossa. Recupero crediti riusa lo stesso componente verificato, pagina autenticata non provata.

# FM59 — Esperienza di pagamento, fetta 1
- [x] Applicate le tre funzioni SQL (0152); firme, ordine colonne, grant e corpi applicati verificati; tre funzioni fuori scope con MD5 invariato.
- [x] Aggiornate le regole FM58 con RiBa incluse e prima_pagata; aggiunte prove in tests/sql/fm59-esperienza-pagamento.sql.
- [ ] Eseguire le prove SQL: lo strumento di lettura non ha EXECUTE su ritardo_pagamento_riga né esperienza_pagamento_batch; necessario postgres/service_role, senza ampliare i grant.
- [ ] Avviare e verificare il ricalcolo completo esistente: /import-export, Ricalcola fido teorico ora. Bloccato: --self non trova Andrea, sessione esplicita a.giani richiede approvazione non disponibile; nessun percorso alternativo eseguito. SQL verbatim disponibile; conteggi post-ricalcolo non disponibili.

# FM55 — Privati fuori dal giro fidi
- [x] Massiva: esclusi i già decisi dai rinnovi da guardare con giaDeciso e riferimento canonico; riepilogo nascosti per scadenza, 8 nuovi test (234 verdi), build OK; nessuna migrazione o ricalcolo. Quattro casi verificati in sola lettura: La Bottega protetta fino al 01/12, gli altri fino al 30/11.
- [ ] Verifica massiva già decisi nell'elenco reale: accesso personale non disponibile (auth-session --self non trova l'account del richiedente); servono login nell'anteprima o account indicato e autorizzato.
- [x] Alert fidi: righe colorate per motivo con la stessa fonte della massiva (motivoRigaProposta + CLASSI_MOTIVO_RIGA + LEGENDA_MOTIVI), etichetta accanto a "Vicino al limite", legenda in cima; solo TS/UI, nessuna migrazione o ricalcolo. bun test 226 verdi, build OK.
- [ ] Verifica Alert fidi con clienti reali: la sessione di prova non si può creare (molti utenti auth, nessuna corrispondenza con l'email richiedente); colori e impaginazione controllati solo su replica del markup con il CSS reale dell'app a 1280 e 390px.
- [x] Fetta 5 seconda aggiunta: copertura informativa all'80% con gemello arrotondamento esistente, motivi brevi in motivoRigaProposta; 205 test verdi. Finestra con dati temporanei verificata a 320/390/768/1280/1920 senza overflow/errori; nessuna richiesta, migrazione o ricalcolo.
- [ ] Verifica della seconda aggiunta con clienti reali: sessione Andrea autenticata restituisce zero clienti; prova visiva effettuata solo con dati temporanei, senza scritture.
- [x] Fetta 3: migrazione 0123 con guardie md5 iniziali/finali applicata, firme invariate; fonte unica picco a eventi, esposizione importata invariata, freno solo riduzioni standard. Rosso solo aumenti, normalizzatore sopprime codice obsoleto sulle riduzioni; Sede Centrale esclusa da preset, massiva e Alert (37/37 verificati). Eccezione aperto Gamma documentata in fonti-uniche.
- [x] SELECT singole: GALLO 55.000, GMP 60.000, OTTO 30.000, KREKU 5.000; 8 test SQL e 12 confronti indipendenti picco/giorno/oggi tutti positivi. Blocco 500: 45,724 ms. Controllo informativo sul perimetro regola calcolo/no privati/no sede: 4.366 clienti, 54 divergenti; con fido Gamma/proposto positivo 2.203 e 51 divergenti. Nessun ricalcolo/refresh: fingerprint 1fed511b03339279042b08e46fe22d70 invariato, colonna picco tutta NULL.
- [x] bun test finale: 174 pass, 0 fail, 431 asserzioni; build OK. Notifiche false. Sei MD5 live verificati, file migrazione byte-identico allo staging; nuovi test SQL e test normalizzatore/perimetro/rossi, caso precedente segnalazioni aggiornato a aumento.
- [ ] Verifica visiva picco e massiva con clienti reali: sessione autenticata mostra Cliente non trovato per GALLO; nessun errore o overflow 320/390/768/1280/1920, ma contenuti non verificabili finché la sessione non vede i clienti e il prossimo import non pubblica il picco.
- [x] Fetta 2b TypeScript: oltre_normale rosso non spuntato, ordini_oltre_fido arancione, legacy riconosciuti senza gruppo sintetico; riferimento e testo Ci deve solo esposizione, ordini separati, motivo rosso canonico.
- [x] Sei file test esistenti aggiornati: fido-segnalazioni, fido-linguaggio-semplice, fido-teorico, extra-fido-protetto, proposta-fido-cinque-caselle, proposta-fido-motivi. bun test: 170 pass, zero fail, build OK. Caso esposizione 80.000/ordini 50.000/teorico 60.000/Gamma 120.000: riferimento 100.000. Nessun SQL, refresh, ricalcolo o notifiche.
- [x] Verifica UI autenticata: /clienti senza errori ma zero clienti anche togliendo filtro attività; scheda e massiva con righe reali e controllo visivo 320–1920 non verificabili in questa sessione, senza creare o alterare dati per la prova.
- [x] Fetta 2a SQL: migrazione 0122 applicata, acquisti chiusi con DDT, tendenza calendario 3 mesi, ciclo pesato, esposizione senza ordini e margine senza tetto; sei firme invariate.
- [x] Segnalazioni e protezione riduzioni Alert allineate; sei definizioni corrispondono alla migrazione. SELECT GMP/PIGNONE/A.N. eseguita; proposta 70.000/2.000/365.000, PIGNONE puntuale.
- [x] bun test 167 pass, zero fail; nove casi SQL e dodici verifiche sui tre clienti positivi in tests/fido-teorico-2a.sql; build OK. Nessun ricalcolo o refresh: firma delle 12.904 righe pubblicate invariata 95be664ca77a6cd3f050576e2444ae42, dilazioni ancora tutte zero, notifiche false. Nessuna modifica TypeScript.
- [x] Dilazione Teorica: aggiunti mappatura ufficiale e conversione intera nel parser condiviso browser/server; difetto riprodotto (62/90 assenti) e corretto con round-trip XLSX. bun test: 167 pass, zero fail; build OK. Colonna DB integer DEFAULT 0 e upsert payload verificati; nessuna migrazione, backfill o ricalcolo, dati reali al prossimo import del proprietario.
- [x] Selezione iniziale: riduzioni zero bloccati/legali già spuntate con firma a oggetto e chiamante allineato; rosso Controlla invariato, scaduto non incassato non spuntato, zero→zero nascosto e mai da guardare. bun test: 165 pass, zero fail; build OK. Finestra con clienti reali non verificata: accesso personale non disponibile.
- [x] Rinnovi da guardare solo con alert consumo effettivamente aperti o rossi con Gamma positivo; lettura condivisa stato richieste e protezione già deciso, motivi solo consumo/rossi. bun test: 159 pass, zero fail; build OK. Anteprima senza errori alla pagina login, accesso personale non disponibile: finestra con dati reali non verificata.
- [x] Bloccati/legali: riferimento senza protezioni, rinnovi zero esclusi dai da guardare; già fuori dal perimetro SQL Alert, nessuna ulteriore migrazione.
- [x] Fonte unica TS/SQL per partita IVA assente e preset solo partita IVA, senza cambiare lista predefinita; query e RPC verificate nell'anteprima autenticata, che restituisce zero clienti (verifica dati reali UI non disponibile).
- [x] Migrazione 0121 applicata e definizione confrontata con la precedente: solo perimetro. Un refresh: 6 privati chiusi; consumo non chiusi 170→164, extra 22→22, riduzioni 0→0; richieste attive riallineate dal meccanismo esistente.
- [x] bun test: 147 pass, zero fail; build OK. Firma teorico v2 invariata su 12.904 righe: 56c635f2045cbe0fd93443ec12963824; notifiche false.
- [x] Categoria rinnovi da guardare predefinita, conteggi indipendenti dai filtri e spunta iniziale senza rossi; tipo inviato sempre rinnovo.
- [x] Cinque caselle, motivi grammaticali e SemaforoPallino condiviso in richieste, massiva e Alert; dati canonici conservati dal normalizzatore.
- [x] bun test: 133 superati, zero falliti; compilazione OK. Chromium 320/390/768/1280/1920 con 603 righe: ultima modificabile, rossa non spuntata e selezionabile a mano, nessun overflow o errore. Anteprima autenticata senza clienti/alert: invio reale e Safari iOS non verificati.
- [x] Dettagliare i rinnovi da guardare per motivi usando le segnalazioni canoniche, con quattro nuovi test.
- [x] Unico scorrimento mobile, dettagli pieghevoli e footer compatto; PC invariato.
- [x] bun test: 125 superati; verifica Chromium a 320, 390, 768, 1280 e 1920px con 603 clienti di prova, ultima riga raggiungibile. Sessione reale senza clienti; Safari iOS non disponibile nel sandbox.
- [x] Rimuovere pagina, menu, collegamenti e raggruppamenti Revisione fidi; preservare Lascia così.
- [x] Semplificare filtri e conteggi della proposta massiva nella fonte unica.
- [x] Aggiornare test pertinenti, aggiungere casi nuovi ed eseguire bun test.
- [x] Verificata anteprima autenticata: pagine senza clienti/alert disponibili; apertura massiva e impaginazione non verificabili con dati reali. Limite da riportare.- [x] FM55 fetta 4: migrazione 0124 (paracadute ordini sulle riduzioni, consumo solo sul debito); valori attesi verificati in sola lettura.
- [x] Scheda Alert fidi semplificata (tre numeri, perché, ordini, ultima decisione, solo "Apri proposta"); "Lascia così" tolto dalla pagina Alert.
- [x] Pulsante ricalcolo: passi uno alla volta con avanzamento ed errore; blocchi da 500 anche per il job automatico. Prova reale del pulsante: la fa Andrea.
- [x] FM55 fetta 4b: blocchi da 200, riprova automatica sui timeout (stesso blocco, 3 tentativi) anche per finalizza/alert, "Riprendi da blocco N"; job automatico uno step per blocco. Prova reale del pulsante: la fa Andrea dopo il publish.
- [x] FM55 fetta 4c: migrazione 0125 (service_role statement_timeout 60s per i job server; utenti authenticated a 8s), documentata in docs/regole/fonti-uniche.md e AGENTS.md. Blocchi da 200 e riprova automatica restano invariati.
- [x] Verifica ruoli database in sola lettura: service_role 60s, authenticated 8s, authenticator 8s (lock_timeout 8s), anon 3s; nuova verifica tests/sql/service-role-timeout.sql.
- [x] Alert fidi per tutti: regola unica permessi-fidi, menu e pagina, agenti in sola lettura.
- [ ] Dashboard fidi e Richieste fido con la stessa regola: fermo, perderebbero accesso marketing, marketing_eventi e Pierpaolo Maino (richiedente+preventivi).
- [ ] Notifiche Alert fidi + email unica per negozio: dopo la fetta precedente; serve decisione sul gemello SQL di "già deciso" (riferimento canonico è calcolato solo in TS). Interruttore resta OFF.

- [x] FM61 ottimizzazione tempi import unico (step stato, lotti, hash_riga, parallelismo 3, upload 8)
- [x] FM61 fetta 3B regole prezzo Gamma (8 tabelle, import fedele, sostituzione completa per foglio)

## FM62 Fetta F1 — macrocategoria fornitori + accesso amministrazione
- [x] Migrazione 0174, parser, filtri/badge, permessi
- [ ] Prova autenticata live (sessione non disponibile)

## FM62 G1 — scheda fornitore come scheda cliente + Allegati
- [x] Migrazione 0175 allegati fornitore (check, policy tabella e storage)
- [x] Testata, tab Riepilogo/Anagrafica/Articoli/Cliente collegato/Allegati, screenshot 375-1920

## FM62 G2 — Attività fornitore
- [x] Indietro: tab/filtri/pagina in replace (scheda fornitore e articolo)
- [x] Tabella attivita_fornitore + tab Attività + card Ultima attività
- [ ] Prova autenticata live (sessione non disponibile)
