
-- Add p_agente parameter (additive, DEFAULT NULL) to the three scadenziario RPCs.
-- Semantic: NULL = tutti, '__none__' = solo clienti senza agente, altrimenti = codice_agente = p_agente.

CREATE OR REPLACE FUNCTION public.get_scadenziario_lista_paginata(
  p_search text DEFAULT NULL::text,
  p_store_id uuid DEFAULT NULL::uuid,
  p_fascia text DEFAULT 'tutte'::text,
  p_stato_blocco text DEFAULT 'tutti'::text,
  p_stato_legale text DEFAULT 'tutti'::text,
  p_escludi_bonifici boolean DEFAULT true,
  p_escludi_legale boolean DEFAULT true,
  p_avvisato text DEFAULT 'tutti'::text,
  p_importo_min numeric DEFAULT 0,
  p_mostra_a_credito boolean DEFAULT false,
  p_anno_corrente integer DEFAULT NULL::integer,
  p_anno_prec integer DEFAULT NULL::integer,
  p_sort_by text DEFAULT 'tot_scaduto'::text,
  p_sort_dir text DEFAULT 'desc'::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_agente text DEFAULT NULL::text
)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, store_id uuid, store_nome text, bloccato boolean, ind_blocco integer, in_gestione_legale boolean, n_scadute integer, tot_scaduto numeric, n_a_scadere integer, tot_a_scadere numeric, prossima_scadenza date, max_gg_ritardo integer, scadute_ids uuid[], fascia text, fatturato_cur numeric, fatturato_prec numeric, avvisato_n integer, avvisato_ha_email boolean, avvisato_ultima_tipo text, avvisato_ultima_data timestamp with time zone, ha_promessa boolean, data_promessa date, ha_piano_rientro boolean, piano_rientro_id uuid, piano_rate_pagate integer, piano_rate_totali integer, piano_prossima_rata_data date, piano_prossima_rata_importo numeric, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := CURRENT_DATE;
  v_offset int := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,25));
  v_limit int := GREATEST(1, COALESCE(p_page_size,25));
BEGIN
  RETURN QUERY
  WITH cls AS (
    SELECT s.id, s.cliente_id AS cli_id, s.importo_scadenza,
      public.is_anticipo(s.numero_documento) AS is_anticipo,
      s.data_scadenza, s.giorni_ritardo,
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
      AND (NOT p_escludi_bonifici OR upper(COALESCE(s.codice_pagamento, '')) <> 'BOS')
  ),
  agg AS (
    SELECT c.cli_id,
      COUNT(*) FILTER (WHERE c.cat = 'scaduto')::int AS n_scadute,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat='scaduto' AND NOT c.is_anticipo), 0) AS ssa,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat='scaduto' AND c.is_anticipo), 0) AS ant,
      COUNT(*) FILTER (WHERE c.cat = 'a_scadere')::int AS n_a_scadere,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat = 'a_scadere'), 0)::numeric AS tot_a_scadere,
      MIN(c.data_scadenza) FILTER (WHERE c.cat = 'a_scadere') AS prossima_scadenza,
      COALESCE(MAX(c.giorni_ritardo) FILTER (WHERE c.cat = 'scaduto'), 0)::int AS max_gg,
      COALESCE(ARRAY_AGG(c.id) FILTER (WHERE c.cat = 'scaduto'), ARRAY[]::uuid[]) AS scadute_ids
    FROM cls c GROUP BY c.cli_id
    HAVING COUNT(*) FILTER (WHERE c.cat = 'scaduto') > 0
  ),
  agg2 AS (
    SELECT a.cli_id, a.n_scadute, public.calcola_scaduto(a.ssa, a.ant) AS tot_scaduto,
      a.n_a_scadere, a.tot_a_scadere, a.prossima_scadenza, a.max_gg, a.scadute_ids FROM agg a
  ),
  avv AS (
    SELECT al.cli_id, COUNT(*)::int AS n_az,
      bool_or(al.tipo = 'email') AS ha_email,
      (ARRAY_AGG(al.tipo ORDER BY al.data_azione DESC))[1] AS ultima_tipo,
      MAX(al.data_azione) AS ultima_data
    FROM (
      SELECT DISTINCT a.id, a.cliente_id AS cli_id, a.tipo::text AS tipo, a.data_azione
      FROM public.azioni_recupero a
      JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
      JOIN public.scadenze s2 ON s2.id = ars.scadenza_id AND s2.stato_contabile = 'Aperta' AND s2.cliente_id = a.cliente_id
      WHERE a.tipo <> 'promemoria_scadenza'
    ) al GROUP BY al.cli_id
  ),
  prom AS (
    SELECT a.cliente_id AS cli_id, MAX(a.data_promessa_pagamento) AS data_promessa
    FROM public.azioni_recupero a
    WHERE a.esito = 'promessa_pagamento'
      AND a.data_promessa_pagamento IS NOT NULL
      AND a.data_promessa_pagamento >= v_today
    GROUP BY a.cliente_id
  ),
  piano_att AS (
    SELECT DISTINCT ON (p.cliente_id)
      p.cliente_id AS cli_id, p.id AS piano_id
    FROM public.piani_rientro p
    WHERE p.stato = 'attivo'
    ORDER BY p.cliente_id, p.created_at DESC
  ),
  piano_stats AS (
    SELECT pa.cli_id, pa.piano_id,
      (SELECT COUNT(*)::int FROM public.piani_rientro_rate r WHERE r.piano_id = pa.piano_id AND r.stato = 'pagata') AS rate_pagate,
      (SELECT COUNT(*)::int FROM public.piani_rientro_rate r WHERE r.piano_id = pa.piano_id) AS rate_totali,
      (SELECT r.data_rata FROM public.piani_rientro_rate r
        WHERE r.piano_id = pa.piano_id AND r.stato = 'da_pagare'
        ORDER BY r.data_rata ASC LIMIT 1) AS prossima_data,
      (SELECT r.importo FROM public.piani_rientro_rate r
        WHERE r.piano_id = pa.piano_id AND r.stato = 'da_pagare'
        ORDER BY r.data_rata ASC LIMIT 1) AS prossima_importo
    FROM piano_att pa
  ),
  fat AS (
    SELECT f.cliente_id AS cli_id,
      COALESCE(SUM(f.fatturato) FILTER (WHERE f.anno = p_anno_corrente), 0)::numeric AS cur,
      COALESCE(SUM(f.fatturato) FILTER (WHERE f.anno = p_anno_prec), 0)::numeric AS prev
    FROM public.fatturato_clienti f
    WHERE p_anno_corrente IS NOT NULL
      AND f.anno IN (p_anno_corrente, COALESCE(p_anno_prec, p_anno_corrente - 1))
    GROUP BY f.cliente_id
  ),
  joined AS (
    SELECT
      cl.id AS cli_id, cl.ragione_sociale, cl.codice_gestionale, cl.store_id, st.nome AS store_nome,
      COALESCE(cl.bloccato, false) AS bloccato, COALESCE(cl.ind_blocco, 0)::int AS ind_blocco,
      COALESCE(cl.in_gestione_legale,false) AS in_gestione_legale,
      ag2.n_scadute, ag2.tot_scaduto, ag2.n_a_scadere, ag2.tot_a_scadere,
      ag2.prossima_scadenza, ag2.max_gg AS max_gg_ritardo, ag2.scadute_ids,
      CASE WHEN ag2.max_gg <= 0 THEN NULL WHEN ag2.max_gg <= 30 THEN '0_30' WHEN ag2.max_gg <= 60 THEN '31_60' ELSE 'oltre_60' END AS fascia,
      COALESCE(fat.cur, 0) AS fatturato_cur, COALESCE(fat.prev, 0) AS fatturato_prec,
      COALESCE(avv.n_az, 0) AS avvisato_n, COALESCE(avv.ha_email, false) AS avvisato_ha_email,
      avv.ultima_tipo AS avvisato_ultima_tipo, avv.ultima_data AS avvisato_ultima_data,
      (prom.data_promessa IS NOT NULL) AS ha_promessa,
      prom.data_promessa AS data_promessa,
      (ps.piano_id IS NOT NULL) AS ha_piano_rientro,
      ps.piano_id AS piano_rientro_id,
      COALESCE(ps.rate_pagate, 0) AS piano_rate_pagate,
      COALESCE(ps.rate_totali, 0) AS piano_rate_totali,
      ps.prossima_data AS piano_prossima_rata_data,
      ps.prossima_importo AS piano_prossima_rata_importo
    FROM agg2 ag2
    JOIN public.clienti cl ON cl.id = ag2.cli_id
    LEFT JOIN public.stores st ON st.id = cl.store_id
    LEFT JOIN fat ON fat.cli_id = cl.id
    LEFT JOIN avv ON avv.cli_id = cl.id
    LEFT JOIN prom ON prom.cli_id = cl.id
    LEFT JOIN piano_stats ps ON ps.cli_id = cl.id
    WHERE public.user_can_access_cliente(cl.id)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_stato_blocco = 'tutti' OR (p_stato_blocco = 'bloccati' AND COALESCE(cl.bloccato,false) = true) OR (p_stato_blocco = 'non_bloccati' AND COALESCE(cl.bloccato,false) = false))
      AND (p_stato_legale = 'tutti' OR (p_stato_legale = 'in_legale' AND COALESCE(cl.in_gestione_legale,false) = true) OR (p_stato_legale = 'non_in_legale' AND COALESCE(cl.in_gestione_legale,false) = false))
      AND (NOT p_escludi_legale OR COALESCE(cl.in_gestione_legale,false) = false)
      AND (p_search IS NULL OR p_search = '' OR cl.ragione_sociale ILIKE '%' || p_search || '%' OR cl.codice_gestionale ILIKE '%' || p_search || '%')
      AND (p_agente IS NULL OR (p_agente = '__none__' AND cl.codice_agente IS NULL) OR cl.codice_agente = p_agente)
  ),
  filtered AS (
    SELECT * FROM joined j
    WHERE (CASE WHEN j.tot_scaduto >= 0 THEN j.tot_scaduto >= COALESCE(p_importo_min, 0)
                WHEN p_mostra_a_credito THEN abs(j.tot_scaduto) >= COALESCE(p_importo_min, 0)
                ELSE false END)
      AND (p_fascia = 'tutte' OR (j.n_scadute > 0 AND j.fascia = p_fascia))
      AND (p_avvisato = 'tutti' OR (p_avvisato = 'con_azioni' AND j.avvisato_n > 0) OR (p_avvisato = 'senza_azioni' AND j.avvisato_n = 0))
  ),
  cnt AS (SELECT COUNT(*)::bigint AS total FROM filtered)
  SELECT
    f.cli_id, f.ragione_sociale, f.codice_gestionale, f.store_id, f.store_nome,
    f.bloccato, f.ind_blocco, f.in_gestione_legale,
    f.n_scadute, f.tot_scaduto, f.n_a_scadere, f.tot_a_scadere,
    f.prossima_scadenza, f.max_gg_ritardo, f.scadute_ids, f.fascia,
    f.fatturato_cur, f.fatturato_prec,
    f.avvisato_n, f.avvisato_ha_email, f.avvisato_ultima_tipo, f.avvisato_ultima_data,
    f.ha_promessa, f.data_promessa,
    f.ha_piano_rientro, f.piano_rientro_id,
    f.piano_rate_pagate, f.piano_rate_totali,
    f.piano_prossima_rata_data, f.piano_prossima_rata_importo,
    (SELECT total FROM cnt) AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN f.tot_scaduto >= 0 THEN 0 ELSE 1 END,
    CASE WHEN p_sort_by = 'tot_scaduto' AND p_sort_dir = 'asc'  THEN f.tot_scaduto END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'tot_scaduto' AND p_sort_dir = 'desc' THEN f.tot_scaduto END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'tot_a_scadere' AND p_sort_dir = 'asc'  THEN f.tot_a_scadere END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'tot_a_scadere' AND p_sort_dir = 'desc' THEN f.tot_a_scadere END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'max_gg' AND p_sort_dir = 'asc'  THEN f.max_gg_ritardo END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'max_gg' AND p_sort_dir = 'desc' THEN f.max_gg_ritardo END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'ragione_sociale' AND p_sort_dir = 'asc'  THEN f.ragione_sociale END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'ragione_sociale' AND p_sort_dir = 'desc' THEN f.ragione_sociale END DESC NULLS LAST,
    f.ragione_sociale ASC
  OFFSET v_offset LIMIT v_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_scadenziario_totali(
  p_search text DEFAULT NULL::text,
  p_store_id uuid DEFAULT NULL::uuid,
  p_fascia text DEFAULT 'tutte'::text,
  p_stato_blocco text DEFAULT 'tutti'::text,
  p_stato_legale text DEFAULT 'tutti'::text,
  p_escludi_bonifici boolean DEFAULT true,
  p_escludi_legale boolean DEFAULT true,
  p_avvisato text DEFAULT 'tutti'::text,
  p_importo_min numeric DEFAULT 0,
  p_mostra_a_credito boolean DEFAULT false,
  p_agente text DEFAULT NULL::text
)
 RETURNS TABLE(n_clienti_totali integer, tot_scaduto numeric, tot_a_scadere numeric, n_clienti_scaduti integer, n_clienti_bloccati integer, n_clienti_in_legale integer, n_clienti_crediti integer, tot_crediti numeric, n_bonifici_esclusi integer, n_legale_esclusi integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_today date := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH cls_full AS (
    SELECT s.id, s.cliente_id, s.importo_scadenza, s.codice_pagamento, s.giorni_ritardo,
      public.is_anticipo(s.numero_documento) AS is_anticipo,
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
    WHERE cat <> 'pagato' AND (NOT p_escludi_bonifici OR upper(COALESCE(codice_pagamento, '')) <> 'BOS')
  ),
  agg AS (
    SELECT cliente_id,
      COUNT(*) FILTER (WHERE cat='scaduto')::int AS n_scadute,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND NOT is_anticipo), 0) AS ssa,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND is_anticipo), 0) AS ant,
      COUNT(*) FILTER (WHERE cat='a_scadere')::int AS n_a_scadere,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='a_scadere'), 0)::numeric AS tot_a,
      COALESCE(MAX(giorni_ritardo) FILTER (WHERE cat='scaduto'), 0)::int AS max_gg
    FROM cls GROUP BY cliente_id
    HAVING COUNT(*) FILTER (WHERE cat='scaduto') > 0
  ),
  agg2 AS (
    SELECT cliente_id, n_scadute, public.calcola_scaduto(ssa, ant) AS tot_s, n_a_scadere, tot_a, max_gg FROM agg
  ),
  avv AS (
    SELECT al.cliente_id, COUNT(*)::int AS n_az
    FROM (
      SELECT DISTINCT a.id, a.cliente_id
      FROM public.azioni_recupero a
      JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
      JOIN public.scadenze s2 ON s2.id = ars.scadenza_id AND s2.stato_contabile = 'Aperta' AND s2.cliente_id = a.cliente_id
      WHERE a.tipo <> 'promemoria_scadenza'
    ) al GROUP BY al.cliente_id
  ),
  joined AS (
    SELECT cl.id, COALESCE(cl.bloccato,false) AS bloccato,
      COALESCE(cl.in_gestione_legale,false) AS in_gestione_legale,
      a.tot_s, a.tot_a, a.n_scadute, a.max_gg,
      COALESCE(av.n_az, 0) AS avvisato_n,
      CASE WHEN a.max_gg <= 0 THEN NULL WHEN a.max_gg <= 30 THEN '0_30' WHEN a.max_gg <= 60 THEN '31_60' ELSE 'oltre_60' END AS fascia
    FROM agg2 a
    JOIN public.clienti cl ON cl.id = a.cliente_id
    LEFT JOIN avv av ON av.cliente_id = cl.id
    WHERE public.user_can_access_cliente(cl.id)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_stato_blocco = 'tutti' OR (p_stato_blocco = 'bloccati' AND COALESCE(cl.bloccato,false) = true) OR (p_stato_blocco = 'non_bloccati' AND COALESCE(cl.bloccato,false) = false))
      AND (p_stato_legale = 'tutti' OR (p_stato_legale = 'in_legale' AND COALESCE(cl.in_gestione_legale,false) = true) OR (p_stato_legale = 'non_in_legale' AND COALESCE(cl.in_gestione_legale,false) = false))
      AND (NOT p_escludi_legale OR COALESCE(cl.in_gestione_legale,false) = false)
      AND (p_search IS NULL OR p_search = '' OR cl.ragione_sociale ILIKE '%' || p_search || '%' OR cl.codice_gestionale ILIKE '%' || p_search || '%')
      AND (p_agente IS NULL OR (p_agente = '__none__' AND cl.codice_agente IS NULL) OR cl.codice_agente = p_agente)
  ),
  filt AS (
    SELECT * FROM joined j
    WHERE (CASE WHEN j.tot_s >= 0 THEN j.tot_s >= COALESCE(p_importo_min,0)
                WHEN p_mostra_a_credito THEN abs(j.tot_s) >= COALESCE(p_importo_min,0)
                ELSE false END)
      AND (p_fascia = 'tutte' OR j.fascia = p_fascia)
      AND (p_avvisato = 'tutti' OR (p_avvisato = 'con_azioni' AND j.avvisato_n > 0) OR (p_avvisato = 'senza_azioni' AND j.avvisato_n = 0))
  ),
  bon AS (
    SELECT COUNT(*)::int AS n FROM cls_full WHERE cat <> 'pagato' AND upper(COALESCE(codice_pagamento,'')) = 'BOS'
  ),
  leg AS (
    SELECT COUNT(DISTINCT a.cliente_id)::int AS n FROM agg2 a
    JOIN public.clienti cl ON cl.id = a.cliente_id
    WHERE COALESCE(cl.in_gestione_legale,false) = true
      AND public.user_can_access_cliente(cl.id)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_agente IS NULL OR (p_agente = '__none__' AND cl.codice_agente IS NULL) OR cl.codice_agente = p_agente)
  )
  SELECT
    (SELECT COUNT(*)::int FROM filt),
    COALESCE((SELECT SUM(tot_s) FROM filt WHERE tot_s > 0), 0),
    COALESCE((SELECT SUM(tot_a) FROM filt), 0),
    (SELECT COUNT(*)::int FROM filt WHERE tot_s > 0),
    (SELECT COUNT(*)::int FROM filt WHERE bloccato = true),
    (SELECT n FROM leg),
    (SELECT COUNT(*)::int FROM filt WHERE tot_s < 0),
    COALESCE((SELECT SUM(tot_s) FROM filt WHERE tot_s < 0), 0),
    (SELECT n FROM bon),
    CASE WHEN p_escludi_legale THEN (SELECT n FROM leg) ELSE 0 END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_scadenziario_ids(
  p_search text DEFAULT NULL::text,
  p_store_id uuid DEFAULT NULL::uuid,
  p_fascia text DEFAULT 'tutte'::text,
  p_stato_blocco text DEFAULT 'tutti'::text,
  p_stato_legale text DEFAULT 'tutti'::text,
  p_escludi_bonifici boolean DEFAULT true,
  p_escludi_legale boolean DEFAULT true,
  p_avvisato text DEFAULT 'tutti'::text,
  p_importo_min numeric DEFAULT 0,
  p_mostra_a_credito boolean DEFAULT false,
  p_agente text DEFAULT NULL::text
)
 RETURNS TABLE(cliente_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_today date := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH cls_full AS (
    SELECT s.id, s.cliente_id, s.importo_scadenza, s.codice_pagamento, s.giorni_ritardo,
      public.is_anticipo(s.numero_documento) AS is_anticipo,
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
    WHERE cat <> 'pagato' AND (NOT p_escludi_bonifici OR upper(COALESCE(codice_pagamento, '')) <> 'BOS')
  ),
  agg AS (
    SELECT c.cliente_id AS cli_id,
      COUNT(*) FILTER (WHERE cat='scaduto')::int AS n_scadute,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND NOT is_anticipo), 0) AS ssa,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND is_anticipo), 0) AS ant,
      COUNT(*) FILTER (WHERE cat='a_scadere')::int AS n_a_scadere,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='a_scadere'), 0)::numeric AS tot_a,
      COALESCE(MAX(giorni_ritardo) FILTER (WHERE cat='scaduto'), 0)::int AS max_gg
    FROM cls c GROUP BY c.cliente_id
    HAVING COUNT(*) FILTER (WHERE cat='scaduto') > 0
  ),
  agg2 AS (
    SELECT agg.cli_id, agg.n_scadute, public.calcola_scaduto(agg.ssa, agg.ant) AS tot_s,
      agg.n_a_scadere, agg.tot_a, agg.max_gg FROM agg
  ),
  avv AS (
    SELECT al.cliente_id AS cli_id, COUNT(*)::int AS n_az
    FROM (
      SELECT DISTINCT a.id, a.cliente_id
      FROM public.azioni_recupero a
      JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
      JOIN public.scadenze s2 ON s2.id = ars.scadenza_id AND s2.stato_contabile = 'Aperta' AND s2.cliente_id = a.cliente_id
      WHERE a.tipo <> 'promemoria_scadenza'
    ) al GROUP BY al.cliente_id
  ),
  joined AS (
    SELECT cl.id AS cli_id, COALESCE(cl.bloccato,false) AS bloccato,
      COALESCE(cl.in_gestione_legale,false) AS in_gestione_legale,
      a.tot_s, a.tot_a, a.n_scadute, a.max_gg,
      COALESCE(av.n_az, 0) AS avvisato_n,
      CASE WHEN a.max_gg <= 0 THEN NULL WHEN a.max_gg <= 30 THEN '0_30' WHEN a.max_gg <= 60 THEN '31_60' ELSE 'oltre_60' END AS fascia
    FROM agg2 a
    JOIN public.clienti cl ON cl.id = a.cli_id
    LEFT JOIN avv av ON av.cli_id = cl.id
    WHERE public.user_can_access_cliente(cl.id)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_stato_blocco = 'tutti' OR (p_stato_blocco = 'bloccati' AND COALESCE(cl.bloccato,false) = true) OR (p_stato_blocco = 'non_bloccati' AND COALESCE(cl.bloccato,false) = false))
      AND (p_stato_legale = 'tutti' OR (p_stato_legale = 'in_legale' AND COALESCE(cl.in_gestione_legale,false) = true) OR (p_stato_legale = 'non_in_legale' AND COALESCE(cl.in_gestione_legale,false) = false))
      AND (NOT p_escludi_legale OR COALESCE(cl.in_gestione_legale,false) = false)
      AND (p_search IS NULL OR p_search = '' OR cl.ragione_sociale ILIKE '%' || p_search || '%' OR cl.codice_gestionale ILIKE '%' || p_search || '%')
      AND (p_agente IS NULL OR (p_agente = '__none__' AND cl.codice_agente IS NULL) OR cl.codice_agente = p_agente)
  )
  SELECT j.cli_id FROM joined j
  WHERE (CASE WHEN j.tot_s >= 0 THEN j.tot_s >= COALESCE(p_importo_min,0)
              WHEN p_mostra_a_credito THEN abs(j.tot_s) >= COALESCE(p_importo_min,0)
              ELSE false END)
    AND (p_fascia = 'tutte' OR j.fascia = p_fascia)
    AND (p_avvisato = 'tutti' OR (p_avvisato = 'con_azioni' AND j.avvisato_n > 0) OR (p_avvisato = 'senza_azioni' AND j.avvisato_n = 0));
END;
$function$;
