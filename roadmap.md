# Roadmap

## FM38 D4 — Descrizioni condizioni di pagamento
- [ ] Regola unica, selettori e viste richieste fido con descrizione prima del codice
- [ ] Verifiche dei casi limite e resa 320/390/768/1280

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
