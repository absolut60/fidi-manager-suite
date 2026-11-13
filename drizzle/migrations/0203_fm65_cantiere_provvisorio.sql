ALTER TABLE public.cantieri ADD COLUMN provvisorio boolean NOT NULL DEFAULT false;

DROP FUNCTION public.crea_cantiere_lite(uuid, text, text, text, text);
CREATE FUNCTION public.crea_cantiere_lite(_cliente_id uuid, _nome text, _indirizzo text DEFAULT NULL::text, _citta text DEFAULT NULL::text, _provincia text DEFAULT NULL::text, _cap text DEFAULT NULL::text, _provvisorio boolean DEFAULT false)
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _new_id uuid;
BEGIN
  IF NOT (public.auth_ha_accesso_preventivi() OR (public.user_can_access_cliente(_cliente_id) AND NOT (SELECT public.auth_solo_showroom()))) THEN
    RAISE EXCEPTION 'Permesso negato per creare cantieri su questo cliente';
  END IF;
  IF _nome IS NULL OR btrim(_nome) = '' THEN
    RAISE EXCEPTION 'Il nome del cantiere è obbligatorio';
  END IF;
  IF _cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id obbligatorio';
  END IF;
  INSERT INTO public.cantieri (cliente_id, nome, indirizzo, cap, citta, provincia, attivo, provvisorio, created_by)
  VALUES (
    _cliente_id,
    btrim(_nome),
    NULLIF(btrim(COALESCE(_indirizzo,'')), ''),
    NULLIF(btrim(COALESCE(_cap,'')), ''),
    NULLIF(btrim(COALESCE(_citta,'')), ''),
    NULLIF(btrim(COALESCE(_provincia,'')), ''),
    true,
    COALESCE(_provvisorio, false),
    auth.uid()
  )
  RETURNING cantieri.id INTO _new_id;
  RETURN QUERY SELECT _new_id, btrim(_nome);
END;
$function$;
REVOKE ALL ON FUNCTION public.crea_cantiere_lite(uuid, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crea_cantiere_lite(uuid, text, text, text, text, text, boolean) TO authenticated, service_role;

DROP FUNCTION public.get_cantieri_lite(uuid);
CREATE FUNCTION public.get_cantieri_lite(_cliente_id uuid)
 RETURNS TABLE(id uuid, nome text, indirizzo text, cap text, citta text, provincia text, attivo boolean, provvisorio boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.nome, c.indirizzo, c.cap, c.citta, c.provincia, c.attivo, c.provvisorio
  FROM public.cantieri c
  WHERE c.cliente_id = _cliente_id
    AND (public.auth_ha_accesso_preventivi() OR public.user_can_access_cliente(_cliente_id))
    AND c.attivo = true
  ORDER BY c.nome;
$function$;
REVOKE ALL ON FUNCTION public.get_cantieri_lite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cantieri_lite(uuid) TO authenticated, service_role;

-- Cantiere collegato al preventivo, anche se archiviato: stesso gate di crea_cantiere_lite sul cliente del cantiere.
CREATE FUNCTION public.get_cantiere_preventivo(_id uuid)
 RETURNS TABLE(id uuid, cliente_id uuid, nome text, indirizzo text, cap text, citta text, provincia text, attivo boolean, provvisorio boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.cliente_id, c.nome, c.indirizzo, c.cap, c.citta, c.provincia, c.attivo, c.provvisorio
  FROM public.cantieri c
  WHERE c.id = _id
    AND c.cliente_id IS NOT NULL
    AND (public.auth_ha_accesso_preventivi() OR (public.user_can_access_cliente(c.cliente_id) AND NOT (SELECT public.auth_solo_showroom())));
$function$;
REVOKE ALL ON FUNCTION public.get_cantiere_preventivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cantiere_preventivo(uuid) TO authenticated, service_role;