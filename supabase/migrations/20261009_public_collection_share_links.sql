-- Public collection links are strictly opt-in and read-only.
CREATE TABLE IF NOT EXISTS public.collection_share_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_slug text NOT NULL UNIQUE CHECK (share_slug ~ '^[a-f0-9]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.collection_share_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.collection_share_links FROM anon,authenticated;
GRANT SELECT,INSERT,DELETE ON TABLE public.collection_share_links TO authenticated;
DROP POLICY IF EXISTS collection_share_owner_select ON public.collection_share_links;
CREATE POLICY collection_share_owner_select ON public.collection_share_links
  FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS collection_share_owner_insert ON public.collection_share_links;
CREATE POLICY collection_share_owner_insert ON public.collection_share_links
  FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS collection_share_owner_delete ON public.collection_share_links;
CREATE POLICY collection_share_owner_delete ON public.collection_share_links
  FOR DELETE TO authenticated USING (user_id=(SELECT auth.uid()));

-- No user_id, email or username is ever returned; the anonymous caller needs
-- a 128-bit random slug to access only the deliberately published holdings.
CREATE OR REPLACE FUNCTION public.public_collection_snapshot(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE owner_id uuid; holdings jsonb;
BEGIN
  IF p_slug IS NULL OR p_slug !~ '^[a-f0-9]{32}$' THEN RETURN NULL; END IF;
  SELECT s.user_id INTO owner_id FROM public.collection_share_links s WHERE s.share_slug=p_slug;
  IF owner_id IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',items.card_id,'quantity',items.quantity)
     ORDER BY items.card_id),'[]'::jsonb) INTO holdings
  FROM (SELECT c.card_id,c.quantity FROM public.collection_items c
    WHERE c.user_id=owner_id AND c.quantity>0 ORDER BY c.card_id LIMIT 20000) AS items;
  RETURN jsonb_build_object('cards',holdings);
END;
$$;
REVOKE ALL ON FUNCTION public.public_collection_snapshot(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.public_collection_snapshot(text) TO anon,authenticated;
