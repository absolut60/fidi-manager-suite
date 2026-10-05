CREATE OR REPLACE FUNCTION public.get_clienti_lite_by_ids(_ids uuid[])
 RETURNS TABLE(id uuid, ragione_sociale text, partita_iva text, indirizzo text, cap text, citta text, provincia text, fascia_listino_default text, codice_agente text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.ragione_sociale, c.partita_iva, c.indirizzo, c.cap, c.citta, c.provincia,
         c.fascia_listino_default::text, c.codice_agente
  FROM public.clienti c
  WHERE c.id = ANY(_ids)
    AND (public.auth_ha_accesso_preventivi() OR public.user_can_access_cliente(c.id, c.store_id, c.codice_agente));
$function$;

REVOKE ALL ON FUNCTION public.get_clienti_lite_by_ids(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clienti_lite_by_ids(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_clienti_lite_by_ids(uuid[]) IS 'FM37: gemella di get_cliente_lite per più id (stessa regola di accesso). Se cambia la regola in get_cliente_lite va cambiata anche qui.';