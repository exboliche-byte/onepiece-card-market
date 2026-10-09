-- Account-scoped Want lists. Exact print IDs and quantities are authoritative.
-- Additive only: no changes to collection, deck, trade or tournament tables.
create table if not exists public.user_want_lists (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 80),
 items jsonb not null default '{}'::jsonb check (jsonb_typeof(items)='object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists user_want_lists_user_idx on public.user_want_lists(user_id,created_at);
alter table public.user_want_lists enable row level security;
revoke all on public.user_want_lists from PUBLIC, anon, authenticated;
grant select,insert,update,delete on public.user_want_lists to authenticated;
drop policy if exists want_lists_owner_select on public.user_want_lists;
create policy want_lists_owner_select on public.user_want_lists for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists want_lists_owner_insert on public.user_want_lists;
create policy want_lists_owner_insert on public.user_want_lists for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists want_lists_owner_update on public.user_want_lists;
create policy want_lists_owner_update on public.user_want_lists for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists want_lists_owner_delete on public.user_want_lists;
create policy want_lists_owner_delete on public.user_want_lists for delete to authenticated using(user_id=(select auth.uid()));

-- Single-item updates must be atomic: never overwrite another device's list.
create or replace function public.wants_set_item(p_list_id uuid,p_card_id text,p_quantity integer)
returns void language plpgsql security invoker set search_path to '' as $fn$
begin
 if (select auth.uid()) is null or p_list_id is null
   or p_card_id is null or p_card_id !~ '^[A-Za-z0-9_-]{3,140}$'
   or p_quantity not between 0 and 99 then
    raise exception 'Datos de wants inválidos';
 end if;
 update public.user_want_lists
 set items=case when p_quantity=0 then items-p_card_id
      else jsonb_set(items,array[p_card_id],to_jsonb(p_quantity),true) end,
     updated_at=now()
 where id=p_list_id and user_id=(select auth.uid());
 if not found then raise exception 'Lista no encontrada o no autorizada'; end if;
end $fn$;
revoke all on function public.wants_set_item(uuid,text,integer) from public,anon;
grant execute on function public.wants_set_item(uuid,text,integer) to authenticated;

-- On confirmed collection additions, subtract exactly the acquired print.
-- All affected lists are adjusted together; no base/reprint substitutions.
create or replace function public.wants_consume_item(p_card_id text,p_quantity integer)
returns integer language plpgsql security invoker set search_path to '' as $fn$
declare affected integer;
begin
 if (select auth.uid()) is null or p_card_id is null
    or p_card_id !~ '^[A-Za-z0-9_-]{3,140}$'
    or p_quantity not between 1 and 99 then
   raise exception 'Cantidad o impresión de wants inválida';
 end if;
 update public.user_want_lists
 set items=case
   when (items->>p_card_id)::integer <= p_quantity then items-p_card_id
   else jsonb_set(items,array[p_card_id],
     to_jsonb((items->>p_card_id)::integer-p_quantity),false) end,
   updated_at=now()
 where user_id=(select auth.uid()) and items ? p_card_id;
 get diagnostics affected=row_count;
 return affected;
end $fn$;
revoke all on function public.wants_consume_item(text,integer) from public,anon;
grant execute on function public.wants_consume_item(text,integer) to authenticated;
