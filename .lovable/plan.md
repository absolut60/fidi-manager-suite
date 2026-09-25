# Piano — notifiche, contatore reale e archivio completo

## Obiettivo
Correggere lo scorrimento dei due elenchi esistenti, mostrare sempre il numero reale di notifiche non lette e aggiungere una pagina completa e paginata, senza modificare database, permessi o invio delle notifiche.

## Interventi

1. **Fonte condivisa per tipo, riga e conteggio**
   - Creare `src/lib/notifiche.ts` con il tipo `Notifica` e `contaNonLette(userId)`, basata su conteggio esatto e senza caricare righe.
   - Creare `src/components/notifiche/notifica-riga.tsx` come unica resa grafica della notifica: stato non letto, titolo, messaggio, tempo relativo italiano e freccia quando esiste una destinazione.
   - La riga gestirà l’attivazione da mouse e tastiera tramite una callback: prima segna la notifica come letta, poi apre la destinazione se presente. Dashboard, campanella e nuova pagina useranno esclusivamente questo componente.

2. **Dashboard**
   - Mantenere invariati caricamento delle ultime 20 notifiche e aggiornamento ogni 30 secondi.
   - Sostituire il conteggio derivato dalle 20 righe con una query dedicata che usa `contaNonLette`.
   - Sostituire `ScrollArea` con un contenitore `max-h-[28rem] overflow-y-auto`.
   - Dopo “Segna letta” o “Segna tutte lette”, aggiornare sia le righe locali sia il conteggio condiviso.
   - Aggiungere in fondo il collegamento “Vedi tutte” a `/notifiche`.

3. **Campanella**
   - Mantenere invariati polling a 30 secondi, sottoscrizione in tempo reale, suono e toast.
   - Usare `contaNonLette` per il badge, con formato `99+` oltre 99.
   - Aggiornare il conteggio dopo inserimenti in tempo reale e dopo le azioni di lettura.
   - Sostituire `ScrollArea` con `max-h-[60dvh] overflow-y-auto` e rendere il pannello largo `w-[calc(100vw-2rem)] sm:w-96`.
   - Aggiungere “Vedi tutte” a `/notifiche`, chiudendo il pannello prima della navigazione.

4. **Pagina `/notifiche`**
   - Creare `src/routes/_app/notifiche.tsx` con titolo e metadati propri, senza aggiungere una voce al menu.
   - Caricare solo le notifiche dell’utente corrente, ordinate dalla più recente, con `.range(...)`, conteggio esatto e 50 righe per pagina.
   - Aggiungere filtro a due stati “Non lette” / “Tutte”, con “Non lette” predefinito e ritorno alla prima pagina al cambio filtro.
   - Mostrare il contatore reale “N non lette”, il pulsante “Segna tutte lette”, stati di caricamento/vuoto e navigazione Precedente/Successiva.
   - Dopo ogni azione, sincronizzare elenco, totale paginato e conteggio condiviso; se una pagina resta vuota, riportare alla pagina valida precedente.
   - Layout mobile-first da 320 px: intestazione e azioni vanno a capo, testi spezzabili, controlli con target touch adeguato.

## Dettagli tecnici
- Il conteggio condiviso userà una chiave React Query unica per utente, così Dashboard, campanella e pagina rimangono coerenti senza richieste duplicate inutili.
- Le mutazioni aggiorneranno/invalideranno la stessa chiave solo dopo un esito riuscito.
- I link memorizzati nelle notifiche continueranno a essere aperti tramite il router applicativo; nessuna modifica alle destinazioni esistenti.
- Nessuna nuova dipendenza e nessuna modifica a database, trigger, RLS, funzioni di invio o menu.

## File previsti
- Nuovi: `src/lib/notifiche.ts`, `src/components/notifiche/notifica-riga.tsx`, `src/routes/_app/notifiche.tsx`.
- Modificati: `src/routes/_app/dashboard.tsx`, `src/components/notifications-bell.tsx`.

## Verifica
- Controllo automatico TypeScript e stato della compilazione.
- Prova autenticata: badge con conteggio reale, lettura singola e totale, filtro/paginazione, collegamenti e chiusura campanella.
- Controllo visivo e dello scorrimento a 320, 390, 768 e 1280 px.
