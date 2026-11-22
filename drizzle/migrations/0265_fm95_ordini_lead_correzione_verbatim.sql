DO $ripristino$
DECLARE
  definizione text;
BEGIN
  SELECT pg_get_functiondef('public.trasforma_preventivo_in_ordine(uuid,jsonb)'::regprocedure) INTO definizione;
  IF position('iva_importo = t.imp + t.iva - t.imp' IN definizione) = 0 THEN
    RAISE EXCEPTION 'Definizione inattesa: ripristino verbatim non applicabile';
  END IF;
  EXECUTE replace(definizione, 'iva_importo = t.imp + t.iva - t.imp', 'iva_importo = t.iva');
END;
$ripristino$;
REVOKE EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid,jsonb) TO authenticated, service_role;