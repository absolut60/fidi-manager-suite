## Firma privacy a livello contatto

### a) Migration — schema + RLS

```sql
-- Colonne sul contatto
alter table public.contatti
  add column if not exists pdf_privacy_url text,
  add column if not exists pdf_privacy_path text,
  add column if not exists privacy_firmata boolean not null default false,
  add column if not exists data_firma timestamptz,
  add column if not exists firma_url text,
  add column if not exists privacy_token uuid,
  add column if not exists privacy_token_expires_at timestamptz;

create unique index if not exists contatti_privacy_token_key
  on public.contatti (privacy_token) where privacy_token is not null;

-- RLS storage per documenti-privacy
create policy "DocumentiPrivacy: autenticati caricano"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documenti-privacy');

create policy "DocumentiPrivacy: autenticati aggiornano"
  on storage.objects for update to authenticated
  using (bucket_id = 'documenti-privacy');

create policy "DocumentiPrivacy: admin elimina"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documenti-privacy'
         and has_role(auth.uid(), 'amministratore'::app_role));
```

Aggiungo anche i campi di stato firma (`privacy_firmata`, `data_firma`, `firma_url`, `privacy_token`, `privacy_token_expires_at`) sul contatto: senza di essi il flusso "firma per contatto" non è completo (token pubblico, marcatura firmato, URL PNG firma). Le colonne equivalenti su `clienti` restano per retro-compatibilità.

### b) Codice — spostare firma privacy su contatto

Riscrivo `src/lib/firma-privacy.functions.ts` per operare su `contatti` invece di `clienti`:

- `generaTokenFirmaPrivacy({ contattoId, giorniValidita })` → genera token su `contatti`.
- `getContattoPerFirma({ token })` → legge contatto + dati cliente collegato (per intestazione PDF).
- `firmaPrivacyConToken({ token, firmaDataUrl })`:
  - upload PNG firma su bucket `firme` (path `contatti/<contattoId>/firma-<ts>.png`)
  - genera PDF con dati cliente + nome/cognome contatto
  - upload PDF su `documenti-privacy` (path `contatti/<contattoId>/privacy-<ts>.pdf`)
  - aggiorna `contatti` con `privacy_firmata`, `data_firma`, `firma_url`, `pdf_privacy_url`, `pdf_privacy_path`, azzera token

Aggiorno `src/routes/firma-privacy.$token.tsx` per usare le nuove signature (contatto al posto di cliente).

I componenti che oggi chiamano `generaTokenFirmaPrivacy({ clienteId })` (es. scheda cliente) andranno aggiornati per passare un `contattoId` — proporrò un selettore "contatto principale" dove serve. Cerco gli usage prima dell'edit e li adatto.

### Test

1. Verifico build pulita.
2. Chiamo via `stack_modern--invoke-server-function` `generaTokenFirmaPrivacy` con un contatto reale (autenticato), poi `getContattoPerFirma` con il token, poi `firmaPrivacyConToken` con un PNG 1x1 base64.
3. Query: `select id, privacy_firmata, pdf_privacy_url, pdf_privacy_path from contatti where id = ...` per confermare persistenza.
4. Confermo che `clienti` dello stesso contatto NON viene toccato.

### Note

- Le colonne `clienti.privacy_pdf_url`, `clienti.firma_url`, `clienti.privacy_firmata` non vengono rimosse (preservare dati storici).
- Il bucket `privacy-pdf` resta intatto.
