
CREATE OR REPLACE FUNCTION public.get_recupero_clienti_aggregato(
  _store_id uuid DEFAULT NULL,
  _operatore_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _data_da timestamptz DEFAULT NULL,
  _data_a timestamptz DEFAULT NULL,
  _esiti text[] DEFAULT NULL,
  _tipi text[] DEFAULT NULL
)
RETURNS TABLE (
  cliente_id uuid,
  ragione_sociale text,
  store_id uuid,
  store_nome text,
  totale_scaduto numeric,
  azioni_totali integer,
  azioni_aperte integer,
  prossima_tipo text,
  prossima_data timestamptz,
  ultima_fatta_tipo text,
  ultima_fatta_data timestamptz,
  ha_promessa boolean,
  data_promessa timestamptz,
  in_ritardo boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH az AS (
    SELECT a.id, a.cliente_id, a.tipo, a.esito, a.data_azione, a.data_promessa_pagamento
    FROM public.azioni_recupero a
    JOIN public.clienti c ON c.id = a.cliente_id
    WHERE (_store_id IS NULL OR c.store_id = _store_id)
      AND (_operatore_id IS NULL OR a.operatore_id = _operatore_id)
      AND (_search IS NULL OR _search = '' OR c.ragione_sociale ILIKE '%' || _search || '%')
      AND (_data_da IS NULL OR a.data_azione >= _data_da)
      AND (_data_a IS NULL OR a.data_azione <= _data_a)
      AND (_esiti IS NULL OR a.esito::text = ANY(_esiti))
      AND (_tipi IS NULL OR a.tipo::text = ANY(_tipi))
  ),
  scad AS (
    SELECT s.cliente_id, SUM(s.importo_scadenza) AS totale_scaduto
    FROM public.scadenze s
    WHERE (
      lower(coalesce(s.tempi_scadenza, '')) LIKE '%scadut%'
      OR (
        coalesce(s.tempi_scadenza,'') !~* 'a scadere|pagat|scadut'
        AND s.stato_contabile = 'Aperta'
        AND COALESCE(s.giorni_ritardo,0) > 0
      )
    )
    GROUP BY s.cliente_id
  ),
  per_cliente AS (
    SELECT
      az.cliente_id,
      COUNT(*)::int AS azioni_totali,
      COUNT(*) FILTER (WHERE az.esito = 'da_fare')::int AS azioni_aperte,
      bool_or(az.esito = 'promessa_pagamento') AS ha_promessa,
      MAX(az.data_promessa_pagamento) FILTER (WHERE az.esito = 'promessa_pagamento') AS data_promessa,
      bool_or(az.esito = 'da_fare' AND az.data_azione < now()) AS in_ritardo
    FROM az
    GROUP BY az.cliente_id
  ),
  prossima AS (
    SELECT DISTINCT ON (az.cliente_id)
      az.cliente_id, az.tipo::text AS tipo, az.data_azione
    FROM az
    WHERE az.esito = 'da_fare'
    ORDER BY az.cliente_id, az.data_azione ASC
  ),
  ultima AS (
    SELECT DISTINCT ON (az.cliente_id)
      az.cliente_id, az.tipo::text AS tipo, az.data_azione
    FROM az
    WHERE az.esito = 'fatto'
    ORDER BY az.cliente_id, az.data_azione DESC
  )
  SELECT
    c.id,
    c.ragione_sociale,
    c.store_id,
    st.nome,
    COALESCE(sc.totale_scaduto, 0),
    pc.azioni_totali,
    pc.azioni_aperte,
    p.tipo,
    p.data_azione,
    u.tipo,
    u.data_azione,
    pc.ha_promessa,
    pc.data_promessa,
    pc.in_ritardo
  FROM per_cliente pc
  JOIN public.clienti c ON c.id = pc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN scad sc ON sc.cliente_id = c.id
  LEFT JOIN prossima p ON p.cliente_id = c.id
  LEFT JOIN ultima u ON u.cliente_id = c.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_recupero_clienti_aggregato(uuid, uuid, text, timestamptz, timestamptz, text[], text[]) TO authenticated;
