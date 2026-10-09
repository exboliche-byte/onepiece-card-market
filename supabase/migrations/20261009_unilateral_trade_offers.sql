-- Permite regalos (requested=[]) y peticiones (offered=[]), pero nunca ambos vacíos.
-- Mantiene autorización, validación de impresión exacta y transferencia atómica.
create or replace function public.trade_validate_items(p_items jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare it jsonb; ident text; amount text; seen text[] := '{}';
begin
 if p_items is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items) not between 0 and 70 then
   raise exception 'Cada lado de la propuesta admite entre 0 y 70 cartas diferentes';
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
 if jsonb_array_length(p_offered)=0 and jsonb_array_length(p_requested)=0 then
   raise exception 'La propuesta no puede estar vacía en ambos lados';
 end if;
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

