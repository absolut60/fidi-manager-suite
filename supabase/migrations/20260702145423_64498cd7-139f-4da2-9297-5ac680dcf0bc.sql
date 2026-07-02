
-- RPC per Ricerca Incassi (per data di pagamento)
-- Definizione canonica di pagato: data_pagamento_effettiva IS NOT NULL
-- AND importo_pagato > 0 AND importo_scadenza <> 0 (esclude partite tecniche).

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
  ultimo_incasso date
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
      CASE
        WHEN COALESCE(s.importo_pagato, 0) >= COALESCE(s.importo_scadenza, 0)
          THEN 'saldo'
        ELSE 'parziale'
      END AS tipo
    FROM public.scadenze s
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_pagamento_effettiva BETWEEN _dal AND _al
      AND COALESCE(s.importo_pagato, 0) > 0
      AND COALESCE(s.importo_scadenza, 0) <> 0
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
    MAX(p.data_pagamento_effettiva) AS ultimo_incasso
  FROM pagate p
  JOIN public.clienti c ON c.id = p.cliente_id
  WHERE _cliente_search IS NULL
     OR _cliente_search = ''
     OR c.ragione_sociale ILIKE '%' || _cliente_search || '%'
     OR c.codice_gestionale ILIKE '%' || _cliente_search || '%'
  GROUP BY c.id, c.ragione_sociale, c.codice_gestionale
  ORDER BY SUM(p.importo_pagato) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_incassi_periodo(date, date, text) TO authenticated, service_role;


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
  data_pagamento_effettiva date
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
    s.data_pagamento_effettiva
  FROM public.scadenze s
  WHERE s.cliente_id = _cliente_id
    AND s.data_pagamento_effettiva IS NOT NULL
    AND s.data_pagamento_effettiva BETWEEN _dal AND _al
    AND COALESCE(s.importo_pagato, 0) > 0
    AND COALESCE(s.importo_scadenza, 0) <> 0
  ORDER BY s.data_pagamento_effettiva DESC, s.data_scadenza ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_incassi_periodo_dettaglio(date, date, uuid) TO authenticated, service_role;
