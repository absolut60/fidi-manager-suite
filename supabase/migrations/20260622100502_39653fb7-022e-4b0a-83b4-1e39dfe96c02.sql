
-- RPC esperienza pagamento + campi rating esterno (placeholder per fase futura)

CREATE OR REPLACE FUNCTION public.get_esperienza_pagamento_cliente(_cliente_id uuid)
RETURNS TABLE(
  n_pagate bigint,
  n_in_ritardo bigint,
  pct_in_ritardo numeric,
  ritardo_medio numeric,
  max_ritardo integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH d AS (
    SELECT (data_pagamento_effettiva - data_scadenza)::int AS ritardo
    FROM public.scadenze
    WHERE cliente_id = _cliente_id
      AND data_pagamento_effettiva IS NOT NULL
      AND data_scadenza IS NOT NULL
  )
  SELECT
    COUNT(*)::bigint AS n_pagate,
    COUNT(*) FILTER (WHERE ritardo > 0)::bigint AS n_in_ritardo,
    CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE ritardo > 0)::numeric * 100.0 / COUNT(*))::numeric, 1)
      ELSE NULL END AS pct_in_ritardo,
    CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(ritardo)::numeric, 1) ELSE NULL END AS ritardo_medio,
    MAX(ritardo) AS max_ritardo
  FROM d;
$$;

-- Campi rating esterno (nullable, placeholder)
ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS rating_esterno text,
  ADD COLUMN IF NOT EXISTS rating_esterno_fonte text,
  ADD COLUMN IF NOT EXISTS rating_esterno_data date;
