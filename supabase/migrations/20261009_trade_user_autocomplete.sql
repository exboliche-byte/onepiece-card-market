-- Autocompletado de usuarios para propuestas de intercambio.
-- Devuelve únicamente nombres públicos; no expone e-mail ni información privada.
create or replace function public.trade_search_users(p_query text)
returns table(username text,display_name text)
language plpgsql security definer set search_path=''
as $$
declare uid uuid := (select auth.uid()); q text := lower(trim(coalesce(p_query,'')));
begin
 if uid is null then raise exception 'Inicia sesión'; end if;
 if length(q)<1 or length(q)>60 then return; end if;
 return query
  select p.username::text,coalesce(nullif(p.display_name,''),p.username)::text
  from public.profiles p
  where p.username is not null
   and p.id<>uid
   and left(lower(p.username),length(q))=q
  order by length(p.username),lower(p.username)
  limit 8;
end $$;
revoke all on function public.trade_search_users(text) from public,anon;
grant execute on function public.trade_search_users(text) to authenticated;
