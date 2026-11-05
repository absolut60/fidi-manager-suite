CREATE OR REPLACE FUNCTION public.elimina_lead(_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cliente_id uuid;
  _found boolean;
BEGIN
  IF NOT public.has_lead_module_access(auth.uid()) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  SELECT true, l.cliente_id INTO _found, _cliente_id
  FROM public.lead l WHERE l.id = _lead_id;

  IF NOT COALESCE(_found, false) THEN
    RAISE EXCEPTION 'Lead inesistente';
  END IF;

  IF _cliente_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lead convertito in cliente: annulla prima la conversione oppure elimina il cliente.';
  END IF;

  DELETE FROM public.contatti WHERE lead_id = _lead_id AND cliente_id IS NULL;
  UPDATE public.contatti SET lead_id = NULL WHERE lead_id = _lead_id;

  DELETE FROM public.cantieri WHERE lead_id = _lead_id AND cliente_id IS NULL;
  UPDATE public.cantieri SET lead_id = NULL WHERE lead_id = _lead_id;

  -- FM56 L1-bis: allegati del lead eliminati con il lead (quelli già passati al cliente restano)
  DELETE FROM public.allegati WHERE entita_tipo = 'lead' AND entita_id = _lead_id;

  DELETE FROM public.lead WHERE id = _lead_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.elimina_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elimina_lead(uuid) TO authenticated, service_role;

-- Elimina il lead e restituisce i percorsi dei file da cancellare dallo Storage (lo fa il server).
CREATE OR REPLACE FUNCTION public.elimina_lead_con_file(_lead_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _paths text[];
BEGIN
  SELECT COALESCE(array_agg(a.storage_path), '{}') INTO _paths
  FROM public.allegati a
  WHERE a.entita_tipo = 'lead' AND a.entita_id = _lead_id AND a.storage_path IS NOT NULL;
  PERFORM public.elimina_lead(_lead_id);
  RETURN _paths;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.elimina_lead_con_file(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elimina_lead_con_file(uuid) TO authenticated, service_role;