
CREATE OR REPLACE FUNCTION public.get_dso_aggregato(
  _cliente_id uuid DEFAULT NULL,
  _store_id uuid DEFAULT NULL,
  _data_da date DEFAULT NULL,
  _data_a date DEFAULT NULL
)
RETURNS TABLE(
  dso_ponderato numeric,
  dso_medio numeric,
  dso_mediano numeric,
  n_anticipo bigint,
  n_puntuali bigint,
  n_ritardo bigint,
  n_totale bigint,
  importo_totale numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH d AS (
    SELECT
      (s.data_pagamento_effettiva - s.data_scadenza)::int AS ritardo,
      s.importo_scadenza
    FROM public.scadenze s
    LEFT JOIN public.clienti c ON c.id = s.cliente_id
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_scadenza IS NOT NULL
      AND s.importo_scadenza > 0
      AND (_cliente_id IS NULL OR s.cliente_id = _cliente_id)
      AND (_store_id IS NULL OR c.store_id = _store_id)
      AND (_data_da IS NULL OR s.data_scadenza >= _data_da)
      AND (_data_a IS NULL OR s.data_scadenza <= _data_a)
  )
  SELECT
    CASE WHEN SUM(importo_scadenza) > 0
         THEN ROUND((SUM(ritardo * importo_scadenza) / SUM(importo_scadenza))::numeric, 1)
    END,
    ROUND(AVG(ritardo)::numeric, 1),
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY ritardo)::numeric, 1),
    COUNT(*) FILTER (WHERE ritardo < 0),
    COUNT(*) FILTER (WHERE ritardo = 0),
    COUNT(*) FILTER (WHERE ritardo > 0),
    COUNT(*),
    COALESCE(SUM(importo_scadenza), 0)
  FROM d;
$$;

CREATE OR REPLACE FUNCTION public.get_dso_serie_mensile(
  _cliente_id uuid DEFAULT NULL,
  _store_id uuid DEFAULT NULL,
  _mesi_indietro int DEFAULT 24
)
RETURNS TABLE(
  mese date,
  dso_ponderato numeric,
  n_scadenze bigint,
  importo_totale numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH d AS (
    SELECT
      date_trunc('month', s.data_scadenza)::date AS mese,
      (s.data_pagamento_effettiva - s.data_scadenza)::int AS ritardo,
      s.importo_scadenza
    FROM public.scadenze s
    LEFT JOIN public.clienti c ON c.id = s.cliente_id
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_scadenza IS NOT NULL
      AND s.importo_scadenza > 0
      AND s.data_scadenza >= (date_trunc('month', CURRENT_DATE) - (_mesi_indietro || ' months')::interval)::date
      AND (_cliente_id IS NULL OR s.cliente_id = _cliente_id)
      AND (_store_id IS NULL OR c.store_id = _store_id)
  )
  SELECT
    mese,
    CASE WHEN SUM(importo_scadenza) > 0
         THEN ROUND((SUM(ritardo * importo_scadenza) / SUM(importo_scadenza))::numeric, 1)
    END,
    COUNT(*),
    SUM(importo_scadenza)
  FROM d
  GROUP BY mese
  ORDER BY mese;
$$;

GRANT EXECUTE ON FUNCTION public.get_dso_aggregato(uuid, uuid, date, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_dso_serie_mensile(uuid, uuid, int) TO authenticated, anon;
