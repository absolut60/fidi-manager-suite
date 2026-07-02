
DROP FUNCTION IF EXISTS public.get_incassi_periodo(date, date, text);

CREATE OR REPLACE FUNCTION public.get_incassi_periodo(
  _dal date,
  _al date,
  _cliente_search text DEFAULT NULL
)
RETURNS TABLE (
  cliente_id uuid,
  ragione_sociale text,
  codice_gestionale text,
  n_incassi bigint,
  totale_incassato numeric,
  n_saldi bigint,
  n_parziali bigint,
  tipo_prevalente text,
  ultimo_incasso date,
  metodo_prevalente text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pagate AS (
    SELECT
      s.cliente_id,
      s.importo_pagato,
      s.importo_scadenza,
      s.data_pagamento_effettiva,
      s.codice_pagamento,
      CASE
        WHEN COALESCE(s.importo_pagato, 0) >= COALESCE(s.importo_scadenza, 0)
          THEN 'saldo' ELSE 'parziale'
      END AS tipo,
      CASE
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'RB%' THEN 'RiBa'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'BO%' THEN 'Bonifico'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'RID%' THEN 'RID'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'S%'
          OR upper(COALESCE(s.codice_pagamento,'')) LIKE 'RD%'
          OR upper(COALESCE(s.codice_pagamento,'')) LIKE 'O%' THEN 'Rimessa'
        ELSE 'Altro'
      END AS metodo
    FROM public.scadenze s
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_pagamento_effettiva BETWEEN _dal AND _al
      AND COALESCE(s.importo_pagato, 0) > 0
      AND COALESCE(s.importo_scadenza, 0) <> 0
  ),
  metodi_cli AS (
    SELECT cliente_id, metodo, SUM(importo_pagato) AS tot
    FROM pagate
    GROUP BY cliente_id, metodo
  ),
  metodo_top AS (
    SELECT DISTINCT ON (cliente_id) cliente_id, metodo AS metodo_top
    FROM metodi_cli
    ORDER BY cliente_id, tot DESC
  ),
  metodo_cnt AS (
    SELECT cliente_id, COUNT(*)::int AS n_metodi
    FROM metodi_cli
    WHERE tot <> 0
    GROUP BY cliente_id
  ),
  metodo_final AS (
    SELECT mt.cliente_id,
      CASE WHEN COALESCE(mc.n_metodi,1) > 1 THEN 'Misto' ELSE mt.metodo_top END AS metodo_prevalente
    FROM metodo_top mt
    LEFT JOIN metodo_cnt mc ON mc.cliente_id = mt.cliente_id
  )
  SELECT
    c.id AS cliente_id,
    c.ragione_sociale::text,
    c.codice_gestionale::text,
    COUNT(*)::bigint AS n_incassi,
    SUM(p.importo_pagato)::numeric AS totale_incassato,
    SUM((p.tipo = 'saldo')::int)::bigint AS n_saldi,
    SUM((p.tipo = 'parziale')::int)::bigint AS n_parziali,
    CASE
      WHEN SUM((p.tipo = 'saldo')::int) >= SUM((p.tipo = 'parziale')::int)
        THEN 'saldo' ELSE 'parziale'
    END AS tipo_prevalente,
    MAX(p.data_pagamento_effettiva) AS ultimo_incasso,
    COALESCE(mf.metodo_prevalente, 'Altro') AS metodo_prevalente
  FROM pagate p
  JOIN public.clienti c ON c.id = p.cliente_id
  LEFT JOIN metodo_final mf ON mf.cliente_id = c.id
  WHERE _cliente_search IS NULL
     OR _cliente_search = ''
     OR c.ragione_sociale ILIKE '%' || _cliente_search || '%'
     OR c.codice_gestionale ILIKE '%' || _cliente_search || '%'
  GROUP BY c.id, c.ragione_sociale, c.codice_gestionale, mf.metodo_prevalente
  ORDER BY SUM(p.importo_pagato) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_incassi_periodo(date, date, text) TO authenticated, service_role;


DROP FUNCTION IF EXISTS public.get_incassi_periodo_dettaglio(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_incassi_periodo_dettaglio(
  _dal date,
  _al date,
  _cliente_id uuid
)
RETURNS TABLE (
  scadenza_id uuid,
  numero_documento text,
  data_scadenza date,
  importo_scadenza numeric,
  importo_pagato numeric,
  data_pagamento_effettiva date,
  codice_pagamento text,
  metodo_descrizione text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id AS scadenza_id,
    s.numero_documento::text,
    s.data_scadenza,
    s.importo_scadenza::numeric,
    s.importo_pagato::numeric,
    s.data_pagamento_effettiva,
    s.codice_pagamento::text,
    cp.descrizione::text AS metodo_descrizione
  FROM public.scadenze s
  LEFT JOIN public.codici_pagamento cp ON cp.cod = s.codice_pagamento
  WHERE s.cliente_id = _cliente_id
    AND s.data_pagamento_effettiva IS NOT NULL
    AND s.data_pagamento_effettiva BETWEEN _dal AND _al
    AND COALESCE(s.importo_pagato, 0) > 0
    AND COALESCE(s.importo_scadenza, 0) <> 0
  ORDER BY s.data_pagamento_effettiva DESC, s.data_scadenza ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_incassi_periodo_dettaglio(date, date, uuid) TO authenticated, service_role;
