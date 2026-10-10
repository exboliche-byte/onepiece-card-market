-- Preserve the live RPC signature, response fields and statistics while fixing
-- the privacy regression introduced by its latest redefinition.
DO $audit$
DECLARE function_def text;
DECLARE original_fragment text := E'  from public.tournaments t\n  cross join lateral';
BEGIN
  SELECT pg_get_functiondef('public.get_community_meta(integer)'::regprocedure) INTO function_def;
  IF position('join public.meta_opt_ins o on o.user_id=t.user_id and o.enabled' in function_def)=0 THEN
    IF position(original_fragment in function_def)=0 THEN
      RAISE EXCEPTION 'Unexpected community meta function body; review required';
    END IF;
    EXECUTE replace(function_def,original_fragment,
      E'  from public.tournaments t\n  join public.meta_opt_ins o on o.user_id=t.user_id and o.enabled=true\n  cross join lateral');
  END IF;
END
$audit$;
-- Both API calls are deliberately public read-only capabilities.
-- Their respective functions validate access by opt-in aggregation or secret share slug.
REVOKE ALL ON FUNCTION public.get_community_meta(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_community_meta(integer) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.public_collection_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_collection_snapshot(text) TO anon,authenticated;
-- Do NOT grant public access to authenticated-only trade mutation RPCs.

-- Preserve user_id ownership for all CRUD operations. initPlan is computed
-- once per SQL statement, rather than calling auth.uid() for each row.
ALTER POLICY "meta optin select" ON public.meta_opt_ins
  USING (user_id=(SELECT auth.uid()));
ALTER POLICY "meta optin insert" ON public.meta_opt_ins
  WITH CHECK (user_id=(SELECT auth.uid()));
ALTER POLICY "meta optin update" ON public.meta_opt_ins
  USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()));
ALTER POLICY "meta optin delete" ON public.meta_opt_ins
  USING (user_id=(SELECT auth.uid()));
