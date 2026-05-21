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