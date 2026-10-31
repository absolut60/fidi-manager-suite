# Roadmap

## FM55 — Import/Export: diagnosi doppioni e schermata
- [ ] Diagnosi in sola lettura dei file del 31/10 11:13 e 30/10 17:57
- [ ] Nascondere file e avvio dopo la partenza degli import A/B/C
- [ ] Rileggere il precalcolo alla fine degli import; attesa automatica ogni 15 secondi, massimo 10 minuti
- [ ] Test mirati, controlli automatici e verifica schermata dove l'accesso lo consente

## FM55 — Fetta 5a: nuovo calcolo per tutti
- [x] Baseline importi, regole e visibilità: 12900 righe, stesso MD5 dopo il cambio
- [x] Colonne additive e pubblicazione v2 nel blocco di ricalcolo (0105)
- [x] Fonte unica nelle schermate e richieste; export coerente, senza pavimento
- [x] Ricalcolo completo diretto DB (13,042 s); mapping integrale e visibilità verificati, test SQL e 5 test applicativi
- [ ] Verifica autenticata e visuale 320–1920: sessione del richiedente non ottenibile; accesso esplicito non autorizzabile in questo contesto
- [ ] Controllo tipi dedicato: non eseguito manualmente; compilazione automatica OK

## FM55 — Fetta 4c: notifiche Alert fidi spente
- [x] Funzione protetta e passo del ricalcolo senza modificare calcoli (0104)
- [x] Prove SQL annullate: 356 avvisi / 17 gruppi / 15 utenti; livelli, doppioni e interruttore verificati
- [x] Notifiche ripristinate integralmente: 2885 righe, 0 alert notificati; compilazione automatica OK
- [ ] Registrazione catalogo notifiche: inserimento dati a carico del proprietario; funzione bloccata da accesa senza catalogo corretto
- [ ] Controllo tipi dedicato: esecuzione manuale non disponibile, verifica affidata ai controlli automatici della piattaforma

## Tooltip calendario commerciale e Task
- [x] Riusare i testi già caricati e condividere il montaggio all'apertura con i tooltip recupero
- [x] Compilazione automatica riuscita; nessuna query aggiunta, handler clic/tocco invariati
- [ ] Verifica autenticata dei tooltip con dati reali: account del richiedente non disponibile; serve accesso in anteprima

## FM38 — Pagina richiesta fido (impaginazione)
- [x] Tre giri: struttura in 4 blocchi, fascia dati su una riga, Decisione doppia/semplice compatte, Quadro cliente a griglia unica, Workflow in linea
- [x] Cella "Ordini in corso" (doc_da_evadere) dopo "A scadere" nel Quadro cliente, con title "Ordini da evadere — non concorrono al fido"; MetricCard accetta title opzionale
- [x] tsgo --noEmit pulito; prova isolata componenti reali 320/390/768/1024/1280/1600 senza scorrimento orizzontale; variante compact invariata
- [ ] Verifica autenticata con dati reali: accesso del richiedente non disponibile; serve login in anteprima


## FM38 M1 — Impaginazione proposta massiva
- [x] Intestazione e footer fissi, impostazioni compatte, elenco a due righe
- [x] Prova isolata componenti reali 320/768/1024/1280; filtri e payload identici; compilazione automatica riuscita
- [ ] Verifica autenticata con dati reali: accesso del richiedente non disponibile; serve login in anteprima

## FM38 D4 — Descrizioni condizioni di pagamento
- [x] Regola unica, selettori e viste richieste fido con descrizione prima del codice
- [x] Quattro test regola e prova isolata dei componenti reali 320/390/768/1280 (ricerca, selezione, tooltip, assenza overflow)
- [ ] Verifica delle pagine con dati reali: bloccata dall’assenza di account del richiedente; serve login in anteprima

## FM36 fetta 14 — Calendario recupero crediti
- [x] Promesse e rate senza orario, sovrapposizioni limitate, vista Agenda e titoli leggibili
- [x] Filtri locali ed elenco arretrate su tutti i periodi
- [ ] Verifica visiva autenticata 320/390/768/1280/1920: bloccata dall'assenza di un account del richiedente nella preview

- [x] Strato 2b WhatsApp: server function `sincronizzaStatiTemplate` + bottone "Sincronizza stati" nel tab template
- [x] Messaggio chiaro su errori temporanei 5xx (502/503/504/522) — incluso nella nuova funzione di sync

- [x] WhatsApp: originPubblico() sceglie un solo dominio pubblico da APP_URL multi-valore

## Alert variazioni blocco clienti (fette)
- [x] Fetta 1 — scheletro DB (clienti_blocco_stato, clienti_blocco_variazioni, RPC rileva_variazioni_blocco non invocata)
- [x] Fetta 2 — pagina "Variazioni blocco clienti" + voce menu (clienti-variazioni-blocco.tsx, app-shell.tsx)
- [ ] Fetta 3 — notifiche al completamento dell'import (aggancio da definire con l'utente)
## Notifiche — raggruppamento DB
- [x] Catalogo tipi e configurazioni iniziali
- [x] Regola unica di raggruppamento prima dell’inserimento
- [x] Produttori fidi senza destinatari duplicati e con metadati negozio
- [x] Compatibilità degli inserimenti applicativi verificata

## Notifiche — interfaccia raggruppata
- [x] Conteggio e ultimo aggiornamento nella riga condivisa
- [x] Ordinamento per ultimo aggiornamento in tutti gli elenchi
- [x] Aggiornamenti realtime silenziosi nella campanella
- [x] Verifica TypeScript e compilazione
## Notifiche — contatore e archivio
- [x] Riga notifica e conteggio non lette condivisi
- [x] Scroll corretto in Dashboard e campanella
- [x] Pagina /notifiche paginata con filtro e azioni di lettura
- [x] Verifica TypeScript e compilazione; viewport autenticati non provabili senza account del richiedente

## Richieste fido — interruttore "Solo quelle che posso decidere" (FM36 fetta 16)
- [x] FiltriRichieste.soloDecidibili con valore iniziale per approvatori limitati (Liv. 1/2, non admin)
- [x] filtraRichieste riceve roles: esclude solo le in attesa non decidibili (puoDecidereRichiesta, fonte unica)
- [x] Switch in FiltriRichiesteBar con contatore decidibili in attesa su righe non filtrate
- [x] "Azzera filtri" riporta il valore iniziale; filtriAttivi non conta l'interruttore
- [x] Nota Liv. N in scheda "In approvazione" con interruttore spento; typecheck pulito

## FM37 fetta 1 — quattro correzioni frontend (completata)
- notifiche.ts: chiudiTuttiGliAvvisi azzera prima il badge (clearAppBadge), poi chiude gli avvisi; registrazioneSw con getRegistration + timeout 2 s (niente più .ready che non si risolve senza push attivate)
- eventi.$eventoId.tsx: badge "Sul posto" su registrato_sul_posto === true (fonte unica), "Da importazione" invariato
- NuovoPreventivoDialog.tsx: al cambio cliente l agente non viene sovrascritto per isWriteOnly; reset cantiere solo se cambia davvero il cliente (ref)
- mail-sinistro-dialog.tsx: campo Importo sinistro obbligatorio (>0), segnaposto {{importo}} nel corpo, anteprima con segnaposto evidenziato se mancante, blocco invio con toast, RPC apri_sinistro_pouey con l importo del campo; cliente-insoluti-tab.tsx precompila con scaduto_eur/promessa_data da get_sinistri_da_aprire (queryKey ["sinistri-da-aprire"])

## FM39 — Condizione di pagamento approvata diversa dalla proposta
- [x] Fetta 1 — migrazione DB applicata (0012_richieste_fido_condizione_approvata.sql): colonne condizione_pagamento_richiesta_cod e condizione_pagamento_modificata, RPC processa_richiesta_fido con _condizione_approvata_cod; chiamate esistenti (richieste.tsx:790, richieste.$richiestaId.tsx:528 e :652) non modificate
- [ ] Fetta 2 — interfaccia: in approvazione l'approvatore può scegliere una condizione diversa da quella proposta (attesa istruzioni)

- [x] Fetta B: notifica a ogni nuova nota di recupero

## Registra promessa — data non precompilata e vincolo al futuro
- [x] Data promessa vuota all'apertura, sempre obbligatoria, min = oggi, rifiuto al salvataggio se nel passato, testo d'aiuto sotto il campo
- [x] Verificato (senza modifiche) che ModificaAzioneDialog permette di correggere data_promessa_pagamento di una promessa esistente
- [x] tsgo --noEmit exit 0; build OK
