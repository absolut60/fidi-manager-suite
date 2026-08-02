# Diagnosi — firma privacy-base su contatto lead-only

Verifica sul percorso `generaTokenFirmaPrivacy` → `/firma-privacy/$token` → `firmaPrivacyConToken`.

## 1) `firmaPrivacyConToken` — nessuna rottura tecnica, ma intestazione vuota

Punti reali dove tocca `cliente_id` (`src/lib/firma-privacy.functions.ts`, righe 103-107 e 127-136):

```ts
const { data: cli } = await supabaseAdmin
  .from("clienti")
  .select("ragione_sociale, partita_iva, codice_fiscale, indirizzo, citta")
  .eq("id", ct.cliente_id ?? "00000000-0000-0000-0000-000000000000")
  .maybeSingle();
```

- La query è già null-safe (UUID fittizio, `maybeSingle`, errore non propagato) → con un lead restituisce `null`, non lancia.
- Il PDF viene però generato con `ragioneSociale: "${cli?.ragione_sociale ?? ""} — firma di {nome}"`, `partitaIva/codiceFiscale/indirizzo/citta` undefined → **prova GDPR senza intestazione del soggetto**, esattamente il difetto già corretto per i consensi.
- L'`UPDATE` finale è solo su `contatti` (`privacy_firmata`, `data_firma`, `firma_url`, `pdf_privacy_*`, azzeramento token) — **nessun UPDATE diretto su `clienti`**, quindi nessuna scrittura che salti la guardia.
- Upload firma PNG e PDF su `contatti/{id}/...`: path basato sul contatto, indipendente dal cliente. OK per i lead.

## 2) `getContattoPerFirma` — stessa lettura, stesso esito

Righe 56-76: legge l'intestazione da `clienti` con lo stesso fallback UUID fittizio. Con un lead ritorna `ragione_sociale: ""` e P.IVA/indirizzo `null`. La pagina pubblica `src/routes/firma-privacy.$token.tsx` renderizza il blocco "Stai firmando per" solo `cliente && contatto`: l'oggetto esiste sempre, quindi la card si mostra ma con **titolo vuoto**.

## 3) Nessuna funzione SQL nel percorso

`/firma-privacy/$token` usa solo le due server function TS con `supabaseAdmin`. Non esiste alcuna RPC tipo `firma_privacy`; nessun controllo di esistenza basato su `cliente_id NOT NULL` come quello che bloccava `registra_consenso` / `registra_consensi_batch`. **Il fix "esistenza" non serve qui.**

## 4) Trigger — già coperto

Su `contatti` esistono due trigger:
- `contatti_updated_at` (BEFORE UPDATE) — irrilevante.
- `trg_ricalcola_privacy_cliente` AFTER INSERT/DELETE/UPDATE OF `privacy_firmata` → `ricalcola_privacy_cliente()`, che ha già la guardia:
  ```sql
  _cliente_id := COALESCE(NEW.cliente_id, OLD.cliente_id);
  IF _cliente_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  ```
  Con un contatto lead-only esce subito: nessun `UPDATE clienti`. E `firmaPrivacyConToken` non fa alcun update diretto su `clienti` che possa aggirarla.

## Conclusione

La firma privacy-base su un contatto lead-only **non si rompe**: il flusso completa, il PDF viene caricato, il contatto aggiornato, il trigger esce pulito. L'unico difetto è **l'intestazione del soggetto vuota** nella pagina pubblica e nel PDF di prova — inaccettabile come documento GDPR, dato che il pannello `LinkFirmaPrivacy` è già esposto sulla scheda lead (`leadId`) e quindi il caso è raggiungibile in produzione.

## Intervento proposto (da approvare, nulla è stato applicato)

Un solo tipo di adattamento, il più leggero:

1. In `getContattoPerFirma` e `firmaPrivacyConToken`, selezionare anche `lead_id` dal contatto e sostituire le due letture dirette da `clienti` con `risolviIntestazioneSoggetto()` già esistente in `src/lib/intestazione-soggetto.server.ts` (stesso risolutore usato dai consensi).
2. Alimentare con il risultato sia il payload della pagina pubblica sia `generaPdfPrivacy` (`ragioneSociale`, `partitaIva`, `codiceFiscale`, `indirizzo`, `citta`).
3. Nessuna migrazione DB, nessuna nuova policy, nessuna modifica a trigger, RPC, `user_can_access_cliente` o al ciclo cliente esistente.

Opzionale, coerenza con quanto fatto per i consensi: spostare l'upload del PDF dopo l'update del contatto (oggi un fallimento dell'update lascerebbe PDF e firma orfani su storage). Da confermare se includerlo.
