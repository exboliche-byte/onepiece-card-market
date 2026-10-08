-- Account-scoped tournaments with soft-delete markers for safe device migration.
create table if not exists public.tournaments (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 160),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
create index if not exists tournaments_account_updated on public.tournaments(user_id, updated_at desc);
alter table public.tournaments enable row level security;
revoke all on public.tournaments from anon;
grant select, insert, update, delete on public.tournaments to authenticated;
create policy "Users select own tournaments"
  on public.tournaments for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own tournaments"
  on public.tournaments for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own tournaments"
  on public.tournaments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own tournaments"
  on public.tournaments for delete to authenticated
  using ((select auth.uid()) = user_id);
