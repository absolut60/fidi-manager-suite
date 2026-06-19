
-- DSO ridefinito: teorico (scadenza - documento) vs reale (pagamento - documento)
-- Due viste: ALL (tutto) e CREDIT (solo teorico>0)
DROP FUNCTION IF EXISTS public.get_dso_aggregato(uuid, uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_dso_aggregato(
  _cliente_id uuid DEFAULT NULL,
  _store_id uuid DEFAULT NULL,
  _data_da date DEFAULT NULL,
  _data_a date DEFAULT NULL
)
RETURNS TABLE(
  -- vista A: TUTTO
  all_teorico_pond numeric, all_teorico_medio numeric,
  all_reale_pond numeric, all_reale_medio numeric,
  all_scollamento_pond numeric, all_scollamento_medio numeric,
  all_n bigint, all_importo numeric,
  -- vista B: SOLO A CREDITO (teorico > 0)
  cred_teorico_pond numeric, cred_teorico_medio numeric,
  cred_reale_pond numeric, cred_reale_medio numeric,
  cred_scollamento_pond numeric, cred_scollamento_medio numeric,
  cred_n bigint, cred_importo numeric,
  -- distribuzione (su tutto, per retro-compatibilità)
  n_anticipo bigint, n_puntuali bigint, n_ritardo bigint,
  importo_anticipo numeric, importo_puntuali numeric, importo_ritardo numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH d AS (
    SELECT
      (s.data_scadenza - s.data_documento)::int AS teorico,
      (s.data_pagamento_effettiva - s.data_documento)::int AS reale,
      (s.data_pagamento_effettiva - s.data_scadenza)::int AS ritardo,
      COALESCE(s.importo_pagato, s.importo_scadenza) AS peso
    FROM public.scadenze s
    LEFT JOIN public.clienti c ON c.id = s.cliente_id
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_scadenza IS NOT NULL
      AND s.data_documento IS NOT NULL
      AND COALESCE(s.importo_pagato, s.importo_scadenza) > 0
      AND (_cliente_id IS NULL OR s.cliente_id = _cliente_id)
      AND (_store_id IS NULL OR c.store_id = _store_id)
      AND (_data_da IS NULL OR s.data_scadenza >= _data_da)
      AND (_data_a IS NULL OR s.data_scadenza <= _data_a)
  )
  SELECT
    -- ALL
    CASE WHEN SUM(peso)>0 THEN ROUND((SUM(teorico*peso)/SUM(peso))::numeric,1) END,
    ROUND(AVG(teorico)::numeric,1),
    CASE WHEN SUM(peso)>0 THEN ROUND((SUM(reale*peso)/SUM(peso))::numeric,1) END,
    ROUND(AVG(reale)::numeric,1),
    CASE WHEN SUM(peso)>0 THEN ROUND((SUM((reale-teorico)*peso)/SUM(peso))::numeric,1) END,
    ROUND(AVG(reale-teorico)::numeric,1),
    COUNT(*), COALESCE(SUM(peso),0),
    -- CREDIT (teorico > 0)
    CASE WHEN SUM(peso) FILTER (WHERE teorico>0)>0
      THEN ROUND((SUM(teorico*peso) FILTER (WHERE teorico>0)/SUM(peso) FILTER (WHERE teorico>0))::numeric,1) END,
    ROUND(AVG(teorico) FILTER (WHERE teorico>0)::numeric,1),
    CASE WHEN SUM(peso) FILTER (WHERE teorico>0)>0
      THEN ROUND((SUM(reale*peso) FILTER (WHERE teorico>0)/SUM(peso) FILTER (WHERE teorico>0))::numeric,1) END,
    ROUND(AVG(reale) FILTER (WHERE teorico>0)::numeric,1),
    CASE WHEN SUM(peso) FILTER (WHERE teorico>0)>0
      THEN ROUND((SUM((reale-teorico)*peso) FILTER (WHERE teorico>0)/SUM(peso) FILTER (WHERE teorico>0))::numeric,1) END,
    ROUND(AVG(reale-teorico) FILTER (WHERE teorico>0)::numeric,1),
    COUNT(*) FILTER (WHERE teorico>0),
    COALESCE(SUM(peso) FILTER (WHERE teorico>0),0),
    -- distribuzione su tutto (ritardo vs scadenza)
    COUNT(*) FILTER (WHERE ritardo<0),
    COUNT(*) FILTER (WHERE ritardo=0),
    COUNT(*) FILTER (WHERE ritardo>0),
    COALESCE(SUM(peso) FILTER (WHERE ritardo<0),0),
    COALESCE(SUM(peso) FILTER (WHERE ritardo=0),0),
    COALESCE(SUM(peso) FILTER (WHERE ritardo>0),0)
  FROM d;
$$;

-- Serie mensile: teorico + reale (ponderati), entrambe le viste
DROP FUNCTION IF EXISTS public.get_dso_serie_mensile(uuid, uuid, integer);
CREATE OR REPLACE FUNCTION public.get_dso_serie_mensile(
  _cliente_id uuid DEFAULT NULL,
  _store_id uuid DEFAULT NULL,
  _mesi_indietro integer DEFAULT 24
)
RETURNS TABLE(
  mese date,
  all_teorico numeric, all_reale numeric,
  cred_teorico numeric, cred_reale numeric,
  n_scadenze bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH d AS (
    SELECT
      date_trunc('month', s.data_scadenza)::date AS mese,
      (s.data_scadenza - s.data_documento)::int AS teorico,
      (s.data_pagamento_effettiva - s.data_documento)::int AS reale,
      COALESCE(s.importo_pagato, s.importo_scadenza) AS peso
    FROM public.scadenze s
    LEFT JOIN public.clienti c ON c.id = s.cliente_id
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_scadenza IS NOT NULL
      AND s.data_documento IS NOT NULL
      AND COALESCE(s.importo_pagato, s.importo_scadenza) > 0
      AND s.data_scadenza >= (date_trunc('month', CURRENT_DATE) - (_mesi_indietro || ' months')::interval)::date
      AND (_cliente_id IS NULL OR s.cliente_id = _cliente_id)
      AND (_store_id IS NULL OR c.store_id = _store_id)
  )
  SELECT mese,
    CASE WHEN SUM(peso)>0 THEN ROUND((SUM(teorico*peso)/SUM(peso))::numeric,1) END,
    CASE WHEN SUM(peso)>0 THEN ROUND((SUM(reale*peso)/SUM(peso))::numeric,1) END,
    CASE WHEN SUM(peso) FILTER (WHERE teorico>0)>0
      THEN ROUND((SUM(teorico*peso) FILTER (WHERE teorico>0)/SUM(peso) FILTER (WHERE teorico>0))::numeric,1) END,
    CASE WHEN SUM(peso) FILTER (WHERE teorico>0)>0
      THEN ROUND((SUM(reale*peso) FILTER (WHERE teorico>0)/SUM(peso) FILTER (WHERE teorico>0))::numeric,1) END,
    COUNT(*)
  FROM d
  GROUP BY mese
  ORDER BY mese;
$$;
