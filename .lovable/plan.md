# STRATO 0 — Schema base modulo LEAD (solo database)

## Diagnosi (verificata sul database reale)

- Enum esistenti: `app_role`, `esito_approvazione`, `stato_importazione`, `stato_messaggio_wa`, `stato_polizza`, `stato_pratica_legale`, `stato_richiesta`, `stato_sollecito`, `tipo_pratica_legale`, `tipo_reminder`, `tipo_richiesta`, `tipo_sollecito`, `tipo_variazione_fido`. **Nessuno dei 6 enum lead esiste**, nemmeno con nome diverso/equivalente.
- Tabelle `stores`, `clienti`, `contatti`, `cantieri` esistono tutte in `public`.
- **Nessuna tabella con "lead" nel nome** esiste: nessun conflitto su `lead`, `lead_richieste`, `lead_storico`.
- **Nessuna colonna `lead_id`** presente oggi su `contatti` o `cantieri`: nessun conflitto.
- Funzione trigger riutilizzabile: `public.update_updated_at()` (già con `search_path` fissato). Verrà riusata, non ricreata.
- `public.has_role(uuid, app_role)` esiste (SECURITY DEFINER, stable): sarà l'unico gancio dei permessi lead. `user_can_access_cliente` **non verrà toccata**.

Nessun conflitto rilevato: il piano è interamente additivo.

## Cosa verrà creato (una sola migrazione, dopo conferma)

1. **6 enum nuovi**: `lead_stato`, `lead_tipo`, `lead_fonte`, `lead_priorita`, `lead_richiesta_tipo`, `lead_richiesta_stato` — con esattamente i valori indicati.

2. **Tabella `lead`** con tutti i campi richiesti (anagrafica parziale ammessa, nessun vincolo DB su nome/ragione sociale), FK `store_id → stores(id)` e `cliente_id → clienti(id)`, default `fonte='manuale'`, `stato='nuovo'`, `tipo_lead='potenziale_cliente'`, `priorita='media'`.
   - Indici su `stato`, `fonte`, `assegnato_a`, `cliente_id`; indice UNIQUE parziale su `hubspot_id` dove non nullo.
   - Trigger `BEFORE UPDATE` su `update_updated_at()`.

3. **Tabella `lead_richieste`** con `lead_id` NOT NULL → `lead(id) ON DELETE CASCADE`, `tipo` obbligatorio, `stato` default `'aperta'`, indice su `lead_id`, trigger updated_at.

4. **Tabella `lead_storico`** append-only: `lead_id` NOT NULL cascade, `stato_da`, `stato_a`, `operatore_id`, `nota`, `created_at`. Indice su `lead_id`. Nessun `updated_at`, nessun trigger.

5. **Colonne additive nullable**: `contatti.lead_id` e `cantieri.lead_id`, entrambe FK verso `lead(id)` (ON DELETE SET NULL), con indice. Le policy di `contatti` e `cantieri` **restano invariate**.

6. **Permessi e RLS (pattern isolato)**
   - GRANT `SELECT, INSERT, UPDATE, DELETE` a `authenticated` su `lead` e `lead_richieste`; su `lead_storico` solo `SELECT, INSERT`. `GRANT ALL` a `service_role` su tutte e tre. Nessun accesso `anon`.
   - RLS abilitata su tutte e tre. Predicato unico e isolato, valutato su `has_role`: amministratore, amministrazione, direzione, marketing.
   - `lead` e `lead_richieste`: lettura, creazione, modifica ed eliminazione consentite a quei quattro ruoli.
   - `lead_storico`: lettura e creazione consentite a quei quattro ruoli; **nessuna policy di modifica o cancellazione** (tabella immutabile, come `consensi_log`).

## Note tecniche

- Per evitare la ripetizione del predicato, valuto se introdurre una funzione helper dedicata `public.can_access_lead(uuid)` (SECURITY DEFINER, `search_path=public`) usata solo dalle policy lead. Resta comunque isolata: non ha alcun legame con `user_can_access_cliente` né con le policy clienti/contatti esistenti. In alternativa, se preferisci zero funzioni nuove, scrivo il predicato `has_role(...) OR ...` inline in ogni policy — dimmelo e adeguo.
- Nessuna colonna esistente viene alterata, nessun NOT NULL aggiunto a tabelle esistenti, nessuna UI o file React toccato in questo strato.

Confermi e procedo con la migrazione.
