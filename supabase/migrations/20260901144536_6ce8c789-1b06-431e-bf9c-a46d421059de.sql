CREATE OR REPLACE FUNCTION public.get_cantieri_lite(_cliente_id uuid)
RETURNS TABLE(id uuid, nome text, indirizzo text, citta text, provincia text, attivo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.nome, c.indirizzo, c.citta, c.provincia, c.attivo
  FROM public.cantieri c
  WHERE c.cliente_id = _cliente_id
    AND (public.auth_ha_accesso_preventivi() OR public.user_can_access_cliente(_cliente_id))
    AND c.attivo = true
  ORDER BY c.nome;
$$;

GRANT EXECUTE ON FUNCTION public.get_cantieri_lite(uuid) TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.crea_cantiere_lite(_cliente_id uuid, _nome text)
RETURNS TABLE(id uuid, nome text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE _new_id uuid;
BEGIN
  IF NOT (public.auth_ha_accesso_preventivi() OR public.user_can_access_cliente(_cliente_id)) THEN
    RAISE EXCEPTION 'Permesso negato per creare cantieri su questo cliente';
  END IF;
  IF _nome IS NULL OR btrim(_nome) = '' THEN
    RAISE EXCEPTION 'Il nome del cantiere è obbligatorio';
  END IF;
  IF _cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id obbligatorio';
  END IF;
  INSERT INTO public.cantieri (cliente_id, nome, attivo, created_by)
  VALUES (_cliente_id, btrim(_nome), true, auth.uid())
  RETURNING cantieri.id INTO _new_id;
  RETURN QUERY SELECT _new_id, btrim(_nome);
END;
$$;

GRANT EXECUTE ON FUNCTION public.crea_cantiere_lite(uuid, text) TO authenticated, service_role, supabase_read_only_user;