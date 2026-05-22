-- Crea bucket "firme" pubblico (idempotente)
insert into storage.buckets (id, name, public)
values ('firme', 'firme', true)
on conflict (id) do update set public = true;

-- Policy: lettura pubblica
drop policy if exists "Firme: lettura pubblica" on storage.objects;
create policy "Firme: lettura pubblica"
  on storage.objects for select
  using (bucket_id = 'firme');

-- Policy: upload da utenti autenticati
drop policy if exists "Firme: autenticati caricano" on storage.objects;
create policy "Firme: autenticati caricano"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'firme');

-- Policy: update da utenti autenticati
drop policy if exists "Firme: autenticati aggiornano" on storage.objects;
create policy "Firme: autenticati aggiornano"
  on storage.objects for update to authenticated
  using (bucket_id = 'firme');

-- Policy: delete solo admin
drop policy if exists "Firme: admin elimina" on storage.objects;
create policy "Firme: admin elimina"
  on storage.objects for delete to authenticated
  using (bucket_id = 'firme' and has_role(auth.uid(), 'amministratore'::app_role));
