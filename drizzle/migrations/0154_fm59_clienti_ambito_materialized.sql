CREATE OR REPLACE FUNCTION public.clienti_ambito_utente_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH x AS MATERIALIZED (
    SELECT public.profilo_store_id_corrente() AS s, public.agente_codice_corrente() AS a
  )
  SELECT c.id FROM public.clienti c, x
  WHERE (c.store_id IS NOT NULL AND c.store_id = x.s)
     OR (c.codice_agente IS NOT NULL AND c.codice_agente = x.a)
$function$;

COMMENT ON FUNCTION public.clienti_ambito_utente_ids() IS 'FM44: id dei clienti visibili per ambito (negozio/agente) all''utente corrente. Gemello documentato del ramo negozio/agente di user_can_access_cliente: se cambia una, cambia l''altra. FM59: negozio e codice agente dell''utente sono calcolati una sola volta in una CTE MATERIALIZED, per evitare la rivalutazione per ogni riga di clienti (~750 ms -> ~40 ms).';

REVOKE EXECUTE ON FUNCTION public.clienti_ambito_utente_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clienti_ambito_utente_ids() TO authenticated, service_role;