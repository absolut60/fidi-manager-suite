CREATE OR REPLACE FUNCTION public.get_previsione_incassi_coperture(p_store_id uuid DEFAULT NULL::uuid, p_agente text DEFAULT NULL::text)
 RETURNS TABLE(origine text, totale_atteso numeric, n_clienti integer, n_elementi integer, scaduto_non_incassato numeric, entro_30 numeric, entro_60 numeric, entro_90 numeric, oltre_90 numeric, giorni_medi_rientro numeric, n_data_passata integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- FM47: visibilità calcolata una volta (gemello set-based di user_can_access_cliente con i campi della riga)
  WITH ctx AS MATERIALIZED (
    SELECT public.auth_ha_ruolo_globale_clienti() AS glob,
           public.has_role(auth.uid(), 'agente'::app_role) AS ag,
           (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()) AS sid,
           (SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid()) AS cod
  ),
  vis AS (
    SELECT cl.id FROM public.clienti cl, ctx
    WHERE (ctx.glob
        OR (ctx.sid IS NOT NULL AND cl.store_id = ctx.sid)
        OR (ctx.ag AND ctx.cod IS NOT NULL AND cl.codice_agente = ctx.cod))
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_agente IS NULL OR (p_agente = '__none__' AND cl.codice_agente IS NULL) OR cl.codice_agente = p_agente)
  ),
  el AS (
    SELECT 'piano'::text AS origine, p.cliente_id, r.data_rata AS d, COALESCE(r.importo, 0) AS imp
    FROM public.piani_rientro_rate r
    JOIN public.piani_rientro p ON p.id = r.piano_id AND p.stato = 'attivo'
    JOIN vis ON vis.id = p.cliente_id
    WHERE r.stato <> 'pagata'
    UNION ALL
    SELECT 'promessa', e.cliente_id, e.data_promessa, e.importo_efficace
    FROM public.promesse_attive_importo_efficace() e JOIN vis ON vis.id = e.cliente_id
  ),
  g AS (SELECT el.*, (el.d - CURRENT_DATE) AS gg FROM el),
  o AS (SELECT unnest(ARRAY['piano','promessa']) AS origine)
  SELECT o.origine,
    COALESCE(SUM(g.imp), 0), COUNT(DISTINCT g.cliente_id)::int, COUNT(g.origine)::int,
    COALESCE(SUM(g.imp) FILTER (WHERE g.gg IS NULL OR g.gg < 0), 0),
    COALESCE(SUM(g.imp) FILTER (WHERE g.gg BETWEEN 0 AND 30), 0),
    COALESCE(SUM(g.imp) FILTER (WHERE g.gg BETWEEN 31 AND 60), 0),
    COALESCE(SUM(g.imp) FILTER (WHERE g.gg BETWEEN 61 AND 90), 0),
    COALESCE(SUM(g.imp) FILTER (WHERE g.gg > 90), 0),
    ROUND(SUM(g.imp * g.gg) FILTER (WHERE g.gg >= 0) / NULLIF(SUM(g.imp) FILTER (WHERE g.gg >= 0), 0), 1),
    COUNT(*) FILTER (WHERE g.origine IS NOT NULL AND (g.gg IS NULL OR g.gg < 0))::int
  FROM o LEFT JOIN g ON g.origine = o.origine
  GROUP BY o.origine ORDER BY o.origine
$function$;

REVOKE EXECUTE ON FUNCTION public.get_previsione_incassi_coperture(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_previsione_incassi_coperture(uuid, text) TO authenticated;