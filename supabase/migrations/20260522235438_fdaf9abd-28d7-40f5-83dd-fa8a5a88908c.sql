CREATE OR REPLACE FUNCTION public.get_clienti_scadenziario()
RETURNS TABLE(
  cliente_id uuid,
  totale_scaduto numeric,
  totale_a_scadere numeric,
  ha_scaduto boolean,
  ha_a_scadere boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.cliente_id,
    COALESCE(SUM(s.importo_scadenza) FILTER (WHERE COALESCE(s.giorni_ritardo, 0) > 0), 0) AS totale_scaduto,
    COALESCE(SUM(s.importo_scadenza) FILTER (WHERE COALESCE(s.giorni_ritardo, 0) <= 0), 0) AS totale_a_scadere,
    bool_or(COALESCE(s.giorni_ritardo, 0) > 0) AS ha_scaduto,
    bool_or(COALESCE(s.giorni_ritardo, 0) <= 0) AS ha_a_scadere
  FROM public.scadenze s
  WHERE s.stato_contabile = 'Aperta'
  GROUP BY s.cliente_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_clienti_scadenziario() TO authenticated;