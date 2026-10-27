# Notifiche: meno notifiche, più leggibili

Estratto dal knowledge di progetto il 08/10/2026 (sessione 40). Si aggiorna modificando questo file.

## 9. Notifiche: meno notifiche, più leggibili

Quando arrivano in blocco, le notifiche si raggruppano; mai una notifica (e una push) per ogni singolo elemento.
- Il raggruppamento vive in UN solo punto: trigger DB `a_raggruppa_notifica` → `raggruppa_notifica()` (BEFORE INSERT su `notifiche`): se esiste una notifica non letta dello stesso gruppo viene aggiornata (`conteggio`+1, `aggiornata_at`) e l'insert annullato. La prima di un gruppo resta singola. Sulla crescita di un gruppo parte al massimo UNA push per ondata (`trg_invia_push_crescita_gruppo`): non aggiungere altre push.
- Regole per tipo nel catalogo `notifiche_tipi`; un nuovo tipo va registrato lì (default: raggruppa per tipo).
- Chi crea notifiche: metadata con la chiave di gruppo (es. `store_id` + `gruppo_etichetta`) e `SELECT DISTINCT user_id`. Non contare sulla riga restituita dall'insert.
- UI: ordina per `aggiornata_at`, mostra `conteggio`, `NotificaRiga`, `contaNonLette` (mai contare solo le righe caricate); a ogni lettura `chiudiAvvisiNotifiche`/`chiudiTuttiGliAvvisi`. Nessun toast sugli aggiornamenti di gruppo.
- Esito import: ogni import si chiude SOLO con `chiudiImportazione` (`functions.server.ts`), che scrive la riga e lancia l'evento `import/esito.notifica`; il job `notificaEsitoImport` manda notifica (`esito_import`, non raggruppato) ed email a chi l'ha lanciato. Problema vero = `importazioni.problemi` nello stesso update di `completata_at`. Testo solo in `src/lib/esito-import-messaggio.ts`.
- Iscrizione WhatsApp (`iscrizione_whatsapp`, non raggruppato): prodotta da `iscriviWhatsapp` (solo pagina pubblica QR/link; iscrizione eventi esclusa), destinatari dalla chiave `configurazioni.notifica_iscrizioni_whatsapp_destinatari` (id utente separati da virgola, solo profili attivi); link `/marketing/iscritti-whatsapp?q={numero}`.

## Nota di recupero crediti (`nota_recupero`)
- Ogni nuova azione di recupero di tipo "nota" notifica: tutti gli utenti attivi con ruolo `recupero_crediti` e gli `store_manager` attivi del negozio del cliente (`profili.store_id = clienti.store_id`, tutti se più di uno). Mai l'autore; ogni destinatario una sola volta.
- Fonte unica: trigger `trg_notifica_nota_recupero` → `public.notifica_nota_recupero()`; un errore della notifica non blocca mai il salvataggio della nota.
- Raggruppate per cliente (`chiave_metadata = cliente_id`), titolo di gruppo "{n} nuove note di recupero — {cliente}"; link alla scheda cliente, tab Attività.

## Avvisi legale nel flusso delle variazioni di blocco (FM48)

- Ingresso e uscita dalla gestione legale si avvisano come blocco/sblocco: stesso job `clienti-variazioni-blocco-notifica` (`src/lib/inngest/variazioni-blocco.server.ts`), stessi destinatari (store manager del negozio e agenti del cliente, mai l'autore dell'import), stessa modalità test `variazioni_blocco_email_test`, stesso link `/clienti-variazioni-blocco`.
- Tipi `in_legale` / `uscito_legale` in `clienti_blocco_variazioni`; messaggio "N in legale", "N usciti dal legale" (solo se > 0); titolo e oggetto "Variazioni blocco e legale clienti — {negozio}"; nella mail le sezioni "Entrati in gestione legale" e "Usciti dalla gestione legale", solo se non vuote.
- Origine: il trigger `registra_variazione_legale()` scrive solo la riga in `clienti_blocco_variazioni`. Dopo ogni operazione sulle pratiche legali o sulla nota Gamma la scheda cliente chiama la server function `avvisaVariazioniLegale` (`src/lib/legale.functions.ts`), che, solo se ci sono righe legali non notificate, emette `clienti/legale.variazioni.differita` (via `sendInngestEvent`, mai `step.sendEvent`).
- **Regola (FM50): variazioni fatte dall'app → avviso dopo 5 minuti di quiete, una email/notifica per negozio.** La funzione `clienti-legale-variazioni-differita` (`src/lib/inngest/legale-variazioni-differita.server.ts`) ha debounce Inngest `period 5m`, `timeout 15m`, senza chiave (raggruppa tutte le modifiche dell'app); quando scatta emette una sola volta `clienti/blocco.variazioni.rileva` con `importazioneId: null`. Il job esistente raggruppa per negozio. Mai emettere `clienti/blocco.variazioni.rileva` direttamente dall'app.
- L'import blocco fido emette invece `clienti/blocco.variazioni.rileva` subito a fine giro (avviso immediato, invariato).

## Richieste interne: bonifico di acconto (FM48)

- Fonte unica: job `inviaEmailRichiesta` (`src/lib/inngest/richieste-email.server.ts`) con `buildRichiestaEmail`/`EVENT_CFG` (`src/lib/richieste-email-render.ts`). Eventi `richieste/notifica` solo con `sendInngestEvent`.
- `bonifico_da_eseguire` → ruolo `tesoreria` (email + notifica). Lo accoda il job stesso (step `accoda-bonifico`) dopo `resp_approved` o `dir_approved`, se la richiesta ha `acconto_richiesto`, `acconto_stato = 'da_eseguire'` e status `resp_approved`/`approved`. Mai su rifiuti né su `resp_forwarded`. Lo step gira anche quando l'evento principale non ha destinatari.
- `bonifico_promemoria` → ruolo `tesoreria`. Funzione Inngest `richieste-bonifico-promemoria`, cron `TZ=Europe/Rome 0 8 * * *`: richieste con bonifico da eseguire, data prevista ≤ oggi (Roma) e `acconto_promemoria_at` NULL; un solo promemoria per richiesta.
- `bonifico_eseguito` → richiedente (email + notifica). Lo accoda `segnaBonificoEseguito` (`src/lib/richieste-bonifico.functions.ts`) dopo la RPC `registra_bonifico_acconto`.
- Tipi notifica (non raggruppati): `richiesta_interna_bonifico_da_eseguire`, `richiesta_interna_bonifico_promemoria`, `richiesta_interna_bonifico_eseguito`.
- **Dopo la pubblicazione serve il resync di Inngest** perché il nuovo cron venga registrato.
