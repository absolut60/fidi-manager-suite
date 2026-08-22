create table public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    endpoint text not null,
    p256dh text not null,
    auth text not null,
    user_agent text,
    device_label text,
    platform text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_used_at timestamptz,
    constraint push_subscriptions_endpoint_unique unique (endpoint)
);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select"
    on public.push_subscriptions
    for select
    to authenticated
    using (user_id = auth.uid() or public.has_role(auth.uid(), 'amministratore'::public.app_role));

create policy "push_subscriptions_insert"
    on public.push_subscriptions
    for insert
    to authenticated
    with check (user_id = auth.uid() or public.has_role(auth.uid(), 'amministratore'::public.app_role));

create policy "push_subscriptions_update"
    on public.push_subscriptions
    for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "push_subscriptions_delete"
    on public.push_subscriptions
    for delete
    to authenticated
    using (user_id = auth.uid() or public.has_role(auth.uid(), 'amministratore'::public.app_role));

create trigger push_subscriptions_updated_at
    before update on public.push_subscriptions
    for each row
    execute function public.update_updated_at();
