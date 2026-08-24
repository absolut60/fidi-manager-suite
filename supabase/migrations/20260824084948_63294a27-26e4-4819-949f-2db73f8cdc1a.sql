CREATE OR REPLACE FUNCTION public.crea_o_apri_diretto(_altro_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_canale uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non autenticato';
  END IF;
  IF _altro_user_id IS NULL OR _altro_user_id = v_me THEN
    RAISE EXCEPTION 'Destinatario non valido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profili p WHERE p.id = _altro_user_id) THEN
    RAISE EXCEPTION 'Utente inesistente';
  END IF;

  SELECT c.id INTO v_canale
  FROM public.canali c
  WHERE c.tipo = 'diretto'
    AND (
      SELECT count(*) FROM public.canale_membri cm WHERE cm.canale_id = c.id
    ) = 2
    AND EXISTS (SELECT 1 FROM public.canale_membri cm WHERE cm.canale_id = c.id AND cm.user_id = v_me)
    AND EXISTS (SELECT 1 FROM public.canale_membri cm WHERE cm.canale_id = c.id AND cm.user_id = _altro_user_id)
  LIMIT 1;

  IF v_canale IS NOT NULL THEN
    RETURN v_canale;
  END IF;

  INSERT INTO public.canali (tipo, nome, area_id, store_id, created_by, attivo)
  VALUES ('diretto', NULL, NULL, NULL, v_me, true)
  RETURNING id INTO v_canale;

  INSERT INTO public.canale_membri (canale_id, user_id)
  VALUES (v_canale, v_me), (v_canale, _altro_user_id);

  RETURN v_canale;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crea_o_apri_diretto(uuid) TO authenticated, service_role;