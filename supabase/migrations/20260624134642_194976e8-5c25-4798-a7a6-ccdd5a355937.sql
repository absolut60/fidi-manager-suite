CREATE OR REPLACE FUNCTION public.get_scadenziario_ids(
  p_search text DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_fascia text DEFAULT 'tutte',
  p_stato_blocco text DEFAULT 'tutti',
  p_stato_legale text DEFAULT 'tutti',
  p_escludi_bonifici boolean DEFAULT true,
  p_escludi_legale boolean DEFAULT true,
  p_avvisato text DEFAULT 'tutti',
  p_importo_min numeric DEFAULT 0,
  p_mostra_a_credito boolean DEFAULT false
)
RETURNS TABLE(cliente_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH cls_full AS (
    SELECT s.id, s.cliente_id, s.importo_scadenza, s.codice_pagamento, s.giorni_ritardo,
      (s.numero_documento ILIKE '%ANTICIPO%') AS is_anticipo,
      CASE
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < v_today THEN 'scaduto'
        WHEN s.data_pagamento_effettiva IS NOT NULL THEN 'pagato'
        WHEN s.data_scadenza IS NOT NULL AND s.data_scadenza >= v_today THEN 'a_scadere'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NULL THEN
          CASE WHEN COALESCE(s.giorni_ritardo, 0) > 0 THEN 'scaduto' ELSE 'a_scadere' END
        ELSE 'pagato'
      END AS cat
    FROM public.scadenze s
    WHERE (s.stato_contabile = 'Aperta' OR s.data_pagamento_effettiva IS NULL)
  ),
  cls AS (
    SELECT * FROM cls_full
    WHERE cat <> 'pagato'
      AND (NOT p_escludi_bonifici OR upper(COALESCE(codice_pagamento, '')) <> 'BOS')
  ),
  agg AS (
    SELECT c.cliente_id AS cli_id,
      COUNT(*) FILTER (WHERE cat='scaduto')::int                                              AS n_scadute,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND NOT is_anticipo), 0)     AS ssa,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND is_anticipo), 0)         AS ant,
      COUNT(*) FILTER (WHERE cat='a_scadere')::int                                            AS n_a_scadere,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='a_scadere'), 0)::numeric              AS tot_a,
      COALESCE(MAX(giorni_ritardo) FILTER (WHERE cat='scaduto'), 0)::int                      AS max_gg
    FROM cls c
    GROUP BY c.cliente_id
    HAVING COUNT(*) FILTER (WHERE cat='scaduto') > 0
  ),
  agg2 AS (
    SELECT agg.cli_id, agg.n_scadute,
      GREATEST(agg.ssa - agg.ant, LEAST(agg.ssa, 0))::numeric AS tot_s,
      agg.n_a_scadere, agg.tot_a, agg.max_gg
    FROM agg
  ),
  avv AS (
    SELECT al.cliente_id AS cli_id, COUNT(*)::int AS n_az
    FROM (
      SELECT DISTINCT a.id, a.cliente_id
      FROM public.azioni_recupero a
      JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
      JOIN public.scadenze s2 ON s2.id = ars.scadenza_id
                              AND s2.stato_contabile = 'Aperta'
                              AND s2.cliente_id = a.cliente_id
      WHERE a.tipo <> 'promemoria_scadenza'
    ) al
    GROUP BY al.cliente_id
  ),
  joined AS (
    SELECT cl.id AS cli_id, COALESCE(cl.bloccato,false) AS bloccato,
      COALESCE(cl.in_gestione_legale,false) AS in_gestione_legale,
      a.tot_s, a.tot_a, a.n_scadute, a.max_gg,
      COALESCE(av.n_az, 0) AS avvisato_n,
      CASE
        WHEN a.max_gg <= 0  THEN NULL
        WHEN a.max_gg <= 30 THEN '0_30'
        WHEN a.max_gg <= 60 THEN '31_60'
        ELSE 'oltre_60'
      END AS fascia
    FROM agg2 a
    JOIN public.clienti cl ON cl.id = a.cli_id
    LEFT JOIN avv av ON av.cli_id = cl.id
    WHERE public.user_can_access_cliente(cl.id)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_stato_blocco = 'tutti'
           OR (p_stato_blocco = 'bloccati'     AND COALESCE(cl.bloccato,false) = true)
           OR (p_stato_blocco = 'non_bloccati' AND COALESCE(cl.bloccato,false) = false))
      AND (p_stato_legale = 'tutti'
           OR (p_stato_legale = 'in_legale'     AND COALESCE(cl.in_gestione_legale,false) = true)
           OR (p_stato_legale = 'non_in_legale' AND COALESCE(cl.in_gestione_legale,false) = false))
      AND (NOT p_escludi_legale OR COALESCE(cl.in_gestione_legale,false) = false)
      AND (p_search IS NULL OR p_search = ''
           OR cl.ragione_sociale  ILIKE '%' || p_search || '%'
           OR cl.codice_gestionale ILIKE '%' || p_search || '%')
  )
  SELECT j.cli_id
  FROM joined j
  WHERE (CASE WHEN j.tot_s >= 0  THEN j.tot_s     >= COALESCE(p_importo_min,0)
              WHEN p_mostra_a_credito THEN abs(j.tot_s) >= COALESCE(p_importo_min,0)
              ELSE false END)
    AND (p_fascia = 'tutte' OR j.fascia = p_fascia)
    AND (p_avvisato = 'tutti'
         OR (p_avvisato = 'con_azioni'  AND j.avvisato_n > 0)
         OR (p_avvisato = 'senza_azioni' AND j.avvisato_n = 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_scadenziario_ids(text, uuid, text, text, text, boolean, boolean, text, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_scadenziario_ids(text, uuid, text, text, text, boolean, boolean, text, numeric, boolean) TO authenticated;