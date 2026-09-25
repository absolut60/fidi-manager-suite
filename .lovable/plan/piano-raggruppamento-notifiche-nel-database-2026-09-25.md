# Piano — Raggruppamento notifiche nel database

## Obiettivo
Centralizzare nel database il raggruppamento di tutte le notifiche, indipendentemente dal produttore. Una nuova notifica confluisce nell'eventuale notifica non letta dello stesso gruppo; in quel caso non viene inserita una nuova riga e non parte una seconda push.

## Interventi
1. **Catalogo dei tipi**
   - Creare `public.notifiche_tipi` con configurazione di raggruppamento, chiave metadata, titolo e link aggregati, timestamp e i 12 tipi indicati.
   - Concedere lettura agli utenti autenticati e gestione ai soli amministratori tramite RLS; accesso completo al servizio applicativo.
   - Aggiungere aggiornamento automatico di `updated_at` solo sul catalogo.

2. **Campi di aggregazione sulle notifiche**
   - Aggiungere `conteggio`, `chiave_gruppo` e `aggiornata_at` con i default richiesti.
   - Allineare soltanto `aggiornata_at` a `created_at` sulle righe esistenti, senza raggrupparle e senza introdurre trigger di aggiornamento su `notifiche`.
   - Creare l'indice parziale per utente e gruppo sulle notifiche non lette.

3. **Regola unica prima dell'inserimento**
   - Creare `raggruppa_notifica()` come funzione protetta e trigger `BEFORE INSERT`, con nome ordinato prima di eventuali altri trigger dello stesso tipo.
   - Applicare configurazione esplicita o default; costruire la chiave del gruppo; serializzare gli inserimenti concorrenti con advisory lock.
   - Se esiste una notifica non letta del gruppo, aggiornarne conteggio, titolo, messaggio, link, data e metadata, mantenendo gli ultimi 20 metadata in ordine dal più recente; quindi annullare il nuovo inserimento.
   - Rimuovere automaticamente il prefisso vuoto del segnaposto `{gruppo}`.
   - Lasciare invariati funzione e trigger della push: l'aggiornamento aggregato non attiverà l'`AFTER INSERT` esistente.

4. **Produttori fidi**
   - Ricreare `notifica_richiesta()` e `notifica_admin_fido_approvato()` mantenendo il corpo attuale salvo: destinatari distinti nei cicli e aggiunta condizionale di `store_id`/`gruppo_etichetta` ai metadata.
   - Recuperare il nome negozio da `stores` tramite `NEW.store_id`; testi, destinatari e altri comportamenti restano invariati.

5. **Verifiche**
   - Verificare schema, seed, RLS/GRANT, trigger e definizioni delle due funzioni dopo la migrazione.
   - Verificare con transazione di prova il primo inserimento, l'aggregazione successiva, il gruppo senza etichetta e il tipo non raggruppabile, senza lasciare dati di test.
   - Rigenerare i tipi applicativi tramite la migrazione e controllare la compilazione.
   - Riportare tutti gli inserimenti applicativi che usano `.select()`/`.single()` dopo l'insert, senza modificarli.

## Compatibilità già rilevata
Gli inserimenti individuati in `src/` non concatenano `.select()` o `.single()`; la verifica finale verrà ripetuta prima della consegna.

## Perimetro
Nessuna modifica all'interfaccia, alle RLS esistenti di `notifiche`, alla funzione `invia_push_da_notifica`, al trigger `trg_invia_push_da_notifica` o ad altre funzioni.
