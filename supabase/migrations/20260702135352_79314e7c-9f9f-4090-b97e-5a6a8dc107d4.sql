
CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mensile(_anno int)
RETURNS TABLE (
  mese int,
  dovuto numeric,
  incassato numeric,
  da_incassare numeric,
  pct numeric,
  n_scadenze bigint,
  n_pagate bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH m AS (
    SELECT generate_series(1, 12) AS mese
  ),
  agg AS (
    SELECT
      EXTRACT(MONTH FROM s.data_scadenza)::int AS mese,
      SUM(s.importo_scadenza) AS dovuto,
      SUM(CASE WHEN s.data_pagamento_effettiva IS NOT NULL AND s.importo_pagato > 0
               THEN s.importo_pagato ELSE 0 END) AS incassato,
      COUNT(*) AS n_scadenze,
      COUNT(*) FILTER (
        WHERE s.data_pagamento_effettiva IS NOT NULL AND s.importo_pagato > 0
      ) AS n_pagate
    FROM public.scadenze s
    WHERE s.data_scadenza >= make_date(_anno, 1, 1)
      AND s.data_scadenza <  make_date(_anno + 1, 1, 1)
      AND s.importo_scadenza <> 0
    GROUP BY 1
  )
  SELECT
    m.mese,
    COALESCE(agg.dovuto, 0)::numeric AS dovuto,
    COALESCE(agg.incassato, 0)::numeric AS incassato,
    GREATEST(COALESCE(agg.dovuto,0) - COALESCE(agg.incassato,0), 0)::numeric AS da_incassare,
    CASE WHEN COALESCE(agg.dovuto,0) > 0
         THEN LEAST(COALESCE(agg.incassato,0) / agg.dovuto * 100, 100)::numeric
         ELSE 0::numeric END AS pct,
    COALESCE(agg.n_scadenze, 0) AS n_scadenze,
    COALESCE(agg.n_pagate, 0) AS n_pagate
  FROM m
  LEFT JOIN agg USING (mese)
  ORDER BY m.mese;
$$;

REVOKE ALL ON FUNCTION public.get_cruscotto_incassi_mensile(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cruscotto_incassi_mensile(int) TO authenticated, service_role;
