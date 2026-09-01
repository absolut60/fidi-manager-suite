CREATE OR REPLACE FUNCTION public.anteprima_numero_preventivo(p_anno integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base integer := CASE WHEN p_anno = 2026 THEN 100 ELSE 1 END;
  v_suffix text := lpad((p_anno % 100)::text, 2, '0');
  v_max_doc integer;
  v_cont integer;
BEGIN
  IF NOT public.auth_ha_accesso_preventivi() THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT COALESCE(MAX((regexp_replace(numero, '^PRV-([0-9]+)/[0-9]+$', '\1'))::integer), 0)
    INTO v_max_doc FROM public.preventivi
   WHERE numero ~ ('^PRV-[0-9]+/' || v_suffix || '$');
  SELECT COALESCE(ultimo_numero, 0) INTO v_cont
    FROM public.contatori_preventivo WHERE anno = p_anno AND tipo = 'preventivo';
  RETURN GREATEST(v_base, v_max_doc + 1, COALESCE(v_cont, 0) + 1);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.anteprima_numero_preventivo(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anteprima_numero_preventivo(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.anteprima_numero_preventivo(integer) TO supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.prossimo_numero_preventivo(p_anno integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base integer := CASE WHEN p_anno = 2026 THEN 100 ELSE 1 END;
  v_suffix text := lpad((p_anno % 100)::text, 2, '0');
  v_max_doc integer;
  v_next integer;
BEGIN
  IF NOT public.auth_ha_accesso_preventivi() THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT COALESCE(MAX((regexp_replace(numero, '^PRV-([0-9]+)/[0-9]+$', '\1'))::integer), 0)
    INTO v_max_doc FROM public.preventivi
   WHERE numero ~ ('^PRV-[0-9]+/' || v_suffix || '$');
  INSERT INTO public.contatori_preventivo (anno, tipo, ultimo_numero)
  VALUES (p_anno, 'preventivo', GREATEST(v_base, v_max_doc + 1))
  ON CONFLICT (anno, tipo) DO UPDATE
    SET ultimo_numero = GREATEST(public.contatori_preventivo.ultimo_numero + 1, v_base, v_max_doc + 1)
  RETURNING ultimo_numero INTO v_next;
  RETURN v_next;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.prossimo_numero_preventivo(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prossimo_numero_preventivo(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prossimo_numero_preventivo(integer) TO supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.anteprima_numero_ordine(p_anno integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base integer := CASE WHEN p_anno = 2026 THEN 100 ELSE 1 END;
  v_suffix text := lpad((p_anno % 100)::text, 2, '0');
  v_max_doc integer;
  v_cont integer;
BEGIN
  IF NOT public.auth_ha_accesso_preventivi() THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT COALESCE(MAX((regexp_replace(numero, '^ORD-([0-9]+)/[0-9]+$', '\1'))::integer), 0)
    INTO v_max_doc FROM public.preventivi
   WHERE numero ~ ('^ORD-[0-9]+/' || v_suffix || '$');
  SELECT COALESCE(ultimo_numero, 0) INTO v_cont
    FROM public.contatori_preventivo WHERE anno = p_anno AND tipo = 'ordine';
  RETURN GREATEST(v_base, v_max_doc + 1, COALESCE(v_cont, 0) + 1);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.anteprima_numero_ordine(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anteprima_numero_ordine(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.anteprima_numero_ordine(integer) TO supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.prossimo_numero_ordine(p_anno integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base integer := CASE WHEN p_anno = 2026 THEN 100 ELSE 1 END;
  v_suffix text := lpad((p_anno % 100)::text, 2, '0');
  v_max_doc integer;
  v_next integer;
BEGIN
  IF NOT public.auth_ha_accesso_preventivi() THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT COALESCE(MAX((regexp_replace(numero, '^ORD-([0-9]+)/[0-9]+$', '\1'))::integer), 0)
    INTO v_max_doc FROM public.preventivi
   WHERE numero ~ ('^ORD-[0-9]+/' || v_suffix || '$');
  INSERT INTO public.contatori_preventivo (anno, tipo, ultimo_numero)
  VALUES (p_anno, 'ordine', GREATEST(v_base, v_max_doc + 1))
  ON CONFLICT (anno, tipo) DO UPDATE
    SET ultimo_numero = GREATEST(public.contatori_preventivo.ultimo_numero + 1, v_base, v_max_doc + 1)
  RETURNING ultimo_numero INTO v_next;
  RETURN v_next;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.prossimo_numero_ordine(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prossimo_numero_ordine(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prossimo_numero_ordine(integer) TO supabase_read_only_user;