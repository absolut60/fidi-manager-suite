DROP FUNCTION IF EXISTS public.crea_cantiere_lite(uuid, text);

CREATE OR REPLACE FUNCTION public.crea_cantiere_lite(
  _cliente_id uuid,
  _nome text,
  _indirizzo text DEFAULT NULL,
  _citta text DEFAULT NULL,
  _provincia text DEFAULT NULL
)
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
  INSERT INTO public.cantieri (cliente_id, nome, indirizzo, citta, provincia, attivo, created_by)
  VALUES (
    _cliente_id,
    btrim(_nome),
    NULLIF(btrim(COALESCE(_indirizzo,'')), ''),
    NULLIF(btrim(COALESCE(_citta,'')), ''),
    NULLIF(btrim(COALESCE(_provincia,'')), ''),
    true,
    auth.uid()
  )
  RETURNING cantieri.id INTO _new_id;
  RETURN QUERY SELECT _new_id, btrim(_nome);
END;
$$;

GRANT EXECUTE ON FUNCTION public.crea_cantiere_lite(uuid, text, text, text, text) TO authenticated, service_role, supabase_read_only_user;