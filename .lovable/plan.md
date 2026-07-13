# Chiusura vulnerabilità edge function `send-email`

## A) Censimento chiamanti

### Server-side (fetch diretto `/functions/v1/send-email` con SERVICE_ROLE)
1. `src/lib/inngest/send-email.server.ts` — helper condiviso `sendEmailViaEdge`. Usato da:
   - `src/lib/inngest/promemoria-scadenza.server.ts` (job promemoria scadenza)
   - `src/lib/inngest/piano-rientro-reminder.server.ts` (reminder rate piano)
2. `src/lib/inngest/sollecito-massivo.server.ts` — **duplica** localmente `sendEmailViaEdge` (stessa logica, va allineato).

Identità: `SUPABASE_SERVICE_ROLE_KEY` (con fallback improprio a ANON — vedi punto D).

### Server-side (server function, `supabaseAdmin.functions.invoke`)
3. `src/lib/utenti.functions.ts` (`inviaCredenzialiUtente`) — invio credenziali nuovo utente. Gira in server function autenticata, invoca con service role (via `supabaseAdmin`).

### Client-side (browser, `supabase.functions.invoke` con JWT utente)
4. `src/lib/send-email.ts` — wrapper `sendEmail` + helper `sendPrivacyPdf`, `sendNotificaComunicazione`. Chiamanti UI:
   - `src/routes/_app/impostazioni.tsx` (email di test)
   - `src/routes/_app/clienti.$clienteId.tsx` (invio PDF privacy)
   - `src/components/email-libera-dialog.tsx` (email libera dai dialog)
   - `src/components/invia-sollecito-dialog.tsx` (sollecito singolo)
   - `src/components/nuovo-contatto-wizard.tsx` (PDF privacy dopo firma)
   - `src/lib/comunicazioni-richiesta.ts` → `sendNotificaComunicazione` (notifica messaggi richiesta fido)

Identità in tutti i casi client: `supabase.functions.invoke` aggiunge automaticamente `Authorization: Bearer <access_token>` della sessione utente (JWT `role: authenticated`). Se non c'è sessione, ricade sull'anon key (`role: anon`) — è esattamente il caso da bloccare.

## B) Schema autorizzazione a doppio binario nella edge

Nel `serve()` di `supabase/functions/send-email/index.ts`, PRIMA di leggere il payload:

1. **Ramo SERVER** — header `x-internal-secret` presente e `timingSafeEqual` con `Deno.env.get("INTERNAL_EMAIL_SECRET")`. Se combacia → autorizzato, salta ogni altro check.
2. **Ramo UTENTE** — se non c'è il secret:
   - Leggere `Authorization: Bearer <token>`. Se assente → 401.
   - Creare client Supabase con quel token, chiamare `auth.getUser(token)`.
   - Se `user` mancante o `user.role !== 'authenticated'` (rifiuta anon key, che ha `role: 'anon'` nel JWT decodificato) → 401.
   - Interrogare `user_roles` per `user.id` e verificare che contenga almeno uno tra: `amministratore`, `amministrazione`, `direzione`, `approvatore`. (Da confermare: `store_manager` per solleciti — vedi domanda aperta.)
   - Altrimenti → 403.
3. Qualsiasi altro esito → 401.

Nuovi secret Supabase: `INTERNAL_EMAIL_SECRET` (random 32+ char, generato via `generate_secret`, mai esposto al frontend).

## C) CORS ristretto

- Sostituire `Access-Control-Allow-Origin: *` con echo dell'origin quando compreso in una allowlist derivata da `Deno.env.get("APP_URL")` (+ eventuali URL preview/published). Fallback: primo valore allowlist.
- Aggiungere `x-internal-secret` a `Access-Control-Allow-Headers`.
- OPTIONS resta 204 con gli stessi header.
- Nuovo secret: `APP_URL` (valore = published URL principale; opzionalmente lista separata da virgola per includere preview).

## D) Fix effetto collaterale `sendEmailViaEdge`

Oggi: `const KEY = SERVICE_ROLE ?? ANON ?? ""` — se manca la service role, cade sull'anon (che dopo il fix non passerebbe più).

Interventi:
- `src/lib/inngest/send-email.server.ts`: rimuovere fallback ad ANON. Richiedere `SUPABASE_SERVICE_ROLE_KEY` **e** `INTERNAL_EMAIL_SECRET`; se manca uno dei due → `throw` esplicito ("Configurazione email server incompleta: manca X"). Aggiungere header `x-internal-secret: <INTERNAL_EMAIL_SECRET>` alla fetch. Continuare a inviare `Authorization: Bearer <service_role>` (per superare il gateway della edge function, che pretende un JWT valido — l'autorizzazione applicativa la fa il secret).
- `src/lib/inngest/sollecito-massivo.server.ts`: eliminare la copia locale e riusare `sendEmailViaEdge` dall'helper condiviso (o allineare identica logica: secret + no fallback anon).
- `src/lib/utenti.functions.ts`: `supabaseAdmin.functions.invoke` usa il service role JWT come Authorization, ma NON aggiunge header custom → aggiungere `headers: { "x-internal-secret": process.env.INTERNAL_EMAIL_SECRET! }` all'invoke, oppure passare al fetch diretto via `sendEmailViaEdge`. Preferibile la seconda per uniformità.

## File toccati (riepilogo)

- `supabase/functions/send-email/index.ts` — auth dual-track + CORS ristretto
- `src/lib/inngest/send-email.server.ts` — richiede service role + secret, header interno, no fallback anon
- `src/lib/inngest/sollecito-massivo.server.ts` — usa l'helper condiviso
- `src/lib/utenti.functions.ts` — passa dal fetch server con secret
- Nessuna modifica ai file client (`src/lib/send-email.ts` e chiamanti): `supabase.functions.invoke` già inoltra il JWT dell'utente loggato — sufficiente per il ramo UTENTE. **Precondizione**: tutti i chiamanti client sono dentro pagine autenticate (`_app/*`) — confermato dal censimento.

## Nuovi secret

- `INTERNAL_EMAIL_SECRET` (Supabase Function Secret, generato random) — NON esporre al frontend.
- `APP_URL` (Supabase Function Secret) — allowlist CORS.

## Punti di rischio / flussi da testare dopo il rollout

1. Job Inngest promemoria scadenza / reminder piani / sollecito massivo → verificare che i secret siano presenti in prod prima del deploy (senza li i job falliscono in modo esplicito, non silente).
2. `inviaCredenzialiUtente` (creazione nuovo utente) → dopo il refactor deve continuare a funzionare.
3. Invio PDF privacy dal wizard nuovo contatto e da scheda cliente → richiede utente loggato (già garantito).
4. Email di test dalle Impostazioni.
5. Notifica comunicazioni richieste fido: eseguita in reazione a un'azione utente autenticato → OK. Verificare che non venga invocata da trigger/webhook senza sessione.
6. Ruolo `store_manager` per invio solleciti singoli dal dialog: **domanda aperta**, da chiarire prima dell'implementazione (se lo escludi, un capo-sede perde la possibilità di inviare solleciti dal frontend).

## Domande aperte prima dell'implementazione

- Ruoli abilitati al ramo UTENTE: confermi `amministratore`, `amministrazione`, `direzione`, `approvatore`? Includiamo `store_manager` (per solleciti)? E `agente`?
- `APP_URL` per CORS: solo il published `https://fidi-manager-suite.lovable.app`, o anche preview/custom domain futuri (allowlist multipla)?
