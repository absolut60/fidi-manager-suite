# Notifiche: meno notifiche, più leggibili

Estratto dal knowledge di progetto il 08/10/2026 (sessione 40). Si aggiorna modificando questo file.

## 9. Notifiche: meno notifiche, più leggibili

Quando arrivano in blocco, le notifiche si raggruppano; mai una notifica (e una push) per ogni singolo elemento.
- Il raggruppamento vive in UN solo punto: trigger DB `a_raggruppa_notifica` → `raggruppa_notifica()` (BEFORE INSERT su `notifiche`): se esiste una notifica non letta dello stesso gruppo viene aggiornata (`conteggio`+1, `aggiornata_at`) e l'insert annullato. La prima di un gruppo resta singola. Sulla crescita di un gruppo parte al massimo UNA push per ondata (`trg_invia_push_crescita_gruppo`): non aggiungere altre push.
- Regole per tipo nel catalogo `notifiche_tipi`; un nuovo tipo va registrato lì (default: raggruppa per tipo).
- Chi crea notifiche: metadata con la chiave di gruppo (es. `store_id` + `gruppo_etichetta`) e `SELECT DISTINCT user_id`. Non contare sulla riga restituita dall'insert.
- UI: ordina per `aggiornata_at`, mostra `conteggio`, `NotificaRiga`, `contaNonLette` (mai contare solo le righe caricate); a ogni lettura `chiudiAvvisiNotifiche`/`chiudiTuttiGliAvvisi`. Nessun toast sugli aggiornamenti di gruppo.
- Esito import: ogni import si chiude SOLO con `chiudiImportazione` (`functions.server.ts`), che scrive la riga e lancia l'evento `import/esito.notifica`; il job `notificaEsitoImport` manda notifica (`esito_import`, non raggruppato) ed email a chi l'ha lanciato. Problema vero = `importazioni.problemi` nello stesso update di `completata_at`. Testo solo in `src/lib/esito-import-messaggio.ts`.

## Nota di recupero crediti (`nota_recupero`)
- Ogni nuova azione di recupero di tipo "nota" notifica: tutti gli utenti attivi con ruolo `recupero_crediti` e gli `store_manager` attivi del negozio del cliente (`profili.store_id = clienti.store_id`, tutti se più di uno). Mai l'autore; ogni destinatario una sola volta.
- Fonte unica: trigger `trg_notifica_nota_recupero` → `public.notifica_nota_recupero()`; un errore della notifica non blocca mai il salvataggio della nota.
- Raggruppate per cliente (`chiave_metadata = cliente_id`), titolo di gruppo "{n} nuove note di recupero — {cliente}"; link alla scheda cliente, tab Attività.
