# FM85 — Fetta B

## Implementazione
- Job `cerved-recupero-report-orario`, nome «Cerved — recupero orario report in attesa», cron `0 * * * *` (ogni ora).
- Elenco paginato stabile degli ID in attesa, un report per step; rilegge lo stato prima del recupero. Nessuna chiamata di acquisto. Errori isolati per report.
- La RPC `blocca_report_cerved_e_notifica(uuid, app_role[])` esegue transizione condizionale dopo oltre 48 ore e notifiche nella stessa transazione: un errore annulla entrambe e un secondo passaggio non duplica avvisi.
- Ruoli destinatari forniti dalla costante canonica `RUOLI_AGGIORNANO_CERVED`, verificata contro `auth_puo_aggiornare_cerved`; solo profili attivi, destinatari distinti. Trigger di raggruppamento/push invariati.
- Recupero manuale `riprovaReportCerved`: autenticazione, permesso Cerved e report leggibile con RLS prima della delega. Anche bloccati, senza acquisto.
- Impostazioni: amministratori conservano le sezioni precedenti; altri autorizzati Cerved accedono solo al nuovo elenco, senza lettura sedi. Logo invariato.

## File
- `src/lib/inngest/functions.server.ts`
- `src/routes/api/public/inngest.ts`
- `src/lib/cerved/cerved-attesa.server.ts`
- `src/lib/cerved/cerved-attesa.functions.ts`
- `src/components/impostazioni/report-cerved-attesa-card.tsx`
- `src/routes/_app/impostazioni.tsx`
- `src/components/app-shell.tsx`
- `src/lib/cerved/AGENTS.md`
- `tests/cerved-attesa.test.ts`
- `drizzle/migrations/0247_cerved_blocco_report_notifica.sql` (applicata; metadati e tipi generati).
- Questo rapporto, `fm85b-catalogo-notifica.sql` e `roadmap.md`.

## Verifiche e limiti
- Suite Bun: 1042 pass, 0 fail; 9 nuovi test job/permesso.
- Corpo della RPC applicata verificato, EXECUTE solo service_role (authenticated escluso).
- I.CO.MA. ancora in attesa nel dato reale; nessun acquisto o recupero live eseguito.
- Browser con dati/permessi/recupero simulati: 320, 375, 390, 768, 1280, 1920, nessun overflow e pulsanti almeno 44px; dopo recupero elenco riletto e stato vuoto.
- Sessione del proprietario non disponibile (`auth-session --self` non trova account): accesso reale e consegna Cerved non verificati. Non è stato utilizzato un account altrui.
- Ricontrollo dal percorso effettivo `/impostazioni`, con autenticazione/dati/rete simulati: amministratore e recupero_crediti, 375/1280 px, entrambi i report, entrambi i recuperi con rilettura e elenco vuoto. Entrambi i link aprono `/clienti/<id>?tab=cerved`, tab Cerved selezionato, ritorno all'elenco riuscito; store_manager non vede la card. Nessuna modifica app necessaria.
- Controllata anche la classe `.dark`: la card resta uguale, perché l'app attuale non definisce un secondo insieme di colori scuri né un selettore di tema. Le foto etichettate dark verificano la classe, non un tema scuro effettivamente disponibile. Avvisi di hydration degli attributi derivano dalla sessione simulata solo nel browser; zero errori runtime al termine delle prove corrette.

## Attivazione
- Pubblicare e risincronizzare Inngest per registrare il nuovo cron.
- Il proprietario esegue `docs/verifiche/fm85b-catalogo-notifica.sql` per registrare il tipo `cerved_report_bloccato` nel catalogo (dato separato dalla struttura). Finché manca, il trigger esistente usa già il fallback raggruppato per tipo; non vengono aggiunte push alternative.
- Nuova fonte atomica documentata nella AGENTS Cerved; root AGENTS già al limite di dimensione e lasciata invariata. Il proprietario può recepire la regola in `docs/regole/notifiche.md`.