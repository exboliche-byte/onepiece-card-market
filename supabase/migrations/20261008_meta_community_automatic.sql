-- Estadísticas comunitarias automáticas. Todos los torneos finalizados
-- aportan resultados agregados sin exponer datos personales ni rondas individuales.
-- La tabla histórica meta_opt_ins queda inactiva y NO se elimina.
create or replace function public.get_community_meta(p_days integer default 90)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
with matches as (
  select t.user_id, t.id as tournament_id,
    upper(split_part(t.data->>'leaderId','_',1)) as leader,
    upper(split_part(r.item->>'opponentId','_',1)) as opponent,
    r.item->>'start' as opening,
    r.item->>'result' as result
  from public.tournaments t
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(t.data->'rounds')='array' then t.data->'rounds' else '[]'::jsonb end
  ) r(item)
  where t.deleted_at is null and t.data->>'finished'='true'
    and left(coalesce(t.data->>'date',''),10)
      between (current_date - greatest(14,least(coalesce(p_days,90),365)))::text and current_date::text
    and r.item->>'kind' not in ('bye','noshow')
    and r.item->>'result' in ('W','L')
    and upper(split_part(t.data->>'leaderId','_',1)) ~ '^((OP|ST|EB|PRB)[0-9]{2}|P)-[0-9]{3}$'
    and upper(split_part(r.item->>'opponentId','_',1)) ~ '^((OP|ST|EB|PRB)[0-9]{2}|P)-[0-9]{3}$'
), leaders as (
  select leader as id,count(*)::int as games,
    count(*) filter(where result='W')::int as wins,
    count(*) filter(where result='L')::int as losses,
    count(distinct user_id)::int as users
  from matches group by leader
), pairs as (
  select leader,opponent,count(*)::int as games,
    count(*) filter(where result='W')::int as wins,
    count(*) filter(where result='L')::int as losses,
    count(distinct user_id)::int as users,
    count(*) filter(where opening='1')::int as fg,
    count(*) filter(where opening='1' and result='W')::int as fw,
    count(*) filter(where opening='1' and result='L')::int as fl,
    count(distinct user_id) filter(where opening='1')::int as fu,
    count(*) filter(where opening='2')::int as sg,
    count(*) filter(where opening='2' and result='W')::int as sw,
    count(*) filter(where opening='2' and result='L')::int as sl,
    count(distinct user_id) filter(where opening='2')::int as su
  from matches group by leader,opponent
)
select jsonb_build_object(
 'source','MiAlbumOnePiece',
 'updatedAt',now(),
 'recordedGames',(select count(*) from matches),
 'contributingUsers',(select count(distinct user_id) from matches),
 'eligibleTournaments',(select count(distinct (user_id,tournament_id)) from matches),
 'leaders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'games',games,'wins',wins,'losses',losses) order by games desc)
                    from leaders where users>=3 and games>=6),'[]'::jsonb),
 'matchups',coalesce((select jsonb_agg(jsonb_build_object(
    'leader',leader,'opponent',opponent,'games',games,'wins',wins,'losses',losses,
    'first',case when fu>=3 and fg>=6 then jsonb_build_object('games',fg,'wins',fw,'losses',fl) else null end,
    'second',case when su>=3 and sg>=6 then jsonb_build_object('games',sg,'wins',sw,'losses',sl) else null end
    ) order by games desc)
    from pairs where users>=3 and games>=6),'[]'::jsonb)
);
$$;
revoke all on function public.get_community_meta(integer) from public;
grant execute on function public.get_community_meta(integer) to anon,authenticated;
