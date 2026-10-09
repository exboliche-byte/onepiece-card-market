-- Named, overlapping boxes of cards already owned by an account.
-- Membership references exact printing IDs; it never changes collection quantities.
create table if not exists public.user_collection_boxes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 80),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,id)
);
create table if not exists public.user_collection_box_cards (
 user_id uuid not null,
 box_id uuid not null,
 card_id text not null check (card_id ~ '^[A-Za-z0-9_-]{3,140}$'),
 added_at timestamptz not null default now(),
 primary key(box_id,card_id),
 foreign key(user_id,box_id) references public.user_collection_boxes(user_id,id) on delete cascade
);
create index if not exists user_collection_boxes_owner_idx on public.user_collection_boxes(user_id,created_at);
create index if not exists user_collection_box_cards_owner_idx on public.user_collection_box_cards(user_id,box_id);

alter table public.user_collection_boxes enable row level security;
alter table public.user_collection_box_cards enable row level security;
revoke all on public.user_collection_boxes from PUBLIC,anon,authenticated;
revoke all on public.user_collection_box_cards from PUBLIC,anon,authenticated;
grant select,insert,update,delete on public.user_collection_boxes to authenticated;
grant select,insert,delete on public.user_collection_box_cards to authenticated;

drop policy if exists collection_boxes_select_own on public.user_collection_boxes;
create policy collection_boxes_select_own on public.user_collection_boxes
 for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists collection_boxes_insert_own on public.user_collection_boxes;
create policy collection_boxes_insert_own on public.user_collection_boxes
 for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists collection_boxes_update_own on public.user_collection_boxes;
create policy collection_boxes_update_own on public.user_collection_boxes
 for update to authenticated using(user_id=(select auth.uid()))
 with check(user_id=(select auth.uid()));
drop policy if exists collection_boxes_delete_own on public.user_collection_boxes;
create policy collection_boxes_delete_own on public.user_collection_boxes
 for delete to authenticated using(user_id=(select auth.uid()));

drop policy if exists box_cards_select_own on public.user_collection_box_cards;
create policy box_cards_select_own on public.user_collection_box_cards
 for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists box_cards_insert_owned on public.user_collection_box_cards;
create policy box_cards_insert_owned on public.user_collection_box_cards
 for insert to authenticated with check (
   user_id=(select auth.uid())
   and exists (
     select 1 from public.collection_items owned
     where owned.user_id=user_id and owned.card_id=card_id and owned.quantity>0
   )
 );
drop policy if exists box_cards_delete_own on public.user_collection_box_cards;
create policy box_cards_delete_own on public.user_collection_box_cards
 for delete to authenticated using(user_id=(select auth.uid()));
