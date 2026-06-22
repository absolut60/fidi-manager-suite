
ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS rating_esterno text,
  ADD COLUMN IF NOT EXISTS rating_esterno_fonte text,
  ADD COLUMN IF NOT EXISTS rating_esterno_data date;

DROP FUNCTION IF EXISTS public.get_esperienza_pagamento_cliente(uuid);

CREATE OR REPLACE FUNCTION public.get_esperienza_pagamento_cliente(p_cliente_id uuid)
RETURNS TABLE(
  n_pagate int,
  n_in_ritardo int,
  perc_in_ritardo numeric,
  ritardo_medio_gg numeric,
  max_ritardo_gg int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_can_access_cliente(p_cliente_id) THEN
    RAISE EXCEPTION 'Accesso negato al cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH d AS (
    SELECT (data_pagamento_effettiva - data_scadenza)::int AS ritardo
    FROM public.scadenze
    WHERE cliente_id = p_cliente_id
      AND data_pagamento_effettiva IS NOT NULL
      AND data_scadenza IS NOT NULL
      AND importo_pagato IS NOT NULL
      AND importo_pagato > 0
  )
  SELECT
    COUNT(*)::int AS n_pagate,
    COUNT(*) FILTER (WHERE ritardo > 0)::int AS n_in_ritardo,
    CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE ritardo > 0)::numeric * 100.0 / COUNT(*))::numeric, 1)
      ELSE 0::numeric END AS perc_in_ritardo,
    CASE WHEN COUNT(*) > 0
      THEN ROUND(AVG(ritardo)::numeric, 1)
      ELSE NULL END AS ritardo_medio_gg,
    COALESCE(MAX(ritardo), 0)::int AS max_ritardo_gg
  FROM d;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_esperienza_pagamento_cliente(uuid) TO authenticated;
