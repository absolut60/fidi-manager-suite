# Correzione Strato 1 — contatti/cantieri propri del lead

## Diagnosi (sola lettura, già eseguita)

**1. Dati esistenti**

| tabella | righe totali | righe con cliente_id NULL |
|---|---|---|
| contatti | 7 | 0 |
| cantieri | 0 | 0 |
| lead | 0 | — |

Nessun dato da bonificare: la migrazione è sicura e il CHECK constraint passa subito su tutte le righe attuali.

**2. Trigger e funzioni**

- `contatti`: due trigger — `contatti_updated_at` (`update_updated_at`, indifferente a cliente_id) e `trg_ricalcola_privacy_cliente` (`ricalcola_privacy_cliente`).
- `cantieri`: solo `trg_cantieri_updated_at`, indifferente a cliente_id.
- `fn_normalizza_contatti` **non è un trigger di `contatti`**: usa `NEW.id` come `cliente_id` e `NEW.ragione_sociale`, quindi è agganciata a `clienti`. Nessun impatto.

`ricalcola_privacy_cliente` fa:
```
_cliente_id := COALESCE(NEW.cliente_id, OLD.cliente_id);
SELECT EXISTS(... FROM contatti WHERE cliente_id = _cliente_id AND privacy_firmata) INTO _ha_firmato;
UPDATE clienti SET privacy_firmata = _ha_firmato WHERE id = _cliente_id;
```
Con cliente_id NULL **non va in errore**: `cliente_id = NULL` è NULL → EXISTS false, e `WHERE id = NULL` aggiorna 0 righe. È però lavoro inutile a ogni scrittura di contatto-lead, e resta fragile. Va aggiunta una guardia `IF _cliente_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;` (punto non presente nel tuo piano).

**3. RLS attuale**

`contatti`
- SELECT: `user_can_access_cliente(cliente_id) OR has_role(marketing)`
- INSERT (check): `user_can_write_cliente(cliente_id) OR (agente AND user_can_access_cliente(cliente_id)) OR (marketing AND cliente_id IS NOT NULL)`
- UPDATE (using): `user_can_write_cliente(...) OR (agente AND ...) OR has_role(marketing)`; check come l'insert
- DELETE: solo `amministratore`

`cantieri`
- SELECT: **non usa** `user_can_access_cliente`, ma una sottoquery inline `cliente_id IN (SELECT ... FROM clienti ...)`
- INSERT/UPDATE: `user_can_write_cliente(cliente_id)`
- DELETE: solo `amministratore`

Conferma del punto delicato che sollevavi: sia `user_can_access_cliente` sia `user_can_write_cliente` iniziano con `_cliente_id IS NOT NULL AND (...)`, quindi con NULL restituiscono **false** (non NULL). Anche la sottoquery inline di `cantieri` con NULL non matcha nulla. Quindi oggi una riga con `cliente_id IS NULL` sarebbe **invisibile e non scrivibile da chiunque**, tranne il caso `has_role(marketing)` in SELECT/UPDATE-using di `contatti` che è incondizionato.

Due conseguenze non coperte dal tuo punto B:
- Il ramo marketing in INSERT/UPDATE-check di `contatti` ha `cliente_id IS NOT NULL`, che **bloccherebbe** un utente marketing nell'inserire contatti di lead. Va esteso.
- Il DELETE su entrambe è solo amministratore: chi gestisce i lead non potrebbe cancellare un contatto/cantiere di lead che ha appena creato. Propongo di estenderlo alle sole righe lead-only.

## Piano da applicare (dopo tua conferma)

### A) Schema
- `contatti.cliente_id` e `cantieri.cliente_id` → DROP NOT NULL.
- CHECK `contatti_cliente_o_lead_chk` e `cantieri_cliente_o_lead_chk`: `(cliente_id IS NOT NULL OR lead_id IS NOT NULL)`.
- Indici parziali su `lead_id WHERE cliente_id IS NULL` per le query della scheda lead.

### B) RLS — rami OR isolati
Nessuna modifica a `user_can_access_cliente`, `user_can_write_cliente` o `can_access_lead`. Su ogni policy di `contatti` e `cantieri` si aggiunge in coda:

```
OR (cliente_id IS NULL AND lead_id IS NOT NULL AND can_access_lead(auth.uid()))
```

- SELECT, INSERT-check, UPDATE-using/check, DELETE su entrambe le tabelle.
- Nel check di INSERT/UPDATE di `contatti` il ramo marketing resta `cliente_id IS NOT NULL`: i contatti-lead passano dal nuovo ramo, che copre già marketing (è tra i ruoli di `can_access_lead`).
- Le righe con `cliente_id` valorizzato non sono toccate: il nuovo ramo è falso per costruzione su quelle righe, quindi visibilità e scrittura restano identiche. Nessuna regressione possibile sui clienti esistenti.

### C) Funzione trigger
`ricalcola_privacy_cliente`: uscita anticipata quando `_cliente_id IS NULL`.

### D) Codice
In `src/components/lead/lead-relazioni-tabs.tsx` (`LeadContattiTab`, `LeadCantieriTab`):
- rimuovere la disabilitazione dei pulsanti "Nuovo contatto" / "Nuovo cantiere" e i messaggi "il lead deve essere collegato a un cliente";
- insert con `cliente_id: null, lead_id: leadId`;
- la lista carica per `lead_id` oltre che per `cliente_id`.

Verifico inoltre gli altri punti che scrivono su `contatti`/`cantieri` (wizard nuovo contatto, tab cliente) perché non presuppongano un `cliente_id` sempre presente.

### Verifica finale
- typecheck pulito;
- query di controllo che confronta, per un ruolo store_manager e per un agente, l'insieme delle righe `contatti`/`cantieri` con `cliente_id` valorizzato visibili prima e dopo — devono coincidere;
- prova pratica: creazione di un contatto e di un cantiere da una scheda lead senza cliente collegato.
