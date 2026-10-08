-- Additive migration applied to Supabase; no collection data is changed.
CREATE TABLE IF NOT EXISTS public.card_price_history (
 print_id text NOT NULL CHECK(print_id=lower(trim(print_id))),
 price_day date NOT NULL,eur numeric(12,4) NOT NULL CHECK(eur>0 AND eur<1000000),
 source_updated_at timestamptz,captured_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(print_id,price_day)
);
CREATE INDEX IF NOT EXISTS card_price_history_day_idx ON public.card_price_history(price_day);
CREATE TABLE IF NOT EXISTS public.price_history_ingestions (
 price_day date PRIMARY KEY, source_updated_at timestamptz,
 version_count integer NOT NULL DEFAULT 0, complete boolean NOT NULL DEFAULT false,
 started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
);
ALTER TABLE public.card_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history_ingestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.card_price_history FROM anon,authenticated;
REVOKE ALL ON public.price_history_ingestions FROM anon,authenticated;
GRANT SELECT ON public.card_price_history TO authenticated;
GRANT SELECT ON public.price_history_ingestions TO authenticated;
DROP POLICY IF EXISTS card_price_history_read ON public.card_price_history;
CREATE POLICY card_price_history_read ON public.card_price_history FOR SELECT TO authenticated USING(true);
DROP POLICY IF EXISTS price_history_ingestions_read ON public.price_history_ingestions;
CREATE POLICY price_history_ingestions_read ON public.price_history_ingestions FOR SELECT TO authenticated USING(complete=true);
CREATE OR REPLACE FUNCTION public.collection_market_history(p_days integer DEFAULT 30)
 RETURNS TABLE(price_day date, total_eur numeric, priced_versions bigint, owned_versions bigint, priced_copies numeric, owned_copies numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH owned AS (
 SELECT lower(c.card_id) print_id,c.quantity::numeric qty FROM public.collection_items c
 WHERE c.user_id=(SELECT auth.uid()) AND c.quantity>0
), tally AS (
 SELECT count(*)::bigint n,coalesce(sum(qty),0)::numeric q FROM owned
), days AS (
 SELECT i.price_day FROM public.price_history_ingestions i
 WHERE i.complete=true AND i.price_day BETWEEN current_date-least(365,greatest(7,coalesce(p_days,30))) AND current_date
)
SELECT d.price_day,coalesce(sum(h.eur*o.qty),0)::numeric,count(h.print_id)::bigint,t.n,
       coalesce(sum(CASE WHEN h.print_id IS NOT NULL THEN o.qty ELSE 0 END),0)::numeric,t.q
FROM days d CROSS JOIN tally t CROSS JOIN owned o
LEFT JOIN public.card_price_history h ON h.price_day=d.price_day AND h.print_id=o.print_id
GROUP BY d.price_day,t.n,t.q ORDER BY d.price_day;
$function$
;

CREATE OR REPLACE FUNCTION public.collection_market_movers(p_days integer DEFAULT 30)
 RETURNS TABLE(print_id text, quantity numeric, first_eur numeric, last_eur numeric, change_eur numeric, change_pct numeric, impact_eur numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH latest_day AS (
 SELECT max(price_day) AS captured_on FROM public.price_history_ingestions
 WHERE complete=true AND price_day>=current_date-3
), owned AS (
 SELECT lower(c.card_id) AS id,c.quantity::numeric AS qty FROM public.collection_items c
 WHERE c.user_id=(SELECT auth.uid()) AND c.quantity>0
), changes AS (
 SELECT o.id,o.qty,baseline.eur AS old_eur,latest.eur AS new_eur,
        latest.eur-baseline.eur AS delta,
        round(100*(latest.eur-baseline.eur)/nullif(baseline.eur,0),2) AS pct,
        o.qty*(latest.eur-baseline.eur) AS impact
 FROM owned o CROSS JOIN latest_day d
 JOIN public.card_price_history latest ON latest.print_id=o.id AND latest.price_day=d.captured_on
 JOIN LATERAL (
  SELECT h.eur FROM public.card_price_history h
  JOIN public.price_history_ingestions i ON i.price_day=h.price_day AND i.complete=true
  WHERE h.print_id=o.id AND h.price_day BETWEEN d.captured_on-least(365,greatest(7,coalesce(p_days,30)))-2
    AND d.captured_on-least(365,greatest(7,coalesce(p_days,30)))+2
  ORDER BY abs(h.price_day-(d.captured_on-least(365,greatest(7,coalesce(p_days,30))))),h.price_day DESC LIMIT 1
 ) baseline ON true
)
SELECT p.id,p.qty,p.old_eur,p.new_eur,p.delta,p.pct,p.impact FROM
 ((SELECT * FROM changes WHERE pct>0 ORDER BY pct DESC,id LIMIT 5)
  UNION ALL
  (SELECT * FROM changes WHERE pct<0 ORDER BY pct ASC,id LIMIT 5)) p
ORDER BY p.pct DESC,p.id;
$function$
;

REVOKE ALL ON FUNCTION public.collection_market_history(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.collection_market_movers(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.collection_market_history(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collection_market_movers(integer) TO authenticated;
