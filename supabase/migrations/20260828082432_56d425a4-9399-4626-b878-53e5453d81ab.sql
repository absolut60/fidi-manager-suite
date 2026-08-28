CREATE INDEX IF NOT EXISTS idx_scadenze_cliente_id ON public.scadenze (cliente_id);
CREATE INDEX IF NOT EXISTS idx_scadenze_data_scadenza ON public.scadenze (data_scadenza);

CREATE OR REPLACE FUNCTION public.get_clienti_scadenziario()
 RETURNS TABLE(cliente_id uuid, totale_scaduto numeric, totale_a_scadere numeric, ha_scaduto boolean, ha_a_scadere boolean)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ctx AS (
    SELECT
      (
        public.auth_ha_ruolo_globale_clienti()
        OR (auth.uid() IS NULL AND coalesce(current_setting('role', true), '') = 'service_role')
      ) AS glob,
      public.has_role(auth.uid(), 'agente'::app_role) AS ag,
      (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()) AS store_id,
      (SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid()) AS cod
  ),
  vis AS (
    SELECT c.id
    FROM public.clienti c, ctx
    WHERE ctx.glob
       OR (ctx.store_id IS NOT NULL AND c.store_id = ctx.store_id)
       OR (ctx.ag AND ctx.cod IS NOT NULL AND c.codice_agente = ctx.cod)
  ),
  cls AS (
    SELECT s.cliente_id AS cli_id, s.importo_scadenza,
      public.is_anticipo(s.numero_documento) AS is_anticipo,
      CASE
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE THEN 'scaduto'
        WHEN s.data_pagamento_effettiva IS NOT NULL THEN 'pagato'
        WHEN s.data_scadenza IS NOT NULL AND s.data_scadenza >= CURRENT_DATE THEN 'a_scadere'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NULL THEN
          CASE WHEN COALESCE(s.giorni_ritardo, 0) > 0 THEN 'scaduto' ELSE 'a_scadere' END
        ELSE 'pagato'
      END AS categoria
    FROM public.scadenze s
    WHERE s.cliente_id IS NOT NULL
      AND s.cliente_id IN (SELECT id FROM vis)
  ),
  per AS (
    SELECT c.cli_id,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.categoria='scaduto' AND NOT c.is_anticipo), 0) AS ssa,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.categoria='scaduto' AND c.is_anticipo), 0) AS ant,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.categoria='a_scadere'), 0) AS a_scad,
      bool_or(c.categoria='scaduto') AS has_s,
      bool_or(c.categoria='a_scadere') AS has_a
    FROM cls c GROUP BY c.cli_id
  )
  SELECT p.cli_id, public.calcola_scaduto(p.ssa, p.ant), p.a_scad, p.has_s, p.has_a FROM per p;
$function$;

REVOKE ALL ON FUNCTION public.get_clienti_scadenziario() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clienti_scadenziario() TO authenticated, service_role;