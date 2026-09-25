# Piano — Interfaccia notifiche raggruppate

## Obiettivo
Adeguare esclusivamente l’interfaccia alle notifiche accorpate già prodotte dal database, mostrando conteggio e ultimo aggiornamento senza cambiare invio, lettura o persistenza.

## Interventi
1. **Modello condiviso**
   - Estendere `Notifica` con `conteggio` e `aggiornata_at`.

2. **Elenco e ordinamento**
   - Dashboard, campanella e pagina Notifiche selezioneranno i nuovi campi.
   - Tutti e tre gli elenchi saranno ordinati per `aggiornata_at` decrescente.
   - Polling Dashboard e campanella resteranno a 30 secondi.

3. **Riga condivisa**
   - Calcolare il tempo relativo da `aggiornata_at`.
   - Mostrare accanto al titolo un badge compatto solo quando `conteggio > 1`, senza comprimere il testo sui telefoni.

4. **Aggiornamenti in tempo reale della campanella**
   - Conservare l’attuale gestione `INSERT`, inclusi toast e suono.
   - Aggiungere sullo stesso canale l’ascolto `UPDATE` per lo stesso utente.
   - Sostituire la riga aggiornata, portarla in cima e mantenere al massimo 30 elementi.
   - Invalidare il contatore quando la riga aggiornata è non letta.
   - Non emettere toast o suono sugli aggiornamenti.

5. **Verifica**
   - Controllare TypeScript e stato della compilazione.
   - Verificare il rendering pubblico disponibile; la prova autenticata sarà eseguita solo se è disponibile una sessione valida.

## File previsti
- `src/lib/notifiche.ts`
- `src/components/notifiche/notifica-riga.tsx`
- `src/components/notifications-bell.tsx`
- `src/routes/_app/dashboard.tsx`
- `src/routes/_app/notifiche.tsx`
- `roadmap.md` (solo avanzamento della fetta)

## Vincoli rispettati
- Nessuna modifica al database, ai trigger, alle regole di accesso o ai produttori di notifiche.
- Nessuna nuova dipendenza.
- Nessuna duplicazione del rendering della notifica.
