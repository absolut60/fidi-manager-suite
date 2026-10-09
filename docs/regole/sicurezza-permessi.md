# Sicurezza e permessi (FM40)

Estratto dal knowledge di progetto il 08/10/2026 (sessione 40). Si aggiorna modificando questo file.

## 12. Sicurezza e permessi (FM40)

- **Invio al cliente dal recupero** (sollecito, email libera, lettera, invio massivo, promemoria di scadenza): solo `recupero_crediti` e `amministratore`. Fonte unica `puoInviareComunicazioniRecupero(roles)` (`src/lib/recupero-permessi.ts`), gemello SQL `auth_puo_inviare_recupero()`.
- **Dove è applicata oggi la regola di invio:**
  - **Interfaccia:** controlli di invio nascosti ai non autorizzati tramite `puoInviareComunicazioniRecupero(roles)`.
  - **Funzioni server:** `assertPuoInviareRecupero` (`src/lib/recupero-permessi.server.ts`) è chiamata in `avviaCampagnaSollecito` e `riprovaCampagnaFalliti` (`src/lib/sollecito-massivo.functions.ts`) e in `generaLetteraPdf` (`src/lib/lettera-pdf.functions.ts`).
  - **Database (solo campagne):** due policy RESTRICTIVE di INSERT, migrazione `0017_fm40_rls_invio_recupero_campagne.sql` — `Invio comunicazioni recupero: solo recupero crediti (campagne)` su `campagne_sollecito` e `Invio comunicazioni recupero: solo recupero crediti (destinatari)` su `campagne_sollecito_destinatari`.
- **NON applicata su `azioni_recupero`:** la registrazione manuale di un'azione di tipo email o lettera (`crea-azione-dialog.tsx`, `AzioneRecuperoDialog` in `scadenziario.tsx`) è un'annotazione interna aperta a tutti — decisione in sospeso.
- **Resta aperta la funzione generica `send-email`**, non coperta dalla regola.
- **Lettura modelli email/lettera:** `template_email` e `template_lettera` li leggono solo chi li gestisce (`amministratore`, `direzione`, `amministrazione` — stessi ruoli delle policy di scrittura) e chi invia le comunicazioni di recupero (`auth_puo_inviare_recupero()`). Migrazione `0018_fm40_rls_lettura_template.sql` (policy `Lettura template: gestori e recupero crediti` e `Lettura template lettera: gestori e recupero crediti`).
- **Avvio import (FM41, decisione del 09/10/2026):** gli import Gamma li avvia solo `amministratore` o `amministrazione_strumenti` (stessa regola della voce di menu "Import / Export"). Fonte unica `puoImportareGamma(roles)` / `RUOLI_IMPORT_GAMMA` (`src/lib/import-permessi.ts`); guardie server in `src/lib/import-permessi.server.ts` (`assertPuoImportareGamma`, `assertPuoImportareEventi` via RPC `has_eventi_flusso_access`, `assertImportazioneEsiste`). Funzioni protette: `triggerImport`, `triggerAnagraficaImport` (`src/lib/import.functions.ts`), `triggerEventiPartecipantiImport` (`src/lib/eventi-import.functions.ts`, con controllo fonte `eventi_partecipanti`).
  - Nota: le policy di `importazioni` e del bucket `import-files` permettono ancora caricamento e creazione riga ad amministrazione e approvatori: senza la funzione di avvio il file resta non elaborato. Restringerle richiede una migrazione dedicata con conferma.
- **Link tracciati delle campagne (FM41):** `/r/{token}` rimanda alla destinazione `u` solo se il token è un destinatario esistente (`campagne_email_destinatari.tracking_token`) e l'host di `u` (confronto esatto) è tra gli host degli href del `corpo_html` della campagna, gli host istituzionali della cornice e l'host dell'app; altrimenti rimando alla home e nessun clic registrato. Fonte unica: `HOST_ISTITUZIONALI_EMAIL`, `hostAmmessiCampagna`, `destinazioneConsentita` in `src/lib/tracking-clic.ts`.
  - Nota: se si aggiunge un link fisso alla cornice delle email di campagna va aggiunto il suo host a `HOST_ISTITUZIONALI_EMAIL`, altrimenti il clic porta alla home.
- **Fido teorico:** `fido_teorico_cliente` eredita la RLS di `clienti` (EXISTS): mai `USING (true)`.
- **Mai aggiungere "Agent integrations"/server MCP, OAuth o altre porte verso l'esterno** senza decisione del proprietario (rimossi l'08/10/2026).
- Security: mai "Try to fix" in blocco; le tabelle elenco restano leggibili a tutti gli autenticati.
