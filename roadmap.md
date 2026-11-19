# FM88 — Esponenti e società collegate
- [x] Normalizzazione da PositionCompany; 60 fotografie aggiornate nelle sole chiavi esponenti/societa_collegate, confronto esatto col parser e altri campi invariati. Nessuna chiamata Cerved o migrazione.
- [x] Sette società G-E TRADE e due ruoli esponente verificati; fotografie 375/768/1280/1920 senza overflow/errori, 1111 test verdi. Lettura report invariata; precedente scheda registrata FM87. Accesso reale porta al login: verifica autenticata indisponibile.

# FM87 — Scheda Cerved e lettura del report
- [x] Verificati 60 XML archiviati; aggiornati 135 bilanci in 47 fotografie, 13 senza bilancio invariati. Tutti i campi richiesti presenti; confronto DB/normalizzatore senza differenze. Nessuna chiamata Cerved né migrazione.
- [x] Scheda, consultazioni e lettura fissa completate; 1093 test verdi e fotografie 375/768/1280/1920 senza overflow. Vista reale con dati archiviati su pagina temporanea rimossa; accesso personale indisponibile, apertura autenticata non verificata. Rapporto fm87-cerved-lettura.md.

# FM86 — Sede preventivo e logo PDF
- [x] Risoluzione unica cliente/lead/utente in preventivo-creazione; creazione da lista/lead e copie/alternative passano da createPreventivo; sede obbligatoria e modificabile. Senza sede i quattro PDF di tutte le linee usano MADE di gruppo (prima ufficiale: Sistema MADE; altri: MADE).
- [x] Aggiornato solo store_id di PRV-172/26 a Mergozzo; PRV-169/26 (A&O, lead a Lissone) invariato. 1048 test/0 errori, compilazione OK; dialog e testata simulati a 375/1280, sede proposta/modificata riletta e overflow 0. Sessione personale non disponibile: PDF autenticato con logo Mergozzo non verificato; nessuna migrazione.

# FM85 — Fetta B
- [x] Recupero orario, blocco/avviso atomico dopo 48 ore (0247), elenco Cerved e recupero manuale autorizzato; altre impostazioni riservate agli amministratori.
- [x] 1042 test verdi; browser simulato 320–1920 senza overflow/errori, recupero e rilettura verificati. Corpo RPC/grant verificati; nessuna chiamata Cerved live, account proprietario non disponibile.
- [ ] Attivazione esterna: pubblicare/resync Inngest ed eseguire il dato catalogo `docs/verifiche/fm85b-catalogo-notifica.sql` (proprietario); rapporto `docs/verifiche/fm85b-recupero-cerved.md`.

# FM85 — Fetta A
- [x] Schema additivo e allineamento storico; registrazione immediata dell'acquisto e tentativi atomici; stato condiviso in scheda.
- [x] 1033 test verdi; scheda reale con risposte simulate fotografata a 375/1280 nei tre stati. DB: 51 consegnati e I.CO.MA. in attesa; nessuna chiamata Cerved live. Job automatico escluso (fetta B).

# FM79 — Fetta 9 Listini e rifiniture
- [x] Listini con scroll interno, codice/descrizione fissi e campi 44px; Privacy/template/Audit/banner solo tablet.
- [x] Diff classificato completo; 21 coppie, zero differenze vere dopo 3+3 e attesa contatori; 28 misure touch con sole eccezioni scroll listini; 1019 test verdi; audit con stato di tutti i problemi e prove dispositivo.

# FM79 — Fette 7–8 Marketing e Amministrazione
- [x] Marketing + Utenti: cinque file solo tablet; prova statica documentata, 15 coppie (12 identiche + tre 3+3, zero differenze vere), 20 misure touch 0/0/0; Bun 1019/0, logo/dati/permessi invariati.
- [x] Listini acquisto/vendita/matrice completati nella fetta 9.

# FM79 — Fetta 6 finestre e tastiera
- [x] Diagnosi e 12 coppie di riferimento.
- [x] Classi solo tablet nei tre componenti condivisi.
- [x] Diff 16 righe solo C1; 12 coppie, zero differenze vere (1 rumore 3+3); 16 misure standard e 820×780 OK; 1019 test verdi; SHA codice nel rapporto.
- [x] Precisazione Andrea: su iPad la tastiera riduce il visual viewport, non il layout viewport; 1180×480 non riproduce il caso reale. Verifica finale sul dispositivo.

# FM79 — Fetta 5 Commerciale
- [x] Diagnosi e fotografie originali delle cinque pagine.
- [x] Solo presentazione tablet: schede verticali, tabelle essenziali, calendario touch.
- [x] Prova statica completa; 15 coppie (13 identiche, 2 rumore confermato 3+3), zero differenze vere; 20 misure touch 0/0/0; 1019 test verdi, SHA codice nel rapporto.

# FM79 — Chiusura verifica fette 1–4 (fetta 5 esclusa da questo giro)
- [x] Prova statica completa src f3f1883f→HEAD: 600 righe (156 classi tablet, 399 rami/helper tablet, 23 hook/variante, 22 ALTRO); nessuna eccezione cambia la presentazione telefono/PC. Head Recupero conservato, documento fm79-prova-statica.md con tutte le righe.
- [x] Conferma sequenziale dieci pagine × tre dimensioni: 60 scatti, 30/30 coppie identiche; 14 richieste da approvare e cinque aggregati recupero visibili. Zero coppie diverse, 3+3 non necessario; Legali esclusa.
- [x] Suite bun test 1019/0; src invariato e nessuna migrazione. Verifica 1–4 chiusa secondo A+B+C, fetta 5 espressamente esclusa.

# FM79 — Tablet, chiusura fetta 4 e fetta 5
- [x] Protocollo precedente sostituito dalla verifica statica f3f1883f→HEAD e dal giro ridotto richiesti da Andrea; chiusura documentata in fm79-prova-statica.md.
- [x] Documentato protocollo sequenziale; 90 scatti su cinque pagine, 12 casi identici e 3 rumorosi, zero differenze vere osservate. Suite 1019/0. Chiusura completa bloccata dalla fixture Legali dopo 103 scatti originali; Recupero/Approva richiedono fixture non vuote e ruolo approvatore. Vecchie immagini non disponibili.
- Fetta 5 rinviata espressamente da Andrea, non autorizzata in questo giro.

# FM79 — Tablet, fetta 4
- [x] Modifiche presentazionali preesistenti della fetta 4 verificate sul diff completo, logo invariato.
- [x] Chiusura non-regressione sostituita dal criterio A+B+C del 17/11: prova statica completa e 30 coppie ridotte identiche, suite Bun 1019/0; non ripetute le misure tablet, fuori dal nuovo giro richiesto.

# FM79 — Cerved: subject_type obbligatorio nell'acquisto
- [x] `acquistaLightReport` invia `subject_type: "COMPANY"` nel corpo di POST B2B /v1/purchase; format, product_id 52015, subject_id, language ITALIAN e reference invariati. Nuovo test `tests/cerved-acquisto.test.ts` sul corpo realmente inviato (con e senza reference). Nessuna migrazione.

# FM79 — Cerved, fetta 3
- [x] Eliminate leggiProfilo/leggiScore/elencoBilanciCerved/bilancioCerved/eventiNegativiFlag e relative scritture; nessuna modifica alle fotografie esistenti. Ricerca solo primo collegamento, aggiornamento soggetto e percorso Light Report invariati. Quattro esiti rimossi dopo verifica di assenza chiamanti; mantenuti sei campi richiesti. Scheda: solo testo di conferma aggiornato. Nessuna migrazione o modifica diagnostica.
- [x] Otto test isolati del vero handler con confini esterni simulati, senza mock globali; ricerca iniziale, report valido/assente, acquisto annuale, errori e permesso negato verificati. Suite completa: 1017 superati, zero falliti; compilazione automatica OK. Verifica statica: nessuna chiamata granulare o esito rimosso nel percorso, XML/PDF invariati. Nessuna prova live, come richiesto (Cerved 403).

# FM79 — Cerved, fetta 2
- [x] Scheda e riepilogo compatto: fonte condivisa cerved-presentazione, Light Report prioritario e ripiego per campo; CGS PD/trend solo granulari, CEBI separato, tre bilanci e indici, nessuna chiamata o migrazione modificata. Hook batch e sezione compatta già leggono light_report, riusati senza modifiche.
- [x] 1009 test superati; screenshot BUILD e PRO.GE.CO a 320/375/390/768/1280/1920, zero overflow/errori; solo LR verificato. BUILD salvato ha ancora il formato precedente: verificato anche il nuovo formato dalla fixture XML reale, senza aggiornare dati né chiamare Cerved. Pagina temporanea rimossa. Sessione personale non disponibile: verifiche presentazionali locali, non login end-to-end.

# FM79 — Cerved, fetta 1
- [x] Lettore esteso con percorsi verificati su tre XML reali; fixture BUILD con tre bilanci, nessuna UI, chiamata API o migrazione.
- [x] Non regressione completa DELEO e nuove sezioni: 1001 test superati, zero falliti; compilazione automatica OK.
- [x] Limiti del dato verificati: bilanci XML riclassificati in migliaia non identici ai granulari (BUILD 2025 ricavi 1.758.000 vs 1.698.217, MOL 105.000 vs 123.642); CGS PD/trend assenti, CEBI PD distinto; CgrFlags senza decodifica certa conservati grezzi, FlagPc/FlagPP non trattati come eventi negativi accertati.

# Rifinitura PDF e Testata preventivo
- [x] Intestazione PDF: agente opzionale e filiale rimossa; PRV-163/26 raster identico fuori area Filiale (0 pixel diversi).
- [x] Testata bilanciata, badge nelle condizioni, ingresso unico; cantieri lead non offerti perché get_cantiere_preventivo richiede cliente_id non NULL; nessuna migrazione.
- [x] 993 test verdi, screenshot Playwright 1920/1280/375 con dati simulati e zero errori/overflow; sessione personale non disponibile, nessun salvataggio reale.

# FM76 — Branding per sede, fetta 3
- [x] Collegati i quattro PDF a stores tramite preventivi.store_id, senza riserva cliente; fonte unica branding-pdf, download utente privato e piede con campi presenti. Sede senza logo/contatti conserva il piede precedente.
- [x] 970 test verdi, compilazione OK; otto confronti raster PDF precedenti identici pixel per pixel (senza sede e sede senza logo/contatti, documenti di prova senza righe). Logo quadrato e piede verificati sui PDF di prova; file e limiti in docs/regole/branding-pdf.md.
- [ ] Collaudo autenticato download/PDF con logo reale: account personale non disponibile e nessun logo configurato nella verifica precedente; nessuna modifica ai dati reali.

# FM76 — Branding per sede, fetta 2
- [x] Collegati logo sede a recupero singolo, massivo (inclusi promemoria manuali), promemoria automatici e campagne cliente; anteprime firmate dalla lettura sede condivisa, archivio con data URL durevole solo per logo personalizzato. Generici/interni/fornitori/assicurazione/privacy restano MADE.
- [x] Payload inline opzionale nella funzione email esistente; 964 test verdi, fallback con 12 impronte HTML precedenti (quattro varianti), compilazione OK; cornici simulate Playwright 375/1280 controllate. Ricognizione e file in docs/regole/branding-email.md. Nessuna migrazione/dato/policy modificato.
- [ ] Collaudo autenticato e SMTP con logo reale: zero loghi caricati sulle 10 sedi; --self non trova account personale. Nessuna email reale inviata.

# FM76 — Branding per sede, fetta 1
- [x] Applicata 0239_fm76_branding_sedi.sql: colonne nullable e quattro policy storage amministratore; UPDATE stores/MFA già adeguati, invariati.
- [x] Fonte unica branding e gestione contatti/loghi nelle impostazioni; email e flussi invariati. Bucket branding creato privato con limite 1 MB; anteprime firmate per l'amministratore.
- [x] 956 test verdi; schermate 375/1280 controllate, nessun overflow 320/375/390/768/1280/1920. Contatti e upload verificati con risposte simulate, pagina temporanea rimossa.
- [ ] Lettura pubblica bucket: bloccata da public_buckets_blocked; occorre abilitare bucket pubblici in Privacy e sicurezza della workspace e rendere branding pubblico.
- [ ] Verifica autenticata completa (salvataggio/rilettura, sostituzione/rimozione): --self non trova account del richiedente; nessuna modifica di dati reali effettuata.

# FM72 — Responsabile showroom, tappa ④b (solo frontend)
- [x] Allineati gemelli showroom/preventivi; blocco codice agente e vincolo agente derivati dal gate di scrittura condiviso, inclusi ruoli misti. Nessuna migrazione o modifica SQL/prezzi; sede obbligatoria e menu invariati. Documentazione aggiornata e regola tecnica nella AGENTS di area (root oltre budget).
- [x] 30 test mirati e suite completa 920 test verdi con il runner Bun già usato dal progetto (nessuna dipendenza Vitest aggiunta). Browser con dati simulati: preventivi_write senza codice bloccato, responsabile solo e con preventivi_write non bloccati; screenshot 375/1280 controllati, nessun overflow pagina a 320/375/390/768/1280/1920 né errori browser. Pagina temporanea rimossa; nessun salvataggio reale effettuato.

# FM72 — Responsabile showroom, tappa ④a (solo database)
- [x] Applicate 0230 enum e 0231 perimetro; registro 232 voci contigue. Helper showroom_sede_ok anche sulla restrittiva INSERT lead. Firme invariate, nessuna assegnazione del ruolo. Unica modifica app: etichetta nel Record esaustivo RUOLI_LABEL, necessaria dopo rigenerazione enum per evitare TS2741; nessuna schermata o gate TS modificato.
- [x] Test SQL reali aal2 con rollback superati: lead/clienti su due sedi, lettura 0/5 per linea, INSERT consentito/negato, divieti fido/clienti, showroom di sede e conteggi admin 5/store manager 3. Zero fixture residue, corpi applicati identici al file; impronte funzioni non coinvolte, policy non-showroom e tutti i trigger identiche. Documentazione aggiornata, suite 911 test verdi.

# FM72 — Linea del preventivo, fetta ②
- [x] Applicata 0227_fm72_linea_preventivo.sql: enum, colonna NOT NULL/default e indice; registro coerente 228 voci 0000–0227. SQL reale BEGIN/ROLLBACK verifica enum/colonna/default/indice e INSERT con numero esplicito per isolare il gate del contatore (INSERT senza numero negato dalla sessione tecnica); cinque documenti Sistema MADE, zero fixture residue, trigger identici. Nessuna policy/gate/prezzo modificati.
- [x] Catalogo unico e BadgeLinea in elenco incluse alternative, scheda accanto al numero e tab soggetto; filtro multiplo persistente nascosto/non applicato finché solo una linea attiva. Creazione omette linea, duplicazioni/alternative la copiano tramite opzione interna. Nuova fonte unica documentata in docs/regole/linee-preventivo.md; root AGENTS oltre budget, regola non aggiunta lì.
- [x] Suite 905 test verdi: catalogo/fallback/linee attive, guardia AST, creazione/copia e filtro OR; build OK. Browser simulato 320/375/390/768/1280/1920: badge e alternative presenti, filtro nascosto, nessun overflow/errori; screenshot 375/1280 controllati, pagina temporanea rimossa. Collaudo autenticato non disponibile: account del richiedente non trovato da --self; nessun account altrui utilizzato.

# FM72 — Assegnazione interna preventivi, fetta ①b
- [x] AssegnazionePreventivo in Testata, responsabile/cop ie ricercabili con chip rimovibili, UPDATE verificato dei soli due campi e chiave salvataggio condivisa; catalogo utenti con query unica in cache, filtro Per me persistente e badge/nome nelle righe. Nessuna notifica client o modifica DB/prezzi/RLS/trigger; documentazione e regola tecnica nella AGENTS di area (root oltre budget).
- [x] 899 test verdi: filtro responsabile/copie, AND con ricerca, lettura completa dei campi e gate confermati/ordini/ruoli. Browser con risposte simulate 320/375/390/768/1280/1920: PATCH limitato ai due campi, rilettura assegnazione, ricerca copie, sola lettura, filtro persistente al ricaricamento, zero INSERT notifiche, zero query per riga e overflow. Screenshot 375/1280 controllati, pagina temporanea rimossa; build OK. Salvataggio autenticato reale non verificato: sessione operativa non disponibile.

# FM72 — Assegnazione interna preventivi, fetta ①a
- [x] Applicata 0226_fm72_assegnazione_preventivi.sql: responsabile nullable senza FK e copie UUID[] con indici, trigger best-effort unico. Catalogo preventivo_assegnato inserito separatamente dalla struttura, raggruppamento per destinatario/tipo e link elenco /preventivatore/. Impronte RLS, gate/prezzi/contatori, task/raggruppamento e quattro trigger precedenti identiche. Regola tecnica documentata nella sezione Assegnazione interna; AGENTS root oltre budget, non modificato.
- [x] Test SQL sul database reale in BEGIN/ROLLBACK con ruolo authenticated e claims aal2: assegnazione, riassegnazione, copia aggiunta/deduplicata, autore escluso, altri campi, rimozione, valori invariati, INSERT copie e gruppo tra documenti. Sotto-transazione annullata e firme documenti/contatore/notifiche uguali; zero fixture residue. Corpo applicato identico al file (MD5 c6b302e1412ace47ffbac3688c8644c7), EXECUTE solo service_role, registro 227 voci 0000–0226 coerente. Suite 894 test verdi, build OK; documentazione aggiornata. Nessuna interfaccia in questa fetta.

# FM72 — Condizioni commerciali lead, fetta 2
- [x] Sezione vista/modifica con gate consultazione, payload condizionale e riferimento vuoto/completo; cataloghi/componenti condivisi, nessuna migrazione o modifica RLS/prezzi/creazione preventivo. Documentazione aggiornata; regola tecnica nella sezione FM72 (AGENTS root pieno).
- [x] 894 test verdi; componente reale con risposte simulate a 320/375/390/768/1280/1920: vista cataloghi, ricerca pagamento, incompleto senza PATCH, completo, spegnimento tre NULL e payload senza campi per altri ruoli. Screenshot 375/1280 controllati, pagina temporanea rimossa.
- [ ] Collaudo autenticato della scheda completa e salvataggio reale: sessione personale non disponibile; prova isolata della pagina completa non raggiunge il contenuto, verificati componente e helper di salvataggio separatamente, senza dati reali modificati.

# FM72 — Tab Preventivi nelle schede soggetto, fetta 1
- [x] Componente condiviso con letture RLS cliente/lead e provenienza separata; creazione preselezionata, tab dopo Commerciale e documentazione. Nessuna migrazione o modifica prezzi/permessi. Root AGENTS al limite: regola tecnica documentata solo nella sezione FM72 richiesta.
- [x] Test query e suite completa: 891 verdi. Browser simulato 320/375/390/768/1280/1920: gruppi separati, cliente/lead preselezionati, categoria obbligatoria, link documento e assenza overflow; screenshot 375/1280 controllati, pagina temporanea rimossa.
- [ ] Verifica autenticata delle schede e creazione reale: sessione personale non disponibile (--self non trova account Andrea); pagina documento richiede login. Nessun dato reale creato.

# FM71 — Numero non modificabile, fetta 3d
- [x] Migrazione 0225, registro 226: trigger con contatori esistenti per preventivi e ordini, blocco UPDATE salvo service_role; nessun backfill o cambio RLS. Numeri espliciti conservati per compatibilità con conversione e app precedente; vincolo UNIQUE invariato.
- [x] Creazione/duplicazione senza numero, Testata in sola lettura, conversione ordine server invariata.
- [x] SQL reale BEGIN/ROLLBACK: consecutività, UNIQUE, esplicito conservato, UPDATE negato, eccezione service_role, ordine e conversione; sei documenti e contatore invariati (firma e5b08bada19d04f83f55d4d8565c45b6). 890 test verdi, browser simulato 375/1280, screenshot controllati e pagina temporanea rimossa; documentazione aggiornata. Sezionale e riparti da futuri, non implementati. AGENTS root al limite: nota architetturale non aggiunta.

# FM71 — Correzioni collaudo, fetta 3c
- [x] Colonna unica e ricerca lead con lettura RLS, categoria obbligatoria nelle nuove scritture, pagamento cercabile condiviso, scheda lead sovrapposta. Nessun DB o permesso modificato.
- [x] Test permanenti e browser simulato 375/1280: join/ricerca lead, categoria salvata, pagamento multi-parola/accenti, finestra senza nuova scheda né cambio URL; screenshot controllati. Pagina temporanea rimossa; documentazione aggiornata. AGENTS root al limite: regola non aggiunta.
- [ ] Verifica autenticata della pagina lead completa: non eseguita; nel browser il contenuto iframe e le letture sono simulati.

# FM71 — Preventivi ai lead nell’app, fetta 3b
- [x] Selettore condiviso cliente/lead, lead rapido con defaults DB, creazione con riferimento obbligatorio, cambio soggetto e Testata lead con riferimento non disattivabile.
- [x] Lettura lead e sua sede nella lettura documento con RLS, duplicazione lead e riserva giacenze; dispatcher/PDF/ordini invariati. Alternative lead non disponibili per vincolo SQL preesistente.
- [x] 882 test verdi, browser con risposte simulate a 375/1280: creazione esistente/rapida, valori fissi, riferimento obbligatorio, pagamento proposto, Testata, cambio verso cliente, duplicazione e riserva. Zero errori; screenshot controllati; pagina temporanea rimossa. Documentazione aggiornata. AGENTS root al limite: nessuna regola aggiunta lì.
- [ ] Prova autenticata reale: mint --self non trova account corrispondente, serve accesso operativo dall’anteprima. Nessun dato reale di prova creato.
- [ ] Duplicazione su altro cliente da lead, alternative lead, PDF e blocco trasformazione: fette successive richieste dal proprietario, non implementate qui.

# FM71 — Preventivi ai lead, fetta 3a (solo database)
- [x] Migrazione 0224 applicata (registro 225 voci, 0000–0224): destinatari alternativi, condizioni lead, trigger riaggancio e sei dipendenze del gate aggiornate senza cambiare predicati o scritture.
- [x] Firme reali prima/dopo identiche con claims aal2: amministratore 30c9d579 e store_manager 485baff2 (anche amministratore) entrambi 5 / 78b9b1f3a5a8d70c4dfd48da2a1ca5f6; agente 7: 0 / NULL (string_agg vuoto). Non simulati ruoli puri diversi dagli account reali.
- [x] Test SQL sul DB reale in BEGIN/ROLLBACK: CHECK, riaggancio, tutti gli altri campi invariati, solo transizione NULL→cliente, RLS agente proprio/altrui e gate per ID. 876 test verdi, build OK; documentazione aggiornata, nessuna interfaccia. Root AGENTS.md al limite: nessuna nuova regola aggiunta lì.

# FM71 — Testata condizioni di riferimento, fetta 2b
- [x] Interruttore, cataloghi con RLS utente, salvataggio completo/azzeramento e avviso dopo successo; badge condiviso Testata/Corpo, anche senza cantiere. Nessun DB/PDF/ordine.
- [x] 872 test verdi; browser componenti reali con risposte simulate 375/1280: tre campi salvati e riletti, categoria facoltativa, badge in entrambi i punti, NULL su azzeramento, diniego senza falso successo né righe modificate. Screenshot controllati, niente overflow anche 320/390/768/1920; route temporanea rimossa. Documentazione aggiornata. Regola architetturale root non salvata: AGENTS.md al limite.
- [ ] Verifica cataloghi con sessione operativa: le letture reali di listini_gamma/macrocategorie/categorie_cliente restituiscono tutte zero righe senza errore; non stabilisce un diniego RLS, nessun bypass. Salvataggi reali non eseguiti.

# FM71 — Condizioni di riferimento lato app, fetta 2a
- [x] Fonte unica prezzi-preventivo.ts: dispatcher cliente/riferimento, sede prezzi solo dal preventivo (anche NULL), data/codici e forma comune; priorità cantiere e fonte listino invariate. Nessuna modifica SQL.
- [x] Scelta righe, kit, analisi listini e proposte prezzi cantiere allineati; applicazione usa la proposta analizzata senza nuova RPC. Duplicazione copia i tre riferimenti. Finestre cantiere dirette e annidate ricevono contesto prezzi, cache distinta per condizioni/sede/data; nessuna nuova scelta nella Testata.
- [x] Guardia AST senza eccezioni, test dispatcher/sede NULL/priorità/duplicazione: 865 test verdi. Browser componenti reali con risposte simulate 375/1280: riga riferimento salvata e riletta con fonte listino, analisi/applicazione, kit prioritario cantiere e proposte finestra (4 RPC riferimento, zero cliente), screenshot controllati. Route temporanea rimossa; prova autenticata reale non eseguita. Build automatico OK; documentazione aggiornata.

# FM71 — Condizioni di riferimento, fetta 1 (solo database)
- [x] Applicata 0223_fm71_condizioni_riferimento.sql: tre colonne nullable/FK verificata e wrapper del motore esistente, gate/limite/grant identici; nessuna modifica UI o policy. Registro verificato: 224 voci 0000–0223. Impronte dei tre motori e di tutte le policy public identiche prima/dopo.
- [x] SQL A.N. 3,7503, INTECH cliente 3,4700/riferimento senza accordi, DELEO deposito CA 4,8000, gate 42501 e limite 500/501 superati nel database isolato con copie dei dati e dei cinque corpi funzione reali; solo has_role/auth.uid simulati. Esecuzione sul DB reale impedita da SET ROLE authenticated negato, nessun grant ampliato.
- [x] Documentazione aggiornata e regola commerciale salvata. Quattro test permanenti del contratto SQL aggiunti; 857 test superati, zero fallimenti. Build automatico OK.

# FM70 — Selettore più largo, filtri e sede di riserva, fetta 3c
- [x] Picker 96vw/max 780px, filtri sempre visibili in riga da sm e impilati su telefono, colonna giacenza non comprimibile. Sede cliente di riserva solo di lettura tramite sedeGiacenzePreventivo, apertura/ricerca condividono le props. Precompilazione modificabile del nuovo preventivo già presente e conservata. 853 test verdi; browser con risposte simulate a 320/375/390/768/1280/1920: larghezza, filtri, giacenze sede riserva, badge, apertura, pagine 30/60/65 e selezione, zero errori; screenshot 375/1280 controllati. Pagina temporanea rimossa. Nessuna modifica DB/prezzi/ricerca/permessi; verifica reale autenticata non eseguita.

# FM70 — Apertura picker, fetta 3b
- [x] Applicata 0222_fm70_picker_apertura.sql; funzione/gate/grant verificati sul DB reale, owner authenticated non-BYPASSRLS e nessun CREATE schema residuo, così EXISTS cantieri rispetta le policy. Apertura cantiere/recenti, badge condiviso anche nella ricerca e passaggio cantiere dalle righe; Prezzi cantiere invariato. 850 test verdi; migrazione e SQL permanente eseguiti su DB isolato con fixture: gate negato, cantiere nascosto/visibile, 15 distinti propri, altrui/inattivi/doppioni esclusi, giacenze sede/logistica. Browser simulato 375/1280: apertura, scelta recente, badge ricerca, pagine, vuoto e cambio sede, screenshot e zero errori. Build OK. Verifica autenticata reale resta limitata dalla sessione disponibile (editor in caricamento nella fetta 3a); nessuna modifica a cerca_articoli/prezzi/policy esistenti.

# FM70 — Giacenze e risultati, fetta 3a
- [x] Applicata 0221_fm70_preventivi_store_id.sql: 3 preventivi collegati su 4, quello senza filiale resta NULL; indice verificato. Salvataggi creazione/Testata/duplicazione tramite campiSedePreventivo; picker righe con sede preventivo, Prezzi cantiere con sede cliente. Giacenze UM1/logistica e totale SQL, pagine 30/60/65, reset su ricerca/sede, selezione e assenza giacenze senza sede verificati con risposte simulate a 375/1280 (schermate, zero errori). 847 test verdi, build OK. Nessuna modifica cerca_articoli/prezzi/RLS. Verifica autenticata reale tentata: editor non accessibile alla sessione disponibile.

# FM70 — Ricerca articoli, fetta 1-bis
- [x] Applicata 0220_fm70_ricerca_articoli_fix.sql: due extensions.similarity, query senza varianti, varianti memorizzate bidirezionali e backfill di 64.622 righe; trigger, firma ricerca, gate e prezzi invariati. Documentazione/test aggiornati. Riprodotto 42883 locale con pg_trgm in extensions, stessa chiamata codice ora passa; prove SQL complete e aggiuntive cm↔mm superate sul database isolato, normalizzazione e qualificazione verificate sul DB reale. Ricerca reale autenticata resta non verificabile con la sessione disponibile.

# FM70 — Ricerca articoli, fetta 1
- [x] Applicata 0219_fm70_ricerca_articoli_fetta1.sql: 64.622 testi valorizzati, indice GIN aggiunto senza rimozioni, matching multi-token, rilevanza e sede; impronte prezzi/RLS e blocco gate invariati.
- [x] Parametri preventivo rilevanza/30, pagina Articoli invariata; regola documentata e test SQL permanente. 843 test TS verdi; SQL completo superato sul database locale isolato con la migrazione applicata e gate/prezzo simulati, sei normalizzazioni anche sul DB reale. Browser picker reale isolato 375/1280 ricerca/selezione con risposte simulate, zero errori; nessuna pagina temporanea aggiunta. Build automatico OK, tipi rigenerati dalla piattaforma.
- [ ] Verifica ricerca reale autenticata: sessione disponibile e strumento dati ricevono Accesso negato; nessun gate aggirato. Typecheck separato non disponibile nei risultati automatici (checks vuoto), nessuna esecuzione manuale.

# FM69 — Eliminazioni verificate, fetta 4b
- [x] Chat/promesse/ruoli/push e chiamante notifiche verificati; contatto cliente e attività fornitore già verificati ricondotti alla fonte unica, righe prima dei file. Regola docs e guardia AST con eccezioni tecniche puntuali (19 DELETE) e Set/Map/URLSearchParams espliciti. 842 test; browser chat negata 375/1280, file e messaggio intatti, conferma aperta; pagina temporanea rimossa. Nessun DB/permesso.

# FM69 — Eliminazioni verificate, fetta 4
- [x] Interfaccia recupero/legale/piani/richieste e chiamante solleciti; server con client opzionale e filtri originali, conteggi DELETE reali e stop cascate; audit residui completato. 836 test e browser simulato 375/1280: allegati negati, azione mai cancellata e Storage intatto. Nessun DB; prestazioni reset massivo non provate per evitare cancellazioni reali.

# FM69 — Eliminazioni verificate, fetta 3
- [x] Marketing/WhatsApp con esito unico; figli WhatsApp verificati prima del padre; parziali ricaricati e selezione residua. Browser simulato 375/1280: figli negati, padre mai chiamato; email 2 su 3 con residuo reale. Nessun DB.

# FM69 — Eliminazioni verificate, fetta 2b
- [x] Template, listini acquisto, kit/componenti, aree e membri chat usano esito/messaggio unico; audit completo dei tre chiamanti API, conferme negate aperte e parziali ricaricati. Chat elimina gli ID dei membri letti con RLS e ricarica selezione reale anche dopo aggiunte/rimozioni fallite senza falso successo. 829 test superati, build/controlli automatici OK; browser simulato template/componente kit negato-riuscito a 375/1280, nessun errore runtime. Prova permanente tests/eliminazioni-fetta2b.browser.py. Nessun DB, marketing/WhatsApp/recupero invariati.

# FM69 — Eliminazioni verificate, fetta 2a
- [x] Tutti i chiamanti della fetta 1 verificano l'esito; PrezziCantiereDialog ora usa anche messaggio unico. Casi indicati migrati, conferme negate restano aperte; task corregge Storage-prima-riga, AllegatiSection mantiene riga-prima-Storage con guardia. Partecipanti parziali aggiornano lista e preservano selezione residua. 827 test superati, build/controlli automatici OK; browser simulato 375/1280 negato/riuscito allegato (Storage intatto se negato) e partecipanti negati/2 su 3, nessun errore runtime. Prova permanente tests/eliminazioni-fetta2a.browser.py. Nessun DB o altre eliminazioni.

# FM69 — Eliminazioni verificate, fetta 1
- [x] Fonte unica a conteggio esatto/id deduplicati, esito parziale e messaggi condivisi; opportunità/preventivi/note aggiornano solo dopo successo completo, note mantengono vincolo preventivo. 825 test superati, build e controlli automatici OK. Browser simulato 375/1280: DELETE count=exact senza righe restituite, negato mantiene riga/cache e opportunità, riuscito rimuove; nessun errore runtime. Prova permanente tests/eliminazioni-verificate.browser.py. Nessuna modifica DB o alle altre eliminazioni.

# FM69 — Aperti: cantieri, Testata e barra richieste
- [x] Applicata 0218: gate consultazione condizioni/cantiere, DROP lite senza dipendenze, RPC batch modificabili.
- [x] Matrici aal2 prima/dopo verificate con rollback: Daniele accede alle condizioni, altri invariati; RPC modificabili coerente con UPDATE per tutti e cinque. 824 test superati, controlli automatici/build OK. Browser con risposte simulate a 375/1280 e 740 orizzontale: una richiesta per lista, sola modifica autorizzata, barra a 8px quando nascosta e 64px al ritorno; nessuna scrittura reale. AGENTS root pieno: regola salvata in docs/regole/fonti-uniche.md.

# FM69 — Fonte prezzo e protezione listini
- [x] Applicata 0217_fm69_fonte_prezzo_riga.sql, NULL storico senza backfill; fonte unica/copia duplicato, manuali non spuntate e segno persistito. Conversione ordine invariata: non copia la fonte.
- [x] 821 test superati e build OK; browser simulato 375/1280: scelta articolo/kit, manuale non spuntato e badge, listino/NULL spuntati, manuale sotto costo con entrambe le indicazioni, ripristino volontario. Nessuna scrittura di dati reali.

# FM69 — Applicazione prezzi cantiere
- [x] Priorità unica, cache RLS condivisa, articoli/kit/listini, segno e finestra dal Corpo; documentazione aggiornata, nessun DB.
- [x] 806 test pass, build OK; browser 375/1280 con risposte simulate: articolo dedicato 6,50/costo 3,10, listino 12, extra 10%, modifica manuale/segno e ripristino scelto, kit quantità 2/costo 6,20, una lettura prezzi. Nessuna scrittura reale.

# FM69 — Ricerca unica, U.M. manuali e numeri
- [x] Riprodotti due portali alla creazione: trigger tabella visibile e scheda nascosta ancorata a (0,4). Selettore condiviso verifica layout reale e chiude quando nascosto; U.M. manuale nel componente condiviso; slot numeri/icona fissi.
- [x] Clic/autoOpen e prezzi cantiere: un solo portale, 30 risultati e wheel funzionante a 1280/900/375; manuale modificabile e font 700, numeri allo stesso x. Test browser permanente fallisce con vecchio picker (2 ricerche) e passa col nuovo. 799 test pass; build OK. Risposte simulate, nessuna scrittura DB.

# FM69 — Primo carattere nei campi del preventivo
- [x] Riprodotto sulla pagina effettiva con risposte simulate: lordo/sconti/ricerca perdono il primo tasto, descrizione/Testata no. Capture ripristina il value prima di onChange; spostato il solo evento in bubble, nessuna modifica DB.
- [x] Test browser permanente fallisce intercettando il vecchio hook e passa col nuovo; campi, Salva, indicatore e uscita/Resta verificati, screenshot 375/1280. 799 test pass, build e controlli automatici OK. JSDOM da solo non riproduce il difetto; regressione provata in Chromium. Sessione reale senza preventivi: nessuna scrittura reale.

# FM69 — Correzioni dopo prova Andrea
- [x] Righe compatte, CellaUm condivisa, ricerca con portale modale scorrevole e badge/conteggi RLS batch da 500 ID in tutte le viste richieste; invalidazione condivisa e plurali corretti.
- [x] 798 test superati; controlli automatici/build OK. Screenshot prezzi, ricerca (30 risultati, oltre 10 visibili PC, wheel verificata dentro/fuori dialog) e lista Cantieri a 375/1280 senza overflow. Dati simulati; sessione reale mostra lista vuota, nessuna scrittura DB; pagina temporanea rimossa. AGENTS root pieno: nuove regole tecniche non salvate.

# FM69 — Prezzi cantiere, fetta 2b
- [x] Rimossi lettore/mappa/stato/riapplicazione legacy e tutti gli usi; Aggiorna listini ritorna solo aggiornate; avviso RLS e dialog esistente dal preventivo, toast solo dopo scelta salvata.
- [x] Documentazione FM69 aggiornata; 794 test pass, build OK; screenshot 375/1280 con dati simulati, nessun overflow, apertura dialog, conteggio dopo DELETE e toast Vedi verificati. Pagina temporanea rimossa; verifica con sessione reale non disponibile, nessuna scrittura DB.

# FM69 — Prezzi cantiere, fetta 2a
- [x] API nuovo schema, dialog con ArticoloGammaPicker/prezzoNettoRiga/rigaInUnita, permesso RPC unico e conteggio dal cantiere; eliminata PrezziCantieriView e tab globale, corretto DELETE/scollegamento dal lead.
- [x] 791 test pass; typecheck automatico/build OK. Schermate 375/1280 (anche 320/390/768/1920) senza overflow. Con risposte simulate: proposta singola chiamata, duplicati, salvataggi UM1/UM2, sconti invalidi, DELETE zero/successo, motore negato e sola lettura verificati. Nessun DB e preventivi-api invariata; flusso con prezzi reali non verificato.

# FM69 — Prezzi cantiere, fetta 1 (solo database)
- [x] Applicata 0216_fm69_prezzi_cantiere_fetta1; schema prezzi manuali, fonte unica modifica cantiere e policy. Nessuna modifica UI; riferimenti esistenti invariati, tipi rigenerati automaticamente.
- [x] Matrici transazionali 7 utenti × 4 cantieri con aal2: UPDATE prima/dopo identici; INSERT/SELECT prezzi verificati. Nessun utente solo showroom presente. Test SQL permanente superato, 785 test applicativi verdi, build OK; schema/grant/restrittive verificati e nessun dato residuo.

# FM69 — Eliminazioni e collegamenti cantieri
- [x] Esito unico nei tre DELETE; collegamenti sotto RLS nel dialog e navigazione incorporata. Permessi e query lista invariati; nessuna modifica DB.
- [x] 785 test, typecheck senza errori e build OK; schermate 320/375/390/768/1280/1920 senza overflow, messaggi zero righe/FK/errore/successo e navigazione normale/incorporata verificati con risposte simulate. Sessione reale: lista vuota; nessuna cancellazione reale. Inventario altre eliminazioni completato senza modificarle.

# FM68 — Pulizia Cliente e Cantiere
- [x] AzioneRiquadro condivisa; nome apre CantiereDialog con regola di modifica dell’elenco, altrimenti /cantieri?tab=lista&focus=id; distanze compatte e nomeSedeBreve solo visuale.
- [x] 781 test; schermate 375/1280 normale/coincidente/sola lettura, aria-label/tooltip, mappa e scheda simulati, nessun overflow/errori. Pagina temporanea rimossa; nessun DB/query/permessi cambiati.

# FM68 — Sede cliente per ID
- [x] 0215: condizioni_preventivo_cliente aggiunge solo store_id UUID in coda e cl.store_id alla SELECT; definizione applicata confrontata, gate e grant identici.
- [x] ID passato dalla pagina a Testata/Attività/Cantiere; ricerche stores per ID e cache per ID; tipo dalle Returns generate, test statico anti-nome, 780 test verdi e build OK. Nessuna impersonazione.

# FM68 — Routes API e distanza sede cliente
- [x] Helper Routes unico, query/candidate e UPDATE identici byte per byte; funzione autenticata senza scritture e distanza nel riquadro, riga unica per sede coincidente.
- [x] 779 test verdi; una sola prova reale helper: 344.711 km, 213.0333 minuti; schermate simulate 375/1280 senza overflow/errori, pagina temporanea rimossa. Nessuna modifica DB o chiave client; flusso autenticato reale non verificato.

# FM68 — Fetta A: visibilità preventivisti (solo database)
## Cantiere preventivo — fetta 2 ridotta
- [x] Distanza esclusivamente salvata, helper/test; dialog con mappa esistente opt-in compatta e fallback, nessuna nuova chiamata di distanza. Nome sede cliente risolto dal catalogo stores, coordinate sotto RLS.
- [x] 773 test verdi, build OK; schermate riquadro/dialog 375/1280, entrambe aperture e link sede→cantiere verificati, nessun overflow 320–1920. Google reale non verificato: controllare sull'app pubblicata; pagina temporanea rimossa, nessuna modifica DB, chiavi, caricatore o helper server.
## Attività commerciali nel preventivo — fetta 1
- [x] 0213: colonna/FK/indice e tre policy additive; 11 precedenti identiche (MD5 03e197c15551c44c79f6405ec3a4e955), nessuna impersonazione.
- [x] Legame/autore solo in creazione, riquadro Testata con dialog condiviso e link calendario; Cantiere e gestori Testata invariati. Sede risolta dal nome esatto già fornito dalla RPC sul catalogo stores (nomi reali non duplicati), senza leggere clienti.
- [x] 769 test, build OK; schermate simulate 375/1280, creazione/modifica/rilettura e sola lettura, nessun overflow 320–1920. Nessuna scrittura reale né verifica dei permessi impersonata; pagina temporanea eliminata.
## Attività commerciali — indirizzo e sede di riferimento
- [x] 0212 additiva, cinque colonne nullable e FK/indice; tipi rigenerati. Undici policy identiche (MD5 03e197c15551c44c79f6405ec3a4e955), store_id preservato in modifica, luogo storico non inviato.
- [x] BloccoIndirizzo e sede manuale prevalente; storeIdAttivita/sedeInizialeAttivita e luogoAttivita condivisi. Calendario (tooltip/dettaglio) e opportunità aggiornati; nessun altro lettore/export attività trovato.
- [x] 764 test bun; salva identico byte per byte esclusi soli campi richiesti. Schermate creazione/modifica 375/1280, compilazione e salvataggi/rilettura simulati; calendario con metadati tardivi e nessun overflow 320/390/768/1280/1920. Sessione reale apre calendario, nessuna scrittura reale né Google reale provati. Pagina temporanea eliminata.
## Indirizzi giro 3
- [x] Cinque residenze con BloccoIndirizzo opt-in a campo unico, stessi stati e salvataggi; nessuna modifica DB/chiave. I suggerimenti uniscono via/CAP/città/provincia nel solo campo esistente.
- [x] 752 test; salvataggi identici byte per byte; schermate simulate modifica contatto/privacy 375/1280, modifica manuale e payload privacy verificati; fallback senza chiave scrivibile. Google reale e scritture reali non provati; pagine temporanee rimosse. Residuo: attivita-commerciale-dialog.tsx:227 Luogo (indirizzo o sede), non toccato; città/provincia marketing sono filtri, invio massivo usa email/PEC. Modulo privacy pubblico solo in firma-privacy; iscrizioni non lo importano.
## Indirizzi giro 2
- [x] Indirizzi cliente condivisi, nota Gamma; picker apre CantiereDialog con nome iniziale opt-in. Wrapper TS creaCantiereLite rimosso, funzione DB intatta.
- [x] 749 test; salvataggi wizard/EditClienteDialog identici byte per byte; picker simulato testo→maschera→INSERT→selezione a 375/1280 senza errori. Screenshot verificati, pagina temporanea rimossa. Cinque campi residenza residui inventariati e non toccati; nessuna scrittura reale.
## Indirizzi giro 1
- [x] BloccoIndirizzo condiviso in cantiere, nuovo/modifica lead, partecipante e sede; chiave e salvataggi invariati, limiti preservati e provincia maiuscola. Regola aggiunta a fonti-uniche.
- [x] 747 test; cinque gestori identici byte per byte; schermate nuovo lead/sede 375/1280 con suggerimenti Google simulati, compilazione/modifica manuale, fallback e disabled verificati. Nessuna scrittura DB né verifica Google reale; pagina temporanea rimossa, CantierePicker intatto.
## Fetta C
- [x] Tre usi NuovoCantiereForm sostituiti con CantiereDialog, form eliminato; opzioni iniziali/callback opt-in, stessi gestori e nessuna modifica DB. CantierePicker conserva l'uso di crea_cantiere_lite.
- [x] 743 test; schermate simulate 375/1280, normale/provvisorio, annullamento, cliente fisso e selezione dopo INSERT simulato. Gestori della pagina, Testata e creazione preventivo identici; pagina temporanea rimossa. Nessuna prova di scrittura su preventivo reale.
## Fetta B2
- [x] Helper preventivista, Lead nel menu/guardie; modifica propria, nessun nuovo DELETE e link clienti sotto RLS. Cantieri già presente nel gruppo preventivi, deduplicazione invariata; mappa disabilita apertura di modifica altrui.
- [x] 740 test; schermate simulate 375/1280 con record propri/altrui e cliente non visibile; nessuna modifica database. Creazione/salvataggio su account Pierpaolo reale non verificati: sessione disponibile di altro account, dati/ruoli intercettati soltanto nelle prove browser.
## Fetta B1
- [x] 0211 indicatore sintetico con fonti SQL canoniche; due punti del preventivo con pallino condiviso e chiave query unica. 736 test verdi.
- [x] Schermate con dati simulati 375/1280 e telefono orizzontale; nessun overflow 320/375/740/768/1280/1920, pagina temporanea rimossa.
- [ ] RPC impersonata Pierpaolo aal2 fuori sede/diniego: sandbox_exec non può SET ROLE authenticated né EXECUTE della RPC; nessun grant ampliato. Sessione reale mostra elenco preventivi vuoto, quindi flusso reale non verificato.

- [x] 0210: helper e nove policy additive su cantieri, contatti e lead; nessuna apertura clienti o dati finanziari/legali. Unica dipendenza diretta: consensi_log su contatti, con gate originali invariati; nessuna cascata finanziaria/legale.
- [x] Quindici controlli SQL superati: policy applicate, default, grant e impronte di tutte le policy/funzioni preesistenti invariate. Nessuna modifica TypeScript manuale; tipi rigenerati automaticamente dalla piattaforma. Prove di scrittura con sessione utente non eseguite.

# FM68 — Barra blu a scomparsa (telefono orizzontale)
- [x] Hook use-barra-a-scomparsa (scroll passive + rAF, soglie 56px / 8px, `disattiva` col menu aperto); header mobile con `data-nascosta` e classe `pv-orizzontale:data-[nascosta=true]:-translate-y-full`. Nessuna modifica a menu, voci, permessi, badge, notifiche, DB.
- [x] 732 test verdi; comportamento verificato con sessione reale a 740×360 (giù → barra fuori, su ≥8px → ritorna, su 5px → resta nascosta, cima → visibile), 375×812 (barra sempre visibile), 1280×800 (header `display:none`, `main` invariato); menu aperto + scroll → barra visibile.

# FM67 — Testata Cliente sotto Documento
- [x] Due colonne indipendenti 62/38; Cliente etichettato e Condizioni su due colonne, sola grafica.
- [x] 732 test; save e 10 gestori identici byte per byte; schermate 375/1280/1600 modifica/lettura con dati simulati, controlli 320/768/1024/1920 senza overflow/errori; blur Titolo/Note verificati senza scritture DB.

# FM67 — Note con titolo e allegati
- [x] Migrazione 0208: note, RLS, eccezione showroom autorizzata, storage, copia atomica nell’ordine.
- [x] Note in linea e AllegatiSection compatta nella Testata; copia note nei duplicati.
- [x] 732 test; compilazione OK; schermate 375/1280 e nessun overflow 320/375/390/768/1280/1920, aggiunta/modifica/elimina e anteprima simulate; RPC reale identica salvo copia note.
- [ ] Verifiche RLS con amministratore/store_manager/preventivi e duplicazione/ordine su dati reali: sessione disponibile non soddisfa MFA e non vede PRV-161; strumento SQL non può assumere authenticated né eseguire i gate. Nessun bypass o dato di prova persistente.

# FM65 — Correzioni E
- [x] FM67 cliente incorporato: parametro validato, cornice rimossa dopo gate identici, tab preservate, link fuori finestra; 727 test e schermate 375/1280 della finestra/normalità, sessione reale e cliente simulato (elenchi reali vuoti). Pagina temporanea rimossa; nessuna modifica DB.
- [x] FM67 Testata compatta: densità opt-in, griglia 62/38, 722 test verdi; save e 10 gestori identici byte per byte. Schermate modifica/lettura 375/1280/1600 e controlli 320/768/1024/1920 senza overflow/errori; dati finti, pagina temporanea rimossa. Nessuna modifica database.
- [x] Cornice anagrafica condivisa; nota acquisto e giacenze tramite lettore esistente, errori locali; nessuna modifica SQL/database.
- [x] 710 test verdi; typecheck e compilazione verdi. Screenshot 375/1280 Riepilogo/Testata/Piede e diniego isolato; controlli 320/390/768/1920 senza overflow/errori browser. Dati finti, pagina temporanea rimossa; nessuna migrazione.

# FM65 — Correzioni C + D
- [x] Fascia con token azzurro medio documentato in styles.css; elenco con frecce, bordo 3px e alternanza per gruppo, titoli medium; sola grafica.
- [x] 706 test; screenshot 375/1280 con tre gruppi e due alternative sul primo, nessun overflow/errori; contrasto minimo fascia 4,79:1. Query, filtri e conteggi identici byte per byte; pagina temporanea rimossa.

# FM65 — Correzioni B
- [x] Celle omogenee senza riquadri, U.M. 72px compatta, # 40px e icona riepilogo in #/testata scheda; sola grafica.
- [x] 706 test; mutation/onMutate/onPatch e conversioni identici byte per byte; screenshot 375/1280/1440 con codice lungo intero, pagina senza overflow e tabella invariata a 1470px; pagina temporanea rimossa. Prova con dati finti.

# FM65 — Correzioni A
- [x] Finestre Duplica/Nuovo senza overflow; selettore clienti chiaro alla fonte (variant default locale, nessuna modifica globale).
- [x] Filiale dalla sede cliente solo al cambio, modifica manuale preservata; primo blocco solo dalla finestra Nuovo, errore non bloccante.
- [x] 706 test; screenshot 375/1280/1440 delle finestre reali con dati simulati, filiale automatica/manuale/senza sede e nessun overflow o errore browser; pagina temporanea rimossa, nessun dato creato nel database. Sessione Andrea non disponibile.

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

- [x] FM65 F1: cerca_articoli coppie/marca/solo_gamma + terne_articoli_filtri (0206)
- [ ] FM65 F2-F5: logica cascata, componente condiviso, picker, verifica
- [x] FM65 F2 logica filtri a cascata
- [x] FM65 F3 Senza famiglia/marca in ricerca + filtri a cascata nel catalogo
- [x] FM65 F4 filtri a cascata nella ricerca articolo del preventivo
- [x] FM67 linguette Testata/Corpo/Piede (variante opt-in tabs.tsx) + Margine/Totale imponibile allineati a destra
- [x] FM67 cella U.M.: esponente solo "1"/"2" (tolto "UM"), title/aria-label "Unità 1"/"Unità 2"; 732 test verdi, schermate 375/1280, nessuna modifica DB
- [x] FM68 loghi allineati alla regola MADE: login `w-[341px] max-w-full h-auto` + aspectRatio (48 px come l'old h-12), header mobile `w-32` anche sotto sm; 732 test verdi, nessuna modifica DB
