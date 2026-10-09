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
- **Fido teorico:** `fido_teorico_cliente` eredita la RLS di `clienti` (EXISTS): mai `USING (true)`.
- **Mai aggiungere "Agent integrations"/server MCP, OAuth o altre porte verso l'esterno** senza decisione del proprietario (rimossi l'08/10/2026).
- Security: mai "Try to fix" in blocco; le tabelle elenco restano leggibili a tutti gli autenticati.
