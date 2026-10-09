-- Opt-in physical card placements, deliberately separate from collections and deck lists.
create table if not exists public.deck_physical_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  allocations jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint deck_physical_allocations_object check (jsonb_typeof(allocations) = 'object')
);
alter table public.deck_physical_locations enable row level security;
grant select, insert, update, delete on public.deck_physical_locations to authenticated;
create policy "deck_physical_select_own" on public.deck_physical_locations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "deck_physical_insert_own" on public.deck_physical_locations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "deck_physical_update_own" on public.deck_physical_locations
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "deck_physical_delete_own" on public.deck_physical_locations
  for delete to authenticated using ((select auth.uid()) = user_id);
