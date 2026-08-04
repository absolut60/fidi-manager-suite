CREATE OR REPLACE FUNCTION public.elimina_lead(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cliente_id uuid;
  _found boolean;
BEGIN
  IF NOT public.can_access_lead(auth.uid()) THEN
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

  DELETE FROM public.lead WHERE id = _lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.elimina_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elimina_lead(uuid) TO authenticated;