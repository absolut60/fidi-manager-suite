CREATE OR REPLACE FUNCTION public.elimina_canale(_canale_id uuid)
RETURNS TABLE(storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo text;
  v_created_by uuid;
  v_is_admin boolean := has_role(auth.uid(), 'amministratore'::app_role);
BEGIN
  SELECT c.tipo::text, c.created_by INTO v_tipo, v_created_by
  FROM public.canali c WHERE c.id = _canale_id;

  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'Canale inesistente';
  END IF;

  IF v_tipo = 'task' THEN
    RAISE EXCEPTION 'I canali dei task non sono eliminabili da qui';
  END IF;

  IF NOT (v_is_admin OR v_created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Non autorizzato a eliminare questo canale';
  END IF;

  RETURN QUERY
  SELECT a.storage_path
  FROM public.allegati a
  WHERE a.entita_tipo = 'messaggio'
    AND a.entita_id IN (SELECT m.id FROM public.messaggi m WHERE m.canale_id = _canale_id);

  DELETE FROM public.allegati
  WHERE entita_tipo = 'messaggio'
    AND entita_id IN (SELECT m.id FROM public.messaggi m WHERE m.canale_id = _canale_id);

  DELETE FROM public.messaggi WHERE canale_id = _canale_id;
  DELETE FROM public.canale_membri WHERE canale_id = _canale_id;
  DELETE FROM public.canali WHERE id = _canale_id;

  RETURN;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.elimina_canale(uuid) TO authenticated, service_role;