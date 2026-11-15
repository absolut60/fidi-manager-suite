# FM76 — Branding email per sede, fetta 2

## Fonti e non regressione

`brandingSede` resta la fonte dei percorsi. `branding-email.ts` scarica il PNG per l'invio oppure firma il percorso per l'anteprima browser. La composizione della sede resta quella precedente: non si applicano i fallback ai singoli campi del piede email, per non cambiare HTML e contatti.

- `wrapEmailHtml`: cambia soltanto `src` in anteprima quando `DatiSede.logoEmailUrl` è valorizzato. In invio resta `cid:logoMade`.
- `send-email/inline-logo.ts`: il payload opzionale `inlineLogoBase64` sostituisce solo il contenuto del CID, solo con `inlineLogo=true`. Nome file, MIME, CID e disposizione restano invariati.
- Download server mediante client privilegiato; nell'invio singolo è caricato dopo la guardia recupero e la lettura cliente/sede con RLS. Nessun URL arbitrario dal browser.
- Errore download, PNG non valido o oltre 1 MB: log generico e ripiego MADE, senza interrompere l'invio. Firma browser negata: ripiego silenzioso.
- Archivio con logo personalizzato: `logoEmailUrl` contiene un data URL degli stessi byte PNG, così resta leggibile nel bucket privato senza firme scadute. Senza logo restano esattamente gli HTML precedenti, compreso il CID archiviato dal massivo.
- FROM_NAME, Reply-To, template, bande, box, coordinate e piede riservatezza invariati. `buildEmailTemplate` non modificato.

## Ricognizione completa: chiamanti `wrapEmailHtml`

| Chiamante | Classificazione / scelta |
| --- | --- |
| `email-recupero.functions.ts` (invio e htmlSalvato) | Cliente con sede: collegato |
| `inngest/sollecito-massivo.server.ts` | Cliente con sede: collegato, incluso promemoria manuale massivo |
| `promemoria-scadenza-render.ts` | Cliente con sede: eredita il logo fornito dal job automatico |
| `campagna-marketing-email.ts` | Cliente con sede: eredita dal job; senza cliente/sede resta MADE |
| `invia-email-recupero-dialog.tsx` (modello e libera) | Cliente con sede: firma tramite `caricaSedeCliente` |
| `invio-massivo-dialog.tsx` | Cliente corrente con sede: stessa firma condivisa |
| `routes/_app/template-email.tsx` | Cliente selezionato con sede: stessa firma condivisa |
| `comunicazioni-fornitore.functions.ts` | Fornitore, non cliente: MADE |
| `inngest/invio-fornitori.server.ts` | Fornitori massivi: MADE |
| `variazioni-blocco-email-render.ts` | Notifica interna ai negozi: MADE |
| `richieste-email-render.ts` | Richieste interne ai collaboratori: MADE |
| `mail-sinistro-dialog.tsx` (anteprima e invio) | Assicurazione crediti verso assicuratore, non cliente: MADE |

## Invii con `inlineLogo=true`

Collegati: `email-recupero.functions.ts`, `sollecito-massivo.server.ts`, `promemoria-scadenza.server.ts`, `campagna-marketing.server.ts` (solo destinatario con cliente e sede).

Restano MADE: `comunicazioni-fornitore.functions.ts`, `invio-fornitori.server.ts` (fornitori); `variazioni-blocco.server.ts`, `richieste-email.server.ts` (interni); `mail-sinistro-dialog.tsx` via `sendEmailDetailed` (assicuratore).

Gli altri invii non richiedono il CID e restano invariati: `firma-privacy.functions.ts`, `firma-privacy-finalizza.server.ts`, `consensi-marketing.functions.ts`, `iscrizione-whatsapp.functions.ts`, `recesso-consensi.functions.ts`, `sendPrivacyPdf` (documenti/privacy/consensi); `comunicazioni-richiesta.functions.ts`, `esito-import.server.ts`, `email-health.server.ts`, `piano-rientro-reminder.server.ts` e test SMTP nelle impostazioni (generici/interni). Privacy, inviti e notifiche basati su `buildEmailTemplate` esclusi dall'intervento.

Anteprima campagne in `marketing.campagne.tsx`: dati di esempio, `sede:null`, non un cliente selezionato; resta MADE. Anteprima impostazioni promemoria: nessun cliente/sede, resta MADE.

## Letture e verifiche

- Tre invii con lettura `stores` esistente: aggiunto solo `logo_email_path`. Anteprime: stessa lettura sede condivisa, una firma se esiste il percorso.
- Promemoria automatico: la RPC esistente non espone il percorso; una lettura batch `id, logo_email_path` per le sedi coinvolte, un download per sede, senza modificare RPC o aggiungere query per scadenza.
- Nessuna migrazione, nessun aggiornamento di dati o policy, bucket ancora privato.
- 964 test verdi (130 file): otto nuovi test, 12 impronte HTML precedenti verificate con quattro varianti del fallback, download/firma riusciti e falliti, contenuto CID, archivio e compositori condivisi.
- Cornici con dati di prova controllate tramite Playwright a 375 e 1280 px: immagini caricate e impaginazione invariata. Non è una prova autenticata delle finestre complete.
- Dato reale: 10 sedi, zero `logo_email_path` valorizzati. Sessione personale non disponibile (`--self` non trova l'account); nessuna email reale inviata. Da collaudare firma/download con un logo reale e invio SMTP autorizzato.

## File modificati

`src/lib/branding-email.ts` (nuovo), `branding-sede.ts`, `template-email-render.ts`, `template-email.ts`, `send-email.ts`, `email-recupero.functions.ts`; `src/lib/inngest/send-email.server.ts`, `sollecito-massivo.server.ts`, `promemoria-scadenza.server.ts`, `campagna-marketing.server.ts`; `supabase/functions/send-email/index.ts`, `inline-logo.ts` (nuovo); `tests/branding-email.test.ts` (nuovo); questo documento, `docs/regole/fonti-uniche.md`, `src/lib/AGENTS.md`, `roadmap.md`.