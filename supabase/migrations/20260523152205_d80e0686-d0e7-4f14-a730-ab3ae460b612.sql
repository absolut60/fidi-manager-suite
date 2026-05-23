CREATE OR REPLACE FUNCTION public.get_clienti_scadenziario()
RETURNS TABLE(cliente_id uuid, totale_scaduto numeric, totale_a_scadere numeric, ha_scaduto boolean, ha_a_scadere boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH cls AS (
    SELECT
      s.cliente_id,
      s.importo_scadenza,
      CASE
        -- 1. tempi_scadenza ha priorità assoluta
        WHEN lower(coalesce(s.tempi_scadenza, '')) LIKE '%a scadere%' THEN 'a_scadere'
        WHEN lower(coalesce(s.tempi_scadenza, '')) LIKE '%scadut%' THEN 'scaduto'
        WHEN lower(coalesce(s.tempi_scadenza, '')) LIKE '%pagat%' THEN 'pagato'
        -- 2. Fallback su stato_contabile + giorni_ritardo
        WHEN s.stato_contabile = 'Aperta' AND COALESCE(s.giorni_ritardo, 0) > 0 THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' AND COALESCE(s.giorni_ritardo, 0) <= 0 THEN 'a_scadere'
        ELSE 'pagato'
      END AS categoria
    FROM public.scadenze s
  )
  SELECT
    cliente_id,
    COALESCE(SUM(importo_scadenza) FILTER (WHERE categoria = 'scaduto'), 0) AS totale_scaduto,
    COALESCE(SUM(importo_scadenza) FILTER (WHERE categoria = 'a_scadere'), 0) AS totale_a_scadere,
    bool_or(categoria = 'scaduto') AS ha_scaduto,
    bool_or(categoria = 'a_scadere') AS ha_a_scadere
  FROM cls
  GROUP BY cliente_id;
$function$;