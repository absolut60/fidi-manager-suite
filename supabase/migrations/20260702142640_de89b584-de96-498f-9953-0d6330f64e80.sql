
-- RPC: dettaglio per singolo mese del cruscotto incassi
-- Ritorna una riga per cliente con dovuto/incassato del mese + esposizione scaduta totale a oggi
CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_dettaglio(_anno int, _mese int)
RETURNS TABLE (
  cliente_id uuid,
  ragione_sociale text,
  codice_gestionale text,
  store_id uuid,
  store_nome text,
  dovuto_mese numeric,
  incassato_mese numeric,
  insoluto_mese numeric,
  esposizione_scaduta_totale numeric,
  n_scadenze_mese int,
  n_scadenze_pagate_mese int,
  in_gestione_legale boolean,
  bloccato boolean,
  email text,
  pec text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH d1 AS (SELECT make_date(_anno, _mese, 1) AS d),
  d AS (SELECT d, (d + interval '1 month')::date AS d_next FROM d1),
  -- Aggregato mese per cliente (scadenze con data_scadenza nel mese)
  mese_agg AS (
    SELECT
      s.cliente_id,
      SUM(s.importo_scadenza)::numeric AS dovuto_mese,
      SUM(CASE WHEN s.data_pagamento_effettiva IS NOT NULL AND s.importo_pagato > 0
               THEN s.importo_pagato ELSE 0 END)::numeric AS incassato_mese,
      COUNT(*)::int AS n_scad,
      COUNT(*) FILTER (
        WHERE s.data_pagamento_effettiva IS NOT NULL AND s.importo_pagato > 0
      )::int AS n_pag
    FROM public.scadenze s, d
    WHERE s.data_scadenza >= d.d
      AND s.data_scadenza <  d.d_next
      AND s.importo_scadenza <> 0
    GROUP BY s.cliente_id
  ),
  -- Esposizione scaduta a oggi (Aperta + data_scadenza < oggi) con clamp anticipi/note credito
  scad_oggi AS (
    SELECT
      s.cliente_id,
      SUM(CASE WHEN s.numero_documento ILIKE '%ANTICIPO%' THEN 0 ELSE s.importo_scadenza END)::numeric AS ssa,
      SUM(CASE WHEN s.numero_documento ILIKE '%ANTICIPO%' THEN s.importo_scadenza ELSE 0 END)::numeric AS ant
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta'
      AND s.data_scadenza IS NOT NULL
      AND s.data_scadenza < CURRENT_DATE
    GROUP BY s.cliente_id
  )
  SELECT
    c.id                                                            AS cliente_id,
    c.ragione_sociale,
    c.codice_gestionale,
    c.store_id,
    st.nome                                                         AS store_nome,
    COALESCE(m.dovuto_mese, 0)                                      AS dovuto_mese,
    COALESCE(m.incassato_mese, 0)                                   AS incassato_mese,
    GREATEST(COALESCE(m.dovuto_mese,0) - COALESCE(m.incassato_mese,0), 0) AS insoluto_mese,
    COALESCE(GREATEST(so.ssa - so.ant, LEAST(so.ssa, 0)), 0)        AS esposizione_scaduta_totale,
    COALESCE(m.n_scad, 0)                                           AS n_scadenze_mese,
    COALESCE(m.n_pag, 0)                                            AS n_scadenze_pagate_mese,
    COALESCE(c.in_gestione_legale, false)                           AS in_gestione_legale,
    COALESCE(c.bloccato, false)                                     AS bloccato,
    c.email,
    c.pec
  FROM mese_agg m
  JOIN public.clienti c ON c.id = m.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN scad_oggi so ON so.cliente_id = c.id
  WHERE public.user_can_access_cliente(c.id)
  ORDER BY esposizione_scaduta_totale DESC NULLS LAST, insoluto_mese DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_cruscotto_incassi_mese_dettaglio(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cruscotto_incassi_mese_dettaglio(int, int) TO authenticated, service_role;
