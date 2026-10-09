-- Compare-and-swap quantities protect against cross-device lost updates.
-- Invoker permissions retain the authenticated user's RLS restrictions.

CREATE OR REPLACE FUNCTION public.collection_clear_atomic()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=(select auth.uid()); n integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,7654));
 DELETE FROM public.collection_items WHERE user_id=uid;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $function$
;

CREATE OR REPLACE FUNCTION public.collection_write_atomic(p_id text, p_expected integer, p_next integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=(select auth.uid()); previous integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF p_id IS NULL OR p_id !~ '^[A-Za-z0-9_-]{3,140}$'
    OR p_expected NOT BETWEEN 0 AND 99 OR p_next NOT BETWEEN 0 AND 99
 THEN RAISE EXCEPTION 'Datos de impresión inválidos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,7654));
 SELECT quantity INTO previous FROM public.collection_items
   WHERE user_id=uid AND card_id=p_id FOR UPDATE;
 previous:=coalesce(previous,0);
 IF previous<>p_expected THEN
   RAISE EXCEPTION 'La cantidad ha cambiado en otro dispositivo; recarga la colección'
     USING ERRCODE='40001';
 END IF;
 IF p_next=0 THEN
  DELETE FROM public.collection_items WHERE user_id=uid AND card_id=p_id;
 ELSE
  INSERT INTO public.collection_items(user_id,card_id,quantity,updated_at)
  VALUES(uid,p_id,p_next,now())
  ON CONFLICT(user_id,card_id) DO UPDATE
    SET quantity=excluded.quantity,updated_at=now()
    WHERE public.collection_items.quantity=p_expected;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conflicto de cantidad; recarga la colección' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN p_next;
END $function$
;

REVOKE ALL ON FUNCTION public.collection_write_atomic(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.collection_write_atomic(text,integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.collection_clear_atomic() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.collection_clear_atomic() TO authenticated;
