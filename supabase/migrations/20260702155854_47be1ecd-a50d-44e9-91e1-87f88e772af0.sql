
DROP FUNCTION IF EXISTS public.get_cruscotto_incassi_mensile(integer);

CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mensile(_anno integer)
RETURNS TABLE(
  mese integer,
  dovuto numeric,
  incassato numeric,
  scaduto numeric,
  a_scadere numeric,
  scaduto_riba numeric,
  a_scadere_riba numeric,
  da_incassare numeric,
  pct numeric,
  n_scadenze bigint,
  n_pagate bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH m AS (SELECT generate_series(1, 12) AS mese),
  righe AS (
    SELECT
      EXTRACT(MONTH FROM s.data_scadenza)::int AS mese,
      s.importo_scadenza,
      s.importo_pagato,
      s.data_scadenza,
      s.data_pagamento_effettiva,
      (upper(COALESCE(s.codice_pagamento,'')) LIKE 'RB%') AS is_riba
    FROM public.scadenze s
    WHERE s.data_scadenza >= make_date(_anno, 1, 1)
      AND s.data_scadenza <  make_date(_anno + 1, 1, 1)
      AND s.importo_scadenza <> 0
  ),
  agg AS (
    SELECT
      mese,
      SUM(importo_scadenza) AS dovuto,
      SUM(CASE WHEN data_pagamento_effettiva IS NOT NULL AND importo_pagato > 0
               THEN importo_pagato ELSE 0 END) AS incassato,
      SUM(CASE WHEN data_pagamento_effettiva IS NULL AND data_scadenza <  CURRENT_DATE
               THEN importo_scadenza ELSE 0 END) AS scaduto,
      SUM(CASE WHEN data_pagamento_effettiva IS NULL AND data_scadenza >= CURRENT_DATE
               THEN importo_scadenza ELSE 0 END) AS a_scadere,
      SUM(CASE WHEN data_pagamento_effettiva IS NULL AND data_scadenza <  CURRENT_DATE AND is_riba
               THEN importo_scadenza ELSE 0 END) AS scaduto_riba,
      SUM(CASE WHEN data_pagamento_effettiva IS NULL AND data_scadenza >= CURRENT_DATE AND is_riba
               THEN importo_scadenza ELSE 0 END) AS a_scadere_riba,
      COUNT(*) AS n_scadenze,
      COUNT(*) FILTER (WHERE data_pagamento_effettiva IS NOT NULL AND importo_pagato > 0) AS n_pagate
    FROM righe
    GROUP BY 1
  )
  SELECT
    m.mese,
    COALESCE(agg.dovuto, 0)::numeric,
    COALESCE(agg.incassato, 0)::numeric,
    COALESCE(agg.scaduto, 0)::numeric,
    COALESCE(agg.a_scadere, 0)::numeric,
    COALESCE(agg.scaduto_riba, 0)::numeric,
    COALESCE(agg.a_scadere_riba, 0)::numeric,
    (COALESCE(agg.scaduto,0) + COALESCE(agg.a_scadere,0))::numeric AS da_incassare,
    CASE
      WHEN COALESCE(agg.dovuto,0) <= 0 THEN 0::numeric
      WHEN (COALESCE(agg.scaduto,0) + COALESCE(agg.a_scadere,0)) > 0
        THEN LEAST(COALESCE(agg.incassato,0) / agg.dovuto * 100, 99.9)::numeric
      ELSE LEAST(COALESCE(agg.incassato,0) / agg.dovuto * 100, 100)::numeric
    END AS pct,
    COALESCE(agg.n_scadenze, 0),
    COALESCE(agg.n_pagate, 0)
  FROM m
  LEFT JOIN agg USING (mese)
  ORDER BY m.mese;
$function$;

COMMENT ON FUNCTION public.get_cruscotto_incassi_mensile(integer) IS
'Cruscotto incassi — aggregato mensile per data_scadenza. Stessa classificazione per-riga usata da get_cruscotto_incassi_mese_scadenze / _dettaglio: incassato = importo_pagato quando data_pagamento_effettiva IS NOT NULL AND importo_pagato > 0; scaduto/a_scadere = importo_scadenza INTERO delle righe con data_pagamento_effettiva IS NULL (mai sottrarre importo_pagato quando manca la data pagamento); di cui RiBa = sottoinsieme dove upper(codice_pagamento) LIKE ''RB%''. Nessun clamp GREATEST(dovuto-incassato,0).';
