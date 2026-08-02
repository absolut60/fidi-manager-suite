# Diagnosi — ciclo consensi GDPR riusabile per i contatti LEAD

## 1) Token di raccolta consensi

Sono **colonne sulla tabella `contatti`** (nessuna tabella token dedicata):

| Colonna | Tipo | Uso |
|---|---|---|
| `privacy_token` / `privacy_token_expires_at` | uuid / timestamptz | firma privacy base (monouso) |
| `consensi_token` / `consensi_token_expires_at` | uuid / timestamptz | raccolta consensi marketing (rigenerabile) |
| `recesso_token` | uuid | link di recesso duraturo, senza scadenza |
| `privacy_firmata`, `data_firma`, `firma_url`, `firma_nome_dichiarato`, `pdf_privacy_path`, `pdf_privacy_url` | — | esiti firma |
| `consenso_marketing_diretto`, `consenso_marketing_media`, `consenso_profilazione` | boolean NOT NULL default false | stato attuale |

Generazione: **server function TS**, non SQL. `crypto.randomUUID()` + scadenza calcolata in JS, scritta con `supabaseAdmin`.

## 2) Generazione link consenso

Componente `LinkFirmaPrivacy({ clienteId })` in `src/routes/_app/clienti.$clienteId.tsx` (~riga 1533). Carica i contatti del cliente con `.eq("cliente_id", clienteId)`, poi:

```ts
const { generaTokenConsensiMarketing } = await import("@/lib/consensi-marketing.functions");
const res = await generaTokenConsensiMarketing({ data: { contattoId: selezionato, giorniValidita: 30 } });
const url = `${window.location.origin}/consensi/${res.token}`;
```

Stesso schema per la privacy base (`generaTokenFirmaPrivacy` → `/firma-privacy/${token}`).

`generaTokenConsensiMarketing` (`.middleware([requireSupabaseAuth])`) verifica prima l'accessibilità del contatto con il client utente (RLS), poi scrive il token con `supabaseAdmin`.

## 3) Route pubblica `/consensi/$token`

`src/routes/consensi.$token.tsx` — pubblica, `noindex`. Usa `useServerFn` su:

- `getContattoPerConsensi({ token })` — legge `contatti` per `consensi_token`, controlla scadenza, poi legge `clienti` per intestazione. Ritorna `{ contatto, cliente, statoAttuale }`.
- `salvaConsensiMarketing({ token, firmaDataUrl, firmaNomeDichiarato, consensi })` — genera PDF (`generaPdfConsensiMarketing` da `src/lib/consensi-pdf.ts`), carica su storage `documenti-privacy` in `contatti/{id}/consensi-{ts}.pdf`, aggiorna `firma_nome_dichiarato`, chiama la RPC e infine azzera il token.

`src/lib/consensi-testi.ts` esporta: `INFORMATIVA_FULL`, `CONSENSO_TESTI`, `CONSENSO_LABEL`, `type TipoConsenso` (`marketing_diretto | marketing_media | profilazione`).

`src/lib/recesso-consensi.functions.ts` esporta: `generaTokenRecesso`, `getContattoPerRecesso`, `revocaConsensi`.
`src/lib/firma-privacy.functions.ts` esporta: `generaTokenFirmaPrivacy`, `getContattoPerFirma`, `firmaPrivacyConToken`.

## 4) `consensi_log` e funzioni SQL

Colonne: `id`, `contatto_id` (NOT NULL), `cliente_id` (**NULLABLE**), `tipo_consenso`, `valore`, `origine`, `operatore_id`, `prova_path`, `ip_address`, `note`, `created_at`. Nessun `lead_id`. Nessun trigger sulla tabella.

RLS: SELECT e INSERT solo per `amministratore / direzione / amministrazione / marketing` (nessun uso di `user_can_access_cliente`) — quindi **la RLS non è un ostacolo per i lead**.

`registra_consensi_batch(_contatto_id, _marketing_diretto, _marketing_media, _profilazione, _origine, _operatore_id, _prova_path, _ip, _note)` — SECURITY DEFINER: inserisce 3 righe in `consensi_log` e aggiorna i 3 flag sul contatto. Origini ammesse: `link_pubblico, operatore, recesso_link, import`.

`registra_consenso(_contatto_id, _tipo_consenso, _valore, _origine, _operatore_id, _prova_path, _ip, _note)` — una riga di log + aggiornamento del singolo flag. `revoca_consensi_batch(...)` chiama `registra_consenso` con `valore=false`.

Il log è legato a **`contatto_id`**; `cliente_id` è derivato dal contatto ed è denormalizzato.

## 5) PUNTO CHIAVE — i contatti lead-only (cliente_id NULL) ROMPONO il ciclo

Il consenso del lead **non funziona già**: serve un adattamento. Blocco reale, in ordine di gravità:

1. **BLOCCANTE — le funzioni SQL alzano eccezione.** Entrambe usano `cliente_id` come test di esistenza del contatto:
   ```sql
   SELECT cliente_id INTO v_cliente_id FROM public.contatti WHERE id = _contatto_id;
   IF v_cliente_id IS NULL THEN RAISE EXCEPTION 'Contatto % non trovato', _contatto_id; END IF;
   ```
   Con un contatto lead-only la SELECT trova la riga ma restituisce NULL → `RAISE EXCEPTION`. Vale per `registra_consensi_batch`, `registra_consenso` e quindi anche per `revoca_consensi_batch` (recesso). Il salvataggio pubblico fallirebbe **dopo** aver già caricato il PDF su storage.
2. **NON bloccante ma sbagliato in output — intestazione vuota.** `getContattoPerConsensi`, `salvaConsensiMarketing` e `getContattoPerRecesso` fanno `.eq("id", ct.cliente_id ?? "0000...0000")` su `clienti`: con un lead nessuna riga, quindi `ragione_sociale: ""`, P.IVA/indirizzo nulli. La pagina pubblica e il **PDF di prova** uscirebbero senza intestazione del soggetto — inaccettabile come prova GDPR.
3. **Schema OK.** `consensi_log.cliente_id` è già nullable e non c'è trigger; `ricalcola_privacy_cliente` (su `contatti`) ha già la guardia di uscita per `cliente_id` NULL. Le policy di `consensi_log` sono per ruolo, e i ruoli lead (`marketing/amministrazione/direzione/amministratore`) coincidono esattamente con quelli ammessi.
4. **UI mancante.** `LinkFirmaPrivacy` è vincolato a `clienteId` e carica i contatti con `.eq("cliente_id", clienteId)`: non esiste alcun punto di generazione link nella scheda lead.

Conclusione: token, route pubblica, PDF, storage e RLS sono **riusabili così come sono**; servono tre adattamenti mirati (funzioni SQL, risoluzione intestazione soggetto, UI lead).

## Adattamento proposto per lo Strato 3 (da approvare, nulla è stato applicato)

1. **SQL** — sostituire il test di esistenza in `registra_consenso` e `registra_consensi_batch`: recuperare `cliente_id` **e** `lead_id` con un solo SELECT e alzare eccezione solo se la riga non esiste (`NOT FOUND`), non se `cliente_id` è NULL. Aggiungere a `consensi_log` una colonna `lead_id uuid` (nullable, FK a `lead`) valorizzata dalle stesse funzioni, così la prova resta tracciabile lato lead. Nessuna modifica alle policy esistenti.
2. **Server functions** — introdurre un risolutore unico "intestazione soggetto" che, se `cliente_id` è NULL e `lead_id` è valorizzato, legge da `lead` (`ragione_sociale`/nome+cognome, `partita_iva`, `codice_fiscale`, `indirizzo`, `citta`) e alimenta pagina pubblica e PDF. Riusato da `getContattoPerConsensi`, `salvaConsensiMarketing` e `getContattoPerRecesso`.
3. **UI lead** — riusare lo stesso pannello "genera link" nella scheda lead, parametrizzato su `leadId` invece che `clienteId` (elenco contatti filtrato per `lead_id`), senza duplicare la logica dei token.

Nessuna modifica a `user_can_access_cliente`, alle policy di `contatti`, o al ciclo cliente esistente.
