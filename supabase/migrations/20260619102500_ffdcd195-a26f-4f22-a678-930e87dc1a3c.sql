
ALTER TABLE public.scadenze
  ADD COLUMN IF NOT EXISTS importo_pagato numeric,
  ADD COLUMN IF NOT EXISTS importo_residuo numeric,
  ADD COLUMN IF NOT EXISTS importo_effetto_orig numeric;

COMMENT ON COLUMN public.scadenze.importo_pagato IS 'DSO only: quota realmente incassata alla data_pagamento_effettiva. Non usare per scaduto.';
COMMENT ON COLUMN public.scadenze.importo_residuo IS 'DSO only: quota ancora da incassare (effetto_orig - pagato).';
COMMENT ON COLUMN public.scadenze.importo_effetto_orig IS 'DSO only: importo originale effetto.';

DROP FUNCTION IF EXISTS public.get_dso_aggregato(uuid, uuid, date, date);

CREATE FUNCTION public.get_dso_aggregato(
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
   importo_totale numeric,
   importo_anticipo numeric,
   importo_puntuali numeric,
   importo_ritardo numeric
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH d AS (
    SELECT
      (s.data_pagamento_effettiva - s.data_scadenza)::int AS ritardo,
      COALESCE(s.importo_pagato, s.importo_scadenza) AS peso
    FROM public.scadenze s
    LEFT JOIN public.clienti c ON c.id = s.cliente_id
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_scadenza IS NOT NULL
      AND COALESCE(s.importo_pagato, s.importo_scadenza) > 0
      AND (_cliente_id IS NULL OR s.cliente_id = _cliente_id)
      AND (_store_id IS NULL OR c.store_id = _store_id)
      AND (_data_da IS NULL OR s.data_scadenza >= _data_da)
      AND (_data_a IS NULL OR s.data_scadenza <= _data_a)
  )
  SELECT
    CASE WHEN SUM(peso) > 0
         THEN ROUND((SUM(ritardo * peso) / SUM(peso))::numeric, 1)
    END,
    ROUND(AVG(ritardo)::numeric, 1),
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY ritardo)::numeric, 1),
    COUNT(*) FILTER (WHERE ritardo < 0),
    COUNT(*) FILTER (WHERE ritardo = 0),
    COUNT(*) FILTER (WHERE ritardo > 0),
    COUNT(*),
    COALESCE(SUM(peso), 0),
    COALESCE(SUM(peso) FILTER (WHERE ritardo < 0), 0),
    COALESCE(SUM(peso) FILTER (WHERE ritardo = 0), 0),
    COALESCE(SUM(peso) FILTER (WHERE ritardo > 0), 0)
  FROM d;
$function$;

CREATE OR REPLACE FUNCTION public.get_dso_serie_mensile(
  _cliente_id uuid DEFAULT NULL,
  _store_id uuid DEFAULT NULL,
  _mesi_indietro integer DEFAULT 24
)
 RETURNS TABLE(mese date, dso_ponderato numeric, n_scadenze bigint, importo_totale numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH d AS (
    SELECT
      date_trunc('month', s.data_scadenza)::date AS mese,
      (s.data_pagamento_effettiva - s.data_scadenza)::int AS ritardo,
      COALESCE(s.importo_pagato, s.importo_scadenza) AS peso
    FROM public.scadenze s
    LEFT JOIN public.clienti c ON c.id = s.cliente_id
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_scadenza IS NOT NULL
      AND COALESCE(s.importo_pagato, s.importo_scadenza) > 0
      AND s.data_scadenza >= (date_trunc('month', CURRENT_DATE) - (_mesi_indietro || ' months')::interval)::date
      AND (_cliente_id IS NULL OR s.cliente_id = _cliente_id)
      AND (_store_id IS NULL OR c.store_id = _store_id)
  )
  SELECT
    mese,
    CASE WHEN SUM(peso) > 0
         THEN ROUND((SUM(ritardo * peso) / SUM(peso))::numeric, 1)
    END,
    COUNT(*),
    SUM(peso)
  FROM d
  GROUP BY mese
  ORDER BY mese;
$function$;
