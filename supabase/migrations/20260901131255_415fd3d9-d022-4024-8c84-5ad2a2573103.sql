CREATE OR REPLACE FUNCTION public.get_clienti_lite_search(_q text)
RETURNS TABLE(id uuid, ragione_sociale text, partita_iva text, indirizzo text, cap text, citta text, provincia text, fascia_listino_default text, codice_agente text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.ragione_sociale, c.partita_iva, c.indirizzo, c.cap, c.citta, c.provincia,
         c.fascia_listino_default::text, c.codice_agente
  FROM public.clienti c
  WHERE
    (public.auth_ha_accesso_preventivi() OR public.user_can_access_cliente(c.id, c.store_id, c.codice_agente))
    AND (
      _q IS NULL OR _q = '' OR
      c.ragione_sociale ILIKE '%'||_q||'%' OR
      c.partita_iva ILIKE '%'||_q||'%'
    )
  ORDER BY c.ragione_sociale
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_clienti_lite_search(text) TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.get_cliente_lite(_id uuid)
RETURNS TABLE(id uuid, ragione_sociale text, partita_iva text, indirizzo text, cap text, citta text, provincia text, fascia_listino_default text, codice_agente text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.ragione_sociale, c.partita_iva, c.indirizzo, c.cap, c.citta, c.provincia,
         c.fascia_listino_default::text, c.codice_agente
  FROM public.clienti c
  WHERE c.id = _id
    AND (public.auth_ha_accesso_preventivi() OR public.user_can_access_cliente(c.id, c.store_id, c.codice_agente));
$$;

GRANT EXECUTE ON FUNCTION public.get_cliente_lite(uuid) TO authenticated, service_role, supabase_read_only_user;