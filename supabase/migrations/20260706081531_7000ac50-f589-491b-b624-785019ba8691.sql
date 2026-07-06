-- Add store_id / store_nome to get_cruscotto_incassi_mese_scadenze
DROP FUNCTION IF EXISTS public.get_cruscotto_incassi_mese_scadenze(integer, integer, uuid);

CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_scadenze(_anno integer, _mese integer, _store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, in_gestione_legale boolean, bloccato boolean, email text, pec text, store_id uuid, store_nome text, scadenza_id uuid, numero_documento text, data_scadenza date, importo_scadenza numeric, importo_pagato numeric, quota_incassata numeric, residuo numeric, eccedenza numeric, scaduta boolean, codice_pagamento text, metodo_descrizione text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.effective_store_filter(_store_id) AS s),
  d1 AS (SELECT make_date(_anno,_mese,1) AS d),
  d AS (SELECT d, (d + interval '1 month')::date AS d_next FROM d1)
  SELECT
    c.id AS cliente_id,
    c.ragione_sociale,
    c.codice_gestionale,
    COALESCE(c.in_gestione_legale,false),
    COALESCE(c.bloccato,false),
    c.email,
    c.pec,
    c.store_id,
    st.nome AS store_nome,
    s.id AS scadenza_id,
    s.numero_documento,
    s.data_scadenza,
    COALESCE(s.importo_scadenza,0)::numeric,
    COALESCE(s.importo_pagato,0)::numeric,
    CASE
      WHEN COALESCE(s.importo_scadenza,0) < 0 THEN COALESCE(s.importo_scadenza,0)
      WHEN s.data_pagamento_effettiva IS NULL THEN 0::numeric
      ELSE LEAST(GREATEST(COALESCE(s.importo_pagato,0), 0), COALESCE(s.importo_scadenza,0))
    END::numeric AS quota_incassata,
    (COALESCE(s.importo_scadenza,0) -
      CASE
        WHEN COALESCE(s.importo_scadenza,0) < 0 THEN COALESCE(s.importo_scadenza,0)
        WHEN s.data_pagamento_effettiva IS NULL THEN 0::numeric
        ELSE LEAST(GREATEST(COALESCE(s.importo_pagato,0), 0), COALESCE(s.importo_scadenza,0))
      END
    )::numeric AS residuo,
    GREATEST(COALESCE(s.importo_pagato,0) - COALESCE(s.importo_scadenza,0), 0)::numeric AS eccedenza,
    (s.data_scadenza < CURRENT_DATE) AS scaduta,
    s.codice_pagamento,
    cp.descrizione AS metodo_descrizione
  FROM public.scadenze s
  JOIN public.clienti c ON c.id = s.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN public.codici_pagamento cp ON cp.cod = s.codice_pagamento
  , d, eff
  WHERE s.data_scadenza >= d.d
    AND s.data_scadenza <  d.d_next
    AND COALESCE(s.importo_scadenza,0) <> 0
    AND public.user_can_access_cliente(c.id)
    AND (eff.s IS NULL OR c.store_id = eff.s);
$function$;

-- Add store_id / store_nome to get_incassi_periodo
DROP FUNCTION IF EXISTS public.get_incassi_periodo(date, date, text, text[], uuid);

CREATE OR REPLACE FUNCTION public.get_incassi_periodo(_dal date, _al date, _cliente_search text DEFAULT NULL::text, _metodi text[] DEFAULT NULL::text[], _store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, store_id uuid, store_nome text, n_incassi bigint, totale_incassato numeric, n_saldi bigint, n_parziali bigint, tipo_prevalente text, ultimo_incasso date, metodo_prevalente text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.effective_store_filter(_store_id) AS s),
  pagate AS (
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
    JOIN public.clienti c2 ON c2.id = s.cliente_id
    CROSS JOIN eff
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_pagamento_effettiva BETWEEN _dal AND _al
      AND COALESCE(s.importo_pagato, 0) > 0
      AND COALESCE(s.importo_scadenza, 0) <> 0
      AND (eff.s IS NULL OR c2.store_id = eff.s)
  ),
  pagate_f AS (
    SELECT * FROM pagate
    WHERE _metodi IS NULL OR cardinality(_metodi) = 0 OR metodo = ANY(_metodi)
  ),
  metodi_cli AS (SELECT cliente_id, metodo, SUM(importo_pagato) AS tot FROM pagate_f GROUP BY cliente_id, metodo),
  metodo_top AS (SELECT DISTINCT ON (cliente_id) cliente_id, metodo AS metodo_top FROM metodi_cli ORDER BY cliente_id, tot DESC),
  metodo_cnt AS (SELECT cliente_id, COUNT(*)::int AS n_metodi FROM metodi_cli WHERE tot <> 0 GROUP BY cliente_id),
  metodo_final AS (
    SELECT mt.cliente_id,
      CASE WHEN COALESCE(mc.n_metodi,1) > 1 THEN 'Misto' ELSE mt.metodo_top END AS metodo_prevalente
    FROM metodo_top mt LEFT JOIN metodo_cnt mc ON mc.cliente_id = mt.cliente_id
  )
  SELECT
    c.id, c.ragione_sociale::text, c.codice_gestionale::text,
    c.store_id, st.nome::text AS store_nome,
    COUNT(*)::bigint,
    SUM(p.importo_pagato)::numeric,
    SUM((p.tipo = 'saldo')::int)::bigint,
    SUM((p.tipo = 'parziale')::int)::bigint,
    CASE WHEN SUM((p.tipo = 'saldo')::int) >= SUM((p.tipo = 'parziale')::int)
      THEN 'saldo' ELSE 'parziale' END,
    MAX(p.data_pagamento_effettiva),
    COALESCE(mf.metodo_prevalente, 'Altro')
  FROM pagate_f p
  JOIN public.clienti c ON c.id = p.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN metodo_final mf ON mf.cliente_id = c.id
  WHERE _cliente_search IS NULL
     OR _cliente_search = ''
     OR c.ragione_sociale ILIKE '%' || _cliente_search || '%'
     OR c.codice_gestionale ILIKE '%' || _cliente_search || '%'
  GROUP BY c.id, c.ragione_sociale, c.codice_gestionale, c.store_id, st.nome, mf.metodo_prevalente
  ORDER BY SUM(p.importo_pagato) DESC;
$function$;