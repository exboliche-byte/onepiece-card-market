-- Account-scoped tool drafts: manual swaps and price watches.
-- Additive only; existing collection, decks and tournament rows are not touched.
create table if not exists public.user_tools (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trade jsonb not null default '[[],[]]'::jsonb,
  watch jsonb not null default '[]'::jsonb,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  constraint user_tools_trade_array check (jsonb_typeof(trade) = 'array'),
  constraint user_tools_watch_array check (jsonb_typeof(watch) = 'array')
);
alter table public.user_tools enable row level security;
revoke all on table public.user_tools from PUBLIC, anon, authenticated;
grant select, insert, update on table public.user_tools to authenticated;

drop policy if exists user_tools_select_own on public.user_tools;
create policy user_tools_select_own on public.user_tools
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists user_tools_insert_own on public.user_tools;
create policy user_tools_insert_own on public.user_tools
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists user_tools_update_own on public.user_tools;
create policy user_tools_update_own on public.user_tools
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists user_tools_updated_at_idx on public.user_tools(updated_at desc);
