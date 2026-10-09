-- Restore-safe additive persistence migration. Backup prior to migration:
-- GitHub backup-massive-before-audit-2026-10-09, Supabase audit_backup_massive_20261009.
CREATE TABLE IF NOT EXISTS public.deck_tombstones(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 deck_id uuid NOT NULL,
 deleted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,deck_id)
);
ALTER TABLE public.deck_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deck_tombstones FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.deck_tombstones TO authenticated;
DROP POLICY IF EXISTS deck_tombstones_read ON public.deck_tombstones;
CREATE POLICY deck_tombstones_read ON public.deck_tombstones FOR SELECT TO authenticated USING(user_id=(select auth.uid()));
DROP POLICY IF EXISTS deck_tombstones_insert ON public.deck_tombstones;
CREATE POLICY deck_tombstones_insert ON public.deck_tombstones FOR INSERT TO authenticated WITH CHECK(user_id=(select auth.uid()));

CREATE OR REPLACE FUNCTION public.collection_replace_atomic(p_cards jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=(select auth.uid()); entry record; total integer; cnt integer:=0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
  IF p_cards IS NULL OR jsonb_typeof(p_cards)<>'object' THEN RAISE EXCEPTION 'CSV inválido'; END IF;
  total:=(select count(*) from jsonb_object_keys(p_cards));
  IF total>20000 THEN RAISE EXCEPTION 'Demasiadas impresiones'; END IF;
  FOR entry IN SELECT key,value FROM jsonb_each_text(p_cards) LOOP
    IF length(entry.key)>140 OR entry.key !~ '^[A-Za-z0-9_-]{3,140}$'
      OR entry.value !~ '^[0-9]{1,2}$' OR entry.value::int NOT BETWEEN 1 AND 99
    THEN RAISE EXCEPTION 'Impresión o cantidad no válida: %', entry.key; END IF;
    cnt:=cnt+1;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,7654));
  DELETE FROM public.collection_items WHERE user_id=uid;
  INSERT INTO public.collection_items(user_id,card_id,quantity,updated_at)
    SELECT uid,key,value::int,now() FROM jsonb_each_text(p_cards);
  RETURN cnt;
END $function$
;

CREATE OR REPLACE FUNCTION public.deck_delete_all_atomic()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=(select auth.uid()); n integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 INSERT INTO public.deck_tombstones(user_id,deck_id)
   SELECT user_id,id FROM public.decks WHERE user_id=uid
 ON CONFLICT(user_id,deck_id) DO UPDATE SET deleted_at=now();
 DELETE FROM public.decks WHERE user_id=uid;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $function$
;

CREATE OR REPLACE FUNCTION public.deck_delete_atomic(p_deck_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=(select auth.uid());
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_deck_id::text,1234));
 IF NOT EXISTS(SELECT 1 FROM public.decks WHERE id=p_deck_id AND user_id=uid)
 THEN RAISE EXCEPTION 'Mazo no encontrado'; END IF;
 INSERT INTO public.deck_tombstones(user_id,deck_id) VALUES(uid,p_deck_id)
 ON CONFLICT(user_id,deck_id) DO UPDATE SET deleted_at=now();
 DELETE FROM public.decks WHERE id=p_deck_id AND user_id=uid;
END $function$
;

CREATE OR REPLACE FUNCTION public.deck_save_atomic(p_deck_id uuid, p_name text, p_leader text, p_description text, p_colors text[], p_cards jsonb, p_updated_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=(select auth.uid()); entry record; cnt int:=0;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF p_deck_id IS NULL OR length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120
   OR length(coalesce(p_description,''))>2000
   OR p_cards IS NULL OR jsonb_typeof(p_cards)<>'object'
   OR p_updated_at IS NULL OR p_updated_at>now()+interval '5 minutes'
 THEN RAISE EXCEPTION 'Datos de mazo inválidos'; END IF;
 FOR entry IN SELECT key,value FROM jsonb_each_text(p_cards) LOOP
   IF length(entry.key)>140 OR entry.key !~ '^[A-Za-z0-9_-]{3,140}$'
      OR entry.value !~ '^[1-4]$'
   THEN RAISE EXCEPTION 'Carta del mazo inválida: %',entry.key; END IF;
   cnt:=cnt+1;
 END LOOP;
 IF cnt>100 THEN RAISE EXCEPTION 'El mazo supera el máximo de entradas'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_deck_id::text,1234));
 IF EXISTS(SELECT 1 FROM public.deck_tombstones WHERE deck_id=p_deck_id AND user_id=uid)
   THEN RAISE EXCEPTION 'Mazo eliminado: recarga tus mazos antes de editar'; END IF;
 INSERT INTO public.decks(id,user_id,name,leader_card_id,description,colors,updated_at)
 VALUES (p_deck_id,uid,trim(p_name),nullif(p_leader,''),coalesce(p_description,''),coalesce(p_colors,'{}'::text[]),p_updated_at)
 ON CONFLICT(id) DO UPDATE SET
   name=excluded.name,leader_card_id=excluded.leader_card_id,
   description=excluded.description,colors=excluded.colors,updated_at=excluded.updated_at
 WHERE public.decks.user_id=uid AND public.decks.updated_at<=excluded.updated_at;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mazo modificado en otro dispositivo; recarga para evitar sobrescribirlo'; END IF;
 DELETE FROM public.deck_cards WHERE deck_id=p_deck_id;
 INSERT INTO public.deck_cards(deck_id,card_id,quantity)
 SELECT p_deck_id,key,value::int FROM jsonb_each_text(p_cards);
END $function$
;

REVOKE ALL ON FUNCTION public.collection_replace_atomic(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.collection_replace_atomic(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.deck_save_atomic(uuid,text,text,text,text[],jsonb,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.deck_save_atomic(uuid,text,text,text,text[],jsonb,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.deck_delete_atomic(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.deck_delete_atomic(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.deck_delete_all_atomic() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.deck_delete_all_atomic() TO authenticated;
