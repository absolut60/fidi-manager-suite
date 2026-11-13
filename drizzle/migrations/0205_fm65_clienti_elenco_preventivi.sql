CREATE FUNCTION public.get_clienti_elenco_preventivi(_ids uuid[])
 RETURNS TABLE(id uuid, ragione_sociale text, codice_gestionale text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.ragione_sociale, c.codice_gestionale
  FROM public.clienti c
  WHERE c.id = ANY(_ids)
    AND (public.auth_ha_accesso_preventivi()
         OR public.user_can_access_cliente(c.id, c.store_id, c.codice_agente)
         OR EXISTS (SELECT 1 FROM public.preventivi p WHERE p.cliente_id = c.id
                    AND public.auth_vede_preventivo(p.agente_codice, p.cliente_id, p.cantiere_id)));
$function$;
REVOKE ALL ON FUNCTION public.get_clienti_elenco_preventivi(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clienti_elenco_preventivi(uuid[]) TO authenticated, service_role;