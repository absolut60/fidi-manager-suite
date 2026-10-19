CREATE INDEX IF NOT EXISTS idx_scadenze_data_pagamento_eff
  ON public.scadenze (data_pagamento_effettiva)
  WHERE data_pagamento_effettiva IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_incassi_periodo(_dal date, _al date, _cliente_search text DEFAULT NULL::text, _metodi text[] DEFAULT NULL::text[], _store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, store_id uuid, store_nome text, n_incassi bigint, totale_incassato numeric, n_saldi bigint, n_parziali bigint, tipo_prevalente text, ultimo_incasso date, metodo_prevalente text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- FM47: piano calcolato con i valori reali (EXECUTE ... USING); si parte dalle scadenze pagate nel periodo.
  RETURN QUERY EXECUTE $q$
  WITH eff AS MATERIALIZED (SELECT public.store_id_effettivo($5) AS s),
  sc AS MATERIALIZED (
    SELECT s.cliente_id, s.importo_pagato, s.importo_scadenza, s.data_pagamento_effettiva, s.codice_pagamento
    FROM public.scadenze s
    WHERE s.data_pagamento_effettiva IS NOT NULL AND s.data_pagamento_effettiva BETWEEN $1 AND $2
      AND COALESCE(s.importo_pagato, 0) > 0 AND COALESCE(s.importo_scadenza, 0) <> 0
  ),
  pagate AS (
    SELECT sc.cliente_id, sc.importo_pagato, sc.importo_scadenza, sc.data_pagamento_effettiva, sc.codice_pagamento,
      CASE WHEN COALESCE(sc.importo_pagato, 0) >= COALESCE(sc.importo_scadenza, 0) THEN 'saldo' ELSE 'parziale' END AS tipo,
      CASE
        WHEN upper(COALESCE(sc.codice_pagamento,'')) LIKE 'RB%' THEN 'RiBa'
        WHEN upper(COALESCE(sc.codice_pagamento,'')) LIKE 'BO%' THEN 'Bonifico'
        WHEN upper(COALESCE(sc.codice_pagamento,'')) LIKE 'RID%' THEN 'RID'
        WHEN upper(COALESCE(sc.codice_pagamento,'')) LIKE 'S%'
          OR upper(COALESCE(sc.codice_pagamento,'')) LIKE 'RD%'
          OR upper(COALESCE(sc.codice_pagamento,'')) LIKE 'O%' THEN 'Rimessa'
        ELSE 'Altro'
      END AS metodo
    FROM sc JOIN public.clienti c2 ON c2.id = sc.cliente_id CROSS JOIN eff
    WHERE (eff.s IS NULL OR c2.store_id = eff.s)
  ),
  pagate_f AS (SELECT * FROM pagate WHERE $4 IS NULL OR cardinality($4) = 0 OR metodo = ANY($4)),
  metodi_cli AS (SELECT cliente_id, metodo, SUM(importo_pagato) AS tot FROM pagate_f GROUP BY cliente_id, metodo),
  metodo_top AS (SELECT DISTINCT ON (cliente_id) cliente_id, metodo AS metodo_top FROM metodi_cli ORDER BY cliente_id, tot DESC),
  metodo_cnt AS (SELECT cliente_id, COUNT(*)::int AS n_metodi FROM metodi_cli WHERE tot <> 0 GROUP BY cliente_id),
  metodo_final AS (
    SELECT mt.cliente_id, CASE WHEN COALESCE(mc.n_metodi,1) > 1 THEN 'Misto' ELSE mt.metodo_top END AS metodo_prevalente
    FROM metodo_top mt LEFT JOIN metodo_cnt mc ON mc.cliente_id = mt.cliente_id
  )
  SELECT c.id, c.ragione_sociale::text, c.codice_gestionale::text, c.store_id, st.nome::text,
    COUNT(*)::bigint, SUM(p.importo_pagato)::numeric,
    SUM((p.tipo = 'saldo')::int)::bigint, SUM((p.tipo = 'parziale')::int)::bigint,
    CASE WHEN SUM((p.tipo = 'saldo')::int) >= SUM((p.tipo = 'parziale')::int) THEN 'saldo' ELSE 'parziale' END,
    MAX(p.data_pagamento_effettiva), COALESCE(mf.metodo_prevalente, 'Altro')
  FROM pagate_f p
  JOIN public.clienti c ON c.id = p.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN metodo_final mf ON mf.cliente_id = c.id
  WHERE $3 IS NULL OR $3 = ''
     OR c.ragione_sociale ILIKE '%' || $3 || '%'
     OR c.codice_gestionale ILIKE '%' || $3 || '%'
  GROUP BY c.id, c.ragione_sociale, c.codice_gestionale, c.store_id, st.nome, mf.metodo_prevalente
  ORDER BY SUM(p.importo_pagato) DESC
  $q$ USING _dal, _al, _cliente_search, _metodi, _store_id;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.get_incassi_periodo(date, date, text, text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_incassi_periodo(date, date, text, text[], uuid) TO authenticated;
