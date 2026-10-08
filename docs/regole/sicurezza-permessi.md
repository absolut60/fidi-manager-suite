# Sicurezza e permessi (FM40)

Estratto dal knowledge di progetto il 08/10/2026 (sessione 40). Si aggiorna modificando questo file.

## 12. Sicurezza e permessi (FM40)

- **Invio al cliente dal recupero** (sollecito, email libera, lettera, invio massivo, promemoria di scadenza): solo `recupero_crediti` e `amministratore`. Fonte unica `puoInviareComunicazioniRecupero(roles)` (`src/lib/recupero-permessi.ts`), gemello SQL `auth_puo_inviare_recupero()`.
- **Fido teorico:** `fido_teorico_cliente` eredita la RLS di `clienti` (EXISTS): mai `USING (true)`.
- **Mai aggiungere "Agent integrations"/server MCP, OAuth o altre porte verso l'esterno** senza decisione del proprietario (rimossi l'08/10/2026).
- Security: mai "Try to fix" in blocco; le tabelle elenco restano leggibili a tutti gli autenticati.
