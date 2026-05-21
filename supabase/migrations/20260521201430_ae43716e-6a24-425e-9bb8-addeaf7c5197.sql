insert into storage.buckets (id, name, public)
values ('documenti-privacy', 'documenti-privacy', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read documenti-privacy" on storage.objects;
create policy "Public read documenti-privacy"
on storage.objects for select
using (bucket_id = 'documenti-privacy');