-- FM45 Fetta 2b: (A) i "di cui" coperture di totali/per_store si calcolano sempre
-- sull'insieme a filtro spento (stessi altri filtri); (B) get_scadenziario_lista_paginata
-- usa scadenziario_clienti_base (fonte unica) e accetta p_netto_coperture.

CREATE OR REPLACE FUNCTION public.get_scadenziario_totali(
  p_search text DEFAULT NULL::text, p_store_id uuid DEFAULT NULL::uuid, p_fascia text DEFAULT 'tutte'::text,
  p_stato_blocco text DEFAULT 'tutti'::text, p_stato_legale text DEFAULT 'tutti'::text,
  p_escludi_bonifici boolean DEFAULT true, p_escludi_legale boolean DEFAULT true,
  p_avvisato text DEFAULT 'tutti'::text, p_importo_min numeric DEFAULT 0,
  p_mostra_a_credito boolean DEFAULT false, p_agente text DEFAULT NULL::text,
  p_situazione text DEFAULT 'con_scaduto'::text, p_importo_min_a_scadere numeric DEFAULT 0,
  p_netto_coperture boolean DEFAULT false)
RETURNS TABLE(n_clienti_totali integer, tot_scaduto numeric, tot_a_scadere numeric, n_clienti_scaduti integer,
  n_clienti_bloccati integer, n_clienti_in_legale integer, n_clienti_crediti integer, tot_crediti numeric,
  n_bonifici_esclusi integer, n_legale_esclusi integer,
  tot_coperto_piani numeric, tot_coperto_promesse numeric, n_clienti_coperti_piani integer,
  n_clienti_coperti_promesse integer, n_promesse_da_verificare integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  -- Calcolo per cliente: SOLO da scadenziario_clienti_base (fonte unica).
  WITH filt AS (
    SELECT * FROM public.scadenziario_clienti_base(p_search, p_store_id, p_fascia, p_stato_blocco, p_stato_legale,
      p_escludi_bonifici, p_escludi_legale, p_avvisato, p_importo_min, p_mostra_a_credito, p_agente,
      p_situazione, p_importo_min_a_scadere, p_netto_coperture)
  ),
  -- "Di cui": sempre sull'insieme a filtro spento (stessi altri filtri).
  dc AS (
    SELECT * FROM public.scadenziario_clienti_base(p_search, p_store_id, p_fascia, p_stato_blocco, p_stato_legale,
      p_escludi_bonifici, p_escludi_legale, p_avvisato, p_importo_min, p_mostra_a_credito, p_agente,
      p_situazione, p_importo_min_a_scadere, false) WHERE p_netto_coperture
    UNION ALL
    SELECT * FROM filt WHERE NOT p_netto_coperture
  ),
  leg AS (
    SELECT COUNT(*)::int AS n FROM public.scadenziario_clienti_base(NULL, p_store_id, 'tutte', 'tutti', 'in_legale',
      p_escludi_bonifici, false, 'tutti', 0, true, p_agente,
      CASE WHEN p_situazione = 'portafoglio' THEN 'portafoglio'
           WHEN COALESCE(p_situazione,'con_scaduto') = 'con_scaduto' THEN 'con_scaduto'
           ELSE 'tutte' END, 0, false)
  ),
  bon AS (
    SELECT COUNT(*)::int AS n
    FROM public.scadenze s
    JOIN public.clienti cl ON cl.id = s.cliente_id
    WHERE (s.stato_contabile = 'Aperta' OR s.data_pagamento_effettiva IS NULL)
      AND upper(COALESCE(s.codice_pagamento,'')) = 'BOS'
      AND public.categoria_scadenza(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, CURRENT_DATE) <> 'pagato'
      AND public.user_can_access_cliente(cl.id, cl.store_id, cl.codice_agente)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_agente IS NULL OR (p_agente = '__none__' AND cl.codice_agente IS NULL) OR cl.codice_agente = p_agente)
  )
  SELECT
    (SELECT COUNT(*)::int FROM filt),
    COALESCE((SELECT SUM(f.tot_s) FROM filt f WHERE f.tot_s > 0), 0),
    COALESCE((SELECT SUM(f.tot_a) FROM filt f), 0),
    (SELECT COUNT(*)::int FROM filt f WHERE f.tot_s > 0),
    (SELECT COUNT(*)::int FROM filt f WHERE f.bloccato = true),
    (SELECT n FROM leg),
    (SELECT COUNT(*)::int FROM filt f WHERE f.tot_s < 0),
    COALESCE((SELECT SUM(f.tot_s) FROM filt f WHERE f.tot_s < 0), 0),
    (SELECT n FROM bon),
    CASE WHEN p_escludi_legale THEN (SELECT n FROM leg) ELSE 0 END,
    COALESCE((SELECT SUM(d.coperto_piani) FROM dc d WHERE d.tot_s_lordo > 0), 0),
    COALESCE((SELECT SUM(d.coperto_promesse) FROM dc d WHERE d.tot_s_lordo > 0), 0),
    (SELECT COUNT(*)::int FROM dc d WHERE d.tot_s_lordo > 0 AND d.coperto_piani > 0),
    (SELECT COUNT(*)::int FROM dc d WHERE d.tot_s_lordo > 0 AND d.coperto_promesse > 0),
    COALESCE((SELECT SUM(d.n_promesse_data_passata) FROM dc d), 0)::int;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_scadenziario_per_store(p_search text DEFAULT NULL::text, p_store_id uuid DEFAULT NULL::uuid, p_fascia text DEFAULT 'tutte'::text, p_stato_blocco text DEFAULT 'tutti'::text, p_stato_legale text DEFAULT 'tutti'::text, p_escludi_bonifici boolean DEFAULT true, p_escludi_legale boolean DEFAULT true, p_avvisato text DEFAULT 'tutti'::text, p_importo_min numeric DEFAULT 0, p_mostra_a_credito boolean DEFAULT false, p_agente text DEFAULT NULL::text, p_situazione text DEFAULT 'con_scaduto'::text, p_importo_min_a_scadere numeric DEFAULT 0, p_netto_coperture boolean DEFAULT false)
 RETURNS TABLE(store_id uuid, store_nome text, n_clienti_scaduti integer, tot_scaduto numeric, tot_a_scadere numeric, n_bloccati integer, n_in_legale integer, tot_coperto_piani numeric, tot_coperto_promesse numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Stesse regole di get_scadenziario_totali (da scadenziario_clienti_base), per punto vendita.
  -- I "di cui" sono sempre sull'insieme a filtro spento.
  WITH m AS (
    SELECT b.store_id AS sid,
      COUNT(*) FILTER (WHERE b.tot_s > 0)::int AS n_s,
      COALESCE(SUM(b.tot_s) FILTER (WHERE b.tot_s > 0), 0) AS t_s,
      COALESCE(SUM(b.tot_a), 0) AS t_a,
      COUNT(*) FILTER (WHERE b.bloccato)::int AS n_b,
      COUNT(*) FILTER (WHERE b.in_gestione_legale)::int AS n_l
    FROM public.scadenziario_clienti_base(p_search, p_store_id, p_fascia, p_stato_blocco, p_stato_legale,
      p_escludi_bonifici, p_escludi_legale, p_avvisato, p_importo_min, p_mostra_a_credito, p_agente,
      p_situazione, p_importo_min_a_scadere, p_netto_coperture) b
    GROUP BY b.store_id
  ),
  d AS (
    SELECT b.store_id AS sid,
      COALESCE(SUM(b.coperto_piani) FILTER (WHERE b.tot_s_lordo > 0), 0) AS cp,
      COALESCE(SUM(b.coperto_promesse) FILTER (WHERE b.tot_s_lordo > 0), 0) AS cpr
    FROM public.scadenziario_clienti_base(p_search, p_store_id, p_fascia, p_stato_blocco, p_stato_legale,
      p_escludi_bonifici, p_escludi_legale, p_avvisato, p_importo_min, p_mostra_a_credito, p_agente,
      p_situazione, p_importo_min_a_scadere, false) b
    GROUP BY b.store_id
  )
  SELECT COALESCE(m.sid, d.sid), COALESCE(st.nome, 'Senza negozio')::text,
    COALESCE(m.n_s, 0), COALESCE(m.t_s, 0), COALESCE(m.t_a, 0), COALESCE(m.n_b, 0), COALESCE(m.n_l, 0),
    COALESCE(d.cp, 0), COALESCE(d.cpr, 0)
  FROM m FULL JOIN d ON d.sid IS NOT DISTINCT FROM m.sid
  LEFT JOIN public.stores st ON st.id = COALESCE(m.sid, d.sid)
  ORDER BY 4 DESC
$function$;

DROP FUNCTION public.get_scadenziario_lista_paginata(text, uuid, text, text, text, boolean, boolean, text, numeric, boolean, integer, integer, text, text, integer, integer, text, text, numeric);

CREATE FUNCTION public.get_scadenziario_lista_paginata(p_search text DEFAULT NULL::text, p_store_id uuid DEFAULT NULL::uuid, p_fascia text DEFAULT 'tutte'::text, p_stato_blocco text DEFAULT 'tutti'::text, p_stato_legale text DEFAULT 'tutti'::text, p_escludi_bonifici boolean DEFAULT true, p_escludi_legale boolean DEFAULT true, p_avvisato text DEFAULT 'tutti'::text, p_importo_min numeric DEFAULT 0, p_mostra_a_credito boolean DEFAULT false, p_anno_corrente integer DEFAULT NULL::integer, p_anno_prec integer DEFAULT NULL::integer, p_sort_by text DEFAULT 'tot_scaduto'::text, p_sort_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25, p_agente text DEFAULT NULL::text, p_situazione text DEFAULT 'con_scaduto'::text, p_importo_min_a_scadere numeric DEFAULT 0, p_netto_coperture boolean DEFAULT false)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, store_id uuid, store_nome text, bloccato boolean, ind_blocco integer, in_gestione_legale boolean, n_scadute integer, tot_scaduto numeric, n_a_scadere integer, tot_a_scadere numeric, prossima_scadenza date, max_gg_ritardo integer, scadute_ids uuid[], fascia text, fatturato_cur numeric, fatturato_prec numeric, avvisato_n integer, avvisato_ha_email boolean, avvisato_ultima_tipo text, avvisato_ultima_data timestamp with time zone, ha_promessa boolean, data_promessa date, ha_piano_rientro boolean, piano_rientro_id uuid, piano_rate_pagate integer, piano_rate_totali integer, piano_prossima_rata_data date, piano_prossima_rata_importo numeric, total_count bigint, tot_scaduto_lordo numeric, coperto_piani numeric, coperto_promesse numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_today date := CURRENT_DATE;
  v_offset int := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,25));
  v_limit int := GREATEST(1, COALESCE(p_page_size,25));
BEGIN
  RETURN QUERY
  -- Clienti, importi, conteggi, fascia e filtri: SOLO da scadenziario_clienti_base.
  WITH base AS (
    SELECT * FROM public.scadenziario_clienti_base(p_search, p_store_id, p_fascia, p_stato_blocco, p_stato_legale,
      p_escludi_bonifici, p_escludi_legale, p_avvisato, p_importo_min, p_mostra_a_credito, p_agente,
      p_situazione, p_importo_min_a_scadere, p_netto_coperture)
  ),
  cop AS (
    SELECT c.scadenza_id FROM public.coperture_scadenziario() c WHERE p_netto_coperture AND c.origine = 'piano'
  ),
  -- Colonne di riga (id scadute, prossima scadenza): stesse righe della base;
  -- a filtro acceso escluse le scadenze coperte da piano.
  righe AS (
    SELECT s.cliente_id AS cli_id, s.id, s.data_scadenza,
      public.categoria_scadenza(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, v_today) AS cat
    FROM public.scadenze s
    JOIN base b ON b.cliente_id = s.cliente_id
    LEFT JOIN cop ON cop.scadenza_id = s.id
    WHERE (s.stato_contabile = 'Aperta' OR s.data_pagamento_effettiva IS NULL)
      AND (NOT p_escludi_bonifici OR upper(COALESCE(s.codice_pagamento, '')) <> 'BOS')
      AND cop.scadenza_id IS NULL
  ),
  rg AS (
    SELECT r.cli_id,
      MIN(r.data_scadenza) FILTER (WHERE r.cat = 'a_scadere') AS prossima_scadenza,
      COALESCE(ARRAY_AGG(r.id) FILTER (WHERE r.cat = 'scaduto'), ARRAY[]::uuid[]) AS scadute_ids
    FROM righe r GROUP BY r.cli_id
  ),
  avv AS (
    SELECT al.cli_id,
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
    SELECT DISTINCT ON (p.cliente_id) p.cliente_id AS cli_id, p.id AS piano_id
    FROM public.piani_rientro p
    WHERE p.stato = 'attivo'
    ORDER BY p.cliente_id, p.created_at DESC
  ),
  piano_stats AS (
    SELECT pa.cli_id, pa.piano_id,
      (SELECT COUNT(*)::int FROM public.piani_rientro_rate r WHERE r.piano_id = pa.piano_id AND r.stato = 'pagata') AS rate_pagate,
      (SELECT COUNT(*)::int FROM public.piani_rientro_rate r WHERE r.piano_id = pa.piano_id) AS rate_totali,
      (SELECT r.data_rata FROM public.piani_rientro_rate r
        WHERE r.piano_id = pa.piano_id AND r.stato = 'da_pagare' ORDER BY r.data_rata ASC LIMIT 1) AS prossima_data,
      (SELECT r.importo FROM public.piani_rientro_rate r
        WHERE r.piano_id = pa.piano_id AND r.stato = 'da_pagare' ORDER BY r.data_rata ASC LIMIT 1) AS prossima_importo
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
  filtered AS (
    SELECT
      b.cliente_id AS cli_id, cl.ragione_sociale, cl.codice_gestionale, b.store_id, st.nome AS store_nome,
      b.bloccato, COALESCE(cl.ind_blocco, 0)::int AS ind_blocco, b.in_gestione_legale,
      b.n_scadute, b.tot_s AS tot_scaduto, b.n_a_scadere, b.tot_a AS tot_a_scadere,
      rg.prossima_scadenza, b.max_gg AS max_gg_ritardo, COALESCE(rg.scadute_ids, ARRAY[]::uuid[]) AS scadute_ids,
      b.fascia,
      COALESCE(fat.cur, 0) AS fatturato_cur, COALESCE(fat.prev, 0) AS fatturato_prec,
      b.avvisato_n, COALESCE(avv.ha_email, false) AS avvisato_ha_email,
      avv.ultima_tipo AS avvisato_ultima_tipo, avv.ultima_data AS avvisato_ultima_data,
      (prom.data_promessa IS NOT NULL) AS ha_promessa, prom.data_promessa,
      (ps.piano_id IS NOT NULL) AS ha_piano_rientro, ps.piano_id AS piano_rientro_id,
      COALESCE(ps.rate_pagate, 0) AS piano_rate_pagate, COALESCE(ps.rate_totali, 0) AS piano_rate_totali,
      ps.prossima_data AS piano_prossima_rata_data, ps.prossima_importo AS piano_prossima_rata_importo,
      b.tot_s_lordo, b.coperto_piani, b.coperto_promesse
    FROM base b
    JOIN public.clienti cl ON cl.id = b.cliente_id
    LEFT JOIN public.stores st ON st.id = b.store_id
    LEFT JOIN rg ON rg.cli_id = b.cliente_id
    LEFT JOIN fat ON fat.cli_id = b.cliente_id
    LEFT JOIN avv ON avv.cli_id = b.cliente_id
    LEFT JOIN prom ON prom.cli_id = b.cliente_id
    LEFT JOIN piano_stats ps ON ps.cli_id = b.cliente_id
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
    (SELECT total FROM cnt) AS total_count,
    f.tot_s_lordo, f.coperto_piani, f.coperto_promesse
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
    CASE WHEN p_sort_by = 'codice_gestionale' AND p_sort_dir = 'asc'  THEN lpad(COALESCE(f.codice_gestionale,''), 20, '0') END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'codice_gestionale' AND p_sort_dir = 'desc' THEN lpad(COALESCE(f.codice_gestionale,''), 20, '0') END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'store_nome' AND p_sort_dir = 'asc'  THEN f.store_nome END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'store_nome' AND p_sort_dir = 'desc' THEN f.store_nome END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'fatturato_cur' AND p_sort_dir = 'asc'  THEN f.fatturato_cur END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'fatturato_cur' AND p_sort_dir = 'desc' THEN f.fatturato_cur END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'fatturato_prec' AND p_sort_dir = 'asc'  THEN f.fatturato_prec END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'fatturato_prec' AND p_sort_dir = 'desc' THEN f.fatturato_prec END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'n_scadute' AND p_sort_dir = 'asc'  THEN f.n_scadute END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'n_scadute' AND p_sort_dir = 'desc' THEN f.n_scadute END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'n_a_scadere' AND p_sort_dir = 'asc'  THEN f.n_a_scadere END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'n_a_scadere' AND p_sort_dir = 'desc' THEN f.n_a_scadere END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'prossima_scadenza' AND p_sort_dir = 'asc'  THEN f.prossima_scadenza END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'prossima_scadenza' AND p_sort_dir = 'desc' THEN f.prossima_scadenza END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'bloccato' AND p_sort_dir = 'asc'  THEN f.bloccato END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'bloccato' AND p_sort_dir = 'desc' THEN f.bloccato END DESC NULLS LAST,
    f.ragione_sociale ASC
  OFFSET v_offset LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_scadenziario_lista_paginata(text, uuid, text, text, text, boolean, boolean, text, numeric, boolean, integer, integer, text, text, integer, integer, text, text, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_scadenziario_lista_paginata(text, uuid, text, text, text, boolean, boolean, text, numeric, boolean, integer, integer, text, text, integer, integer, text, text, numeric, boolean) TO authenticated, service_role;
