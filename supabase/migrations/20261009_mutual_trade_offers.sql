-- Mutual-consent trading. Only authenticated participants see offers.
-- Card transfers are performed inside one PostgreSQL transaction.
create table if not exists public.trade_offers (
 id uuid primary key default gen_random_uuid(),
 maker_id uuid not null references auth.users(id) on delete cascade,
 taker_id uuid not null references auth.users(id) on delete cascade,
 maker_label text not null,
 taker_label text not null,
 offered jsonb not null,
 requested jsonb not null,
 maker_accepted boolean not null default true,
 taker_accepted boolean not null default false,
 status text not null default 'pending' check(status in ('pending','completed','rejected','cancelled')),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 check (maker_id<>taker_id),
 check (jsonb_typeof(offered)='array' and jsonb_typeof(requested)='array')
);
create index if not exists trade_offers_maker_idx on public.trade_offers(maker_id,created_at desc);
create index if not exists trade_offers_taker_idx on public.trade_offers(taker_id,created_at desc);
alter table public.trade_offers enable row level security;
revoke all on public.trade_offers from public,anon,authenticated;
grant select on public.trade_offers to authenticated;
drop policy if exists trade_offers_participants_read on public.trade_offers;
create policy trade_offers_participants_read on public.trade_offers for select
to authenticated using (maker_id=(select auth.uid()) or taker_id=(select auth.uid()));

-- Validate a fixed list of exact-print card IDs and requested quantities.
create or replace function public.trade_validate_items(p_items jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare it jsonb; ident text; amount text; seen text[] := '{}';
begin
 if p_items is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items) not between 1 and 70 then
   raise exception 'La propuesta debe contener entre 1 y 70 cartas diferentes';
 end if;
 for it in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(it)<>'object' then raise exception 'Carta inválida'; end if;
   ident := it->>'id'; amount := it->>'q';
   if ident is null or length(ident)>140 or ident !~ '^[A-Za-z0-9_-]{3,140}$'
      or amount is null or amount !~ '^[1-9][0-9]?$' or amount::integer not between 1 and 99
      or ident=any(seen) then
      raise exception 'Carta repetida o cantidad inválida en la propuesta';
   end if;
   seen:=array_append(seen,ident);
 end loop;
end $$;
revoke all on function public.trade_validate_items(jsonb) from public,anon;
grant execute on function public.trade_validate_items(jsonb) to authenticated;

create or replace function public.trade_offer_create(p_partner_username text, p_offered jsonb, p_requested jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid := (select auth.uid()); peer uuid; my_name text; peer_name text; item jsonb; total integer; offer_id uuid;
begin
 if uid is null then raise exception 'Debes iniciar sesión'; end if;
 if p_partner_username is null or length(trim(p_partner_username)) not between 2 and 60 then
    raise exception 'Introduce el usuario de destino'; end if;
 select id,coalesce(nullif(display_name,''),username) into peer,peer_name
 from public.profiles where lower(username)=lower(trim(p_partner_username));
 if peer is null then raise exception 'No existe ese nombre de usuario'; end if;
 if peer=uid then raise exception 'No puedes intercambiar contigo mismo'; end if;
 select coalesce(nullif(display_name,''),nullif(username,''),'Usuario')
 into my_name from public.profiles where id=uid;
 perform public.trade_validate_items(p_offered);
 perform public.trade_validate_items(p_requested);
 select count(*) into total from public.trade_offers where maker_id=uid and status='pending';
 if total>=30 then raise exception 'Tienes demasiadas propuestas pendientes'; end if;
 -- Check the offerer's currently held exact print, without modifying it.
 for item in select value from jsonb_array_elements(p_offered) loop
   if coalesce((select quantity from public.collection_items where user_id=uid and card_id=item->>'id'),0)
     < (item->>'q')::int then
       raise exception 'No tienes suficientes copias de %', item->>'id';
   end if;
 end loop;
 insert into public.trade_offers(maker_id,taker_id,maker_label,taker_label,offered,requested,maker_accepted,taker_accepted)
 values(uid,peer,coalesce(my_name,'Usuario'),coalesce(peer_name,'Usuario'),p_offered,p_requested,true,false)
 returning id into offer_id;
 return offer_id;
end $$;
revoke all on function public.trade_offer_create(text,jsonb,jsonb) from public,anon;
grant execute on function public.trade_offer_create(text,jsonb,jsonb) to authenticated;

create or replace function public.trade_offer_decide(p_offer_id uuid,p_action text)
returns text language plpgsql security definer set search_path='' as $$
declare uid uuid := (select auth.uid()); off public.trade_offers%rowtype; item jsonb; cid text; n integer; curqty integer;
begin
 if uid is null then raise exception 'Debes iniciar sesión'; end if;
 if p_action is null or p_action not in ('accept','reject','cancel') then raise exception 'Acción no permitida'; end if;
 select * into off from public.trade_offers where id=p_offer_id for update;
 if not found or (uid<>off.maker_id and uid<>off.taker_id) then
    raise exception 'Propuesta inexistente o sin acceso'; end if;
 if off.status<>'pending' then raise exception 'Esta propuesta ya está cerrada'; end if;
 if p_action='cancel' then
   if uid<>off.maker_id then raise exception 'Solo el remitente puede cancelar'; end if;
   update public.trade_offers set status='cancelled' where id=off.id;
   return 'cancelled';
 end if;
 if uid<>off.taker_id then raise exception 'Solo el destinatario puede responder'; end if;
 if p_action='reject' then
   update public.trade_offers set status='rejected' where id=off.id;
   return 'rejected';
 end if;
 if not off.maker_accepted then raise exception 'El remitente todavía no ha aceptado'; end if;
 -- Serialise all existing inventory involved in the trade.
 perform 1 from public.collection_items ci
 where (ci.user_id=off.maker_id and ci.card_id in
   (select v->>'id' from jsonb_array_elements(off.offered) v))
    or (ci.user_id=off.taker_id and ci.card_id in
   (select v->>'id' from jsonb_array_elements(off.requested) v))
 order by ci.user_id,ci.card_id for update;
 -- Both sides must still own all the exact physical prints offered.
 for item in select value from jsonb_array_elements(off.offered) loop
   cid:=item->>'id'; n:=(item->>'q')::int;
   update public.collection_items
    set quantity=quantity-n,updated_at=now()
    where user_id=off.maker_id and card_id=cid and quantity>=n;
   if not found then raise exception 'El remitente ya no tiene suficientes copias de %',cid; end if;
 end loop;
 for item in select value from jsonb_array_elements(off.requested) loop
   cid:=item->>'id'; n:=(item->>'q')::int;
   update public.collection_items
    set quantity=quantity-n,updated_at=now()
    where user_id=off.taker_id and card_id=cid and quantity>=n;
   if not found then raise exception 'El destinatario ya no tiene suficientes copias de %',cid; end if;
 end loop;
 -- Credit each side, rejecting the entire transaction on inventory overflow.
 for item in select value from jsonb_array_elements(off.requested) loop
   cid:=item->>'id'; n:=(item->>'q')::int;
   insert into public.collection_items(user_id,card_id,quantity,updated_at)
   values(off.maker_id,cid,n,now())
   on conflict(user_id,card_id) do update set
     quantity=public.collection_items.quantity+excluded.quantity,updated_at=now()
   where public.collection_items.quantity+excluded.quantity<=99;
   if not found then raise exception 'El destinatario superaría 99 copias de %',cid; end if;
 end loop;
 for item in select value from jsonb_array_elements(off.offered) loop
   cid:=item->>'id'; n:=(item->>'q')::int;
   insert into public.collection_items(user_id,card_id,quantity,updated_at)
   values(off.taker_id,cid,n,now())
   on conflict(user_id,card_id) do update set
     quantity=public.collection_items.quantity+excluded.quantity,updated_at=now()
   where public.collection_items.quantity+excluded.quantity<=99;
   if not found then raise exception 'El destinatario superaría 99 copias de %',cid; end if;
 end loop;
 update public.trade_offers set taker_accepted=true,status='completed',completed_at=now() where id=off.id;
 return 'completed';
end $$;
revoke all on function public.trade_offer_decide(uuid,text) from public,anon;
grant execute on function public.trade_offer_decide(uuid,text) to authenticated;

-- Remove the discontinued price-alert storage (user explicitly requested removal).
alter table public.user_tools drop column if exists watch;
