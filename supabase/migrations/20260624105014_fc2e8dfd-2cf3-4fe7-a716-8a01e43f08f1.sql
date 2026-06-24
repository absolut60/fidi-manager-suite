
-- ============================================================
-- Regola SCADUTO con clamp SELETTIVO anticipi vs note di credito.
-- Fonte di verita' TS: src/lib/scadenze.ts (sommaScadutoCliente).
-- Formula per cliente:
--   ssa = SUM(importo_scadenza) righe scadute NON-anticipo
--   ant = SUM(importo_scadenza) righe scadute anticipo
--   tot = GREATEST(ssa - ant, LEAST(ssa, 0))
-- Significato: l'anticipo non rende negativo il totale, ma le note di
-- credito reali (negativi non-anticipo) restano visibili.
-- ============================================================

-- 1) get_clienti_scadenziario ---------------------------------
CREATE OR REPLACE FUNCTION public.get_clienti_scadenziario()
 RETURNS TABLE(cliente_id uuid, totale_scaduto numeric, totale_a_scadere numeric, ha_scaduto boolean, ha_a_scadere boolean)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH cls AS (
    SELECT s.cliente_id, s.importo_scadenza,
      (s.numero_documento ILIKE '%ANTICIPO%') AS is_anticipo,
      CASE
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE THEN 'scaduto'
        WHEN s.data_pagamento_effettiva IS NOT NULL THEN 'pagato'
        WHEN s.data_scadenza IS NOT NULL AND s.data_scadenza >= CURRENT_DATE THEN 'a_scadere'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NULL THEN
          CASE WHEN COALESCE(s.giorni_ritardo, 0) > 0 THEN 'scaduto' ELSE 'a_scadere' END
        ELSE 'pagato'
      END AS categoria
    FROM public.scadenze s
  ),
  per AS (
    SELECT cliente_id,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE categoria='scaduto' AND NOT is_anticipo), 0) AS ssa,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE categoria='scaduto' AND is_anticipo), 0)     AS ant,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE categoria='a_scadere'), 0)                   AS a_scad,
      bool_or(categoria='scaduto')   AS has_s,
      bool_or(categoria='a_scadere') AS has_a
    FROM cls GROUP BY cliente_id
  )
  SELECT cliente_id,
    GREATEST(ssa - ant, LEAST(ssa, 0)) AS totale_scaduto,
    a_scad, has_s, has_a
  FROM per;
$function$;

-- 2) get_clienti_senza_email_con_scadenze ---------------------
CREATE OR REPLACE FUNCTION public.get_clienti_senza_email_con_scadenze()
 RETURNS TABLE(cliente_id uuid, codice_gestionale text, ragione_sociale text, email text, pec text, store_nome text, totale_scaduto numeric, totale_a_scadere numeric, n_scadenze_aperte integer, stato_email text)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH cls AS (
    SELECT s.cliente_id, s.importo_scadenza,
      (s.numero_documento ILIKE '%ANTICIPO%') AS is_anticipo,
      CASE
        WHEN s.stato_contabile IS NOT NULL AND s.stato_contabile <> 'Aperta' THEN 'pagato'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' THEN 'a_scadere'
        ELSE 'pagato'
      END AS cat
    FROM public.scadenze s
  ),
  agg AS (
    SELECT cliente_id,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND NOT is_anticipo), 0) AS ssa,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND is_anticipo), 0)     AS ant,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='a_scadere'),0)                    AS tot_a_scadere,
      COUNT(*) FILTER (WHERE cat IN ('scaduto','a_scadere'))::int                          AS n_aperte
    FROM cls GROUP BY cliente_id
    HAVING COUNT(*) FILTER (WHERE cat IN ('scaduto','a_scadere')) > 0
  ),
  base AS (
    SELECT c.id, c.codice_gestionale, c.ragione_sociale, c.email, c.pec,
           st.nome AS store_nome,
           GREATEST(agg.ssa - agg.ant, LEAST(agg.ssa, 0)) AS tot_scaduto,
           agg.tot_a_scadere, agg.n_aperte,
           CASE
             WHEN c.email IS NULL OR btrim(c.email) = '' THEN 'vuota'
             WHEN btrim(c.email) ~ '[;,]' THEN 'multipla'
             WHEN position('@' IN btrim(c.email)) = 0 THEN 'non_email'
             WHEN btrim(c.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN 'ok'
             ELSE 'malformata'
           END AS stato_email
    FROM agg
    JOIN public.clienti c ON c.id = agg.cliente_id
    LEFT JOIN public.stores st ON st.id = c.store_id
  )
  SELECT id, codice_gestionale, ragione_sociale, email, pec, store_nome,
         tot_scaduto, tot_a_scadere, n_aperte, stato_email
  FROM base
  WHERE stato_email <> 'ok'
  ORDER BY store_nome ASC NULLS LAST, tot_scaduto DESC;
$function$;

-- 3) get_recupero_clienti_aggregato ---------------------------
CREATE OR REPLACE FUNCTION public.get_recupero_clienti_aggregato(_store_id uuid DEFAULT NULL::uuid, _operatore_id uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text, _data_da timestamp with time zone DEFAULT NULL::timestamp with time zone, _data_a timestamp with time zone DEFAULT NULL::timestamp with time zone, _esiti text[] DEFAULT NULL::text[], _tipi text[] DEFAULT NULL::text[], _stadi integer[] DEFAULT NULL::integer[])
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, store_id uuid, store_nome text, totale_scaduto numeric, azioni_totali integer, azioni_aperte integer, prossima_tipo text, prossima_data timestamp with time zone, ultima_fatta_tipo text, ultima_fatta_data timestamp with time zone, ha_promessa boolean, data_promessa timestamp with time zone, in_ritardo boolean, stadio_sollecito smallint, stadio_data timestamp with time zone, stadio_giorni integer)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH az AS (
    SELECT a.id, a.cliente_id, a.tipo, a.esito, a.data_azione, a.data_promessa_pagamento
    FROM public.azioni_recupero a
    JOIN public.clienti c ON c.id = a.cliente_id
    WHERE a.tipo <> 'promemoria_scadenza'
      AND (_store_id IS NULL OR c.store_id = _store_id)
      AND (_operatore_id IS NULL OR a.operatore_id = _operatore_id)
      AND (_search IS NULL OR _search = '' OR c.ragione_sociale ILIKE '%' || _search || '%')
      AND (_data_da IS NULL OR a.data_azione >= _data_da)
      AND (_data_a IS NULL OR a.data_azione <= _data_a)
      AND (_esiti IS NULL OR a.esito::text = ANY(_esiti))
      AND (_tipi IS NULL OR a.tipo::text = ANY(_tipi))
  ),
  scad AS (
    SELECT s.cliente_id,
      SUM(CASE WHEN s.numero_documento ILIKE '%ANTICIPO%' THEN 0 ELSE s.importo_scadenza END) AS ssa,
      SUM(CASE WHEN s.numero_documento ILIKE '%ANTICIPO%' THEN s.importo_scadenza ELSE 0 END) AS ant
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta'
      AND s.data_scadenza IS NOT NULL
      AND s.data_scadenza < CURRENT_DATE
    GROUP BY s.cliente_id
  ),
  scad_clamp AS (
    SELECT cliente_id, GREATEST(COALESCE(ssa,0) - COALESCE(ant,0), LEAST(COALESCE(ssa,0), 0)) AS totale_scaduto
    FROM scad
  ),
  per_cliente AS (
    SELECT az.cliente_id,
      COUNT(*)::int AS azioni_totali,
      COUNT(*) FILTER (WHERE az.esito = 'da_fare')::int AS azioni_aperte,
      bool_or(az.esito = 'promessa_pagamento') AS ha_promessa,
      MAX(az.data_promessa_pagamento) FILTER (WHERE az.esito = 'promessa_pagamento') AS data_promessa,
      bool_or(az.esito = 'da_fare' AND az.data_azione < now()) AS in_ritardo
    FROM az GROUP BY az.cliente_id
  ),
  prossima AS (
    SELECT DISTINCT ON (az.cliente_id) az.cliente_id, az.tipo::text AS tipo, az.data_azione
    FROM az WHERE az.esito='da_fare' ORDER BY az.cliente_id, az.data_azione ASC
  ),
  ultima AS (
    SELECT DISTINCT ON (az.cliente_id) az.cliente_id, az.tipo::text AS tipo, az.data_azione
    FROM az WHERE az.esito='fatto' ORDER BY az.cliente_id, az.data_azione DESC
  ),
  email_aperte AS (
    SELECT DISTINCT a.id, a.cliente_id, a.livello_sollecito, a.data_azione
    FROM public.azioni_recupero a
    JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
    JOIN public.scadenze s ON s.id = ars.scadenza_id
    WHERE a.tipo='email' AND a.livello_sollecito BETWEEN 1 AND 3
      AND s.stato_contabile='Aperta'
  ),
  stadio_cli AS (
    SELECT cliente_id,
      MAX(livello_sollecito)::smallint AS stadio_sollecito,
      MAX(data_azione) FILTER (
        WHERE livello_sollecito = (SELECT MAX(e2.livello_sollecito) FROM email_aperte e2 WHERE e2.cliente_id=email_aperte.cliente_id)
      ) AS stadio_data
    FROM email_aperte GROUP BY cliente_id
  )
  SELECT c.id, c.ragione_sociale, c.store_id, st.nome,
    COALESCE(sc.totale_scaduto,0),
    pc.azioni_totali, pc.azioni_aperte,
    p.tipo, p.data_azione, u.tipo, u.data_azione,
    pc.ha_promessa, pc.data_promessa, pc.in_ritardo,
    COALESCE(stc.stadio_sollecito, 0::smallint),
    stc.stadio_data,
    CASE WHEN stc.stadio_data IS NOT NULL THEN EXTRACT(DAY FROM (now() - stc.stadio_data))::int END
  FROM per_cliente pc
  JOIN public.clienti c ON c.id = pc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN scad_clamp sc ON sc.cliente_id = c.id
  LEFT JOIN prossima p ON p.cliente_id = c.id
  LEFT JOIN ultima u ON u.cliente_id = c.id
  LEFT JOIN stadio_cli stc ON stc.cliente_id = c.id
  WHERE (_stadi IS NULL OR COALESCE(stc.stadio_sollecito, 0::smallint)::int = ANY(_stadi));
$function$;

-- 4) get_scadenziario_lista_paginata --------------------------
CREATE OR REPLACE FUNCTION public.get_scadenziario_lista_paginata(p_search text DEFAULT NULL::text, p_store_id uuid DEFAULT NULL::uuid, p_fascia text DEFAULT 'tutte'::text, p_stato_blocco text DEFAULT 'tutti'::text, p_stato_legale text DEFAULT 'tutti'::text, p_escludi_bonifici boolean DEFAULT true, p_escludi_legale boolean DEFAULT true, p_avvisato text DEFAULT 'tutti'::text, p_importo_min numeric DEFAULT 0, p_mostra_a_credito boolean DEFAULT false, p_anno_corrente integer DEFAULT NULL::integer, p_anno_prec integer DEFAULT NULL::integer, p_sort_by text DEFAULT 'tot_scaduto'::text, p_sort_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, store_id uuid, store_nome text, bloccato boolean, ind_blocco integer, in_gestione_legale boolean, n_scadute integer, tot_scaduto numeric, n_a_scadere integer, tot_a_scadere numeric, prossima_scadenza date, max_gg_ritardo integer, scadute_ids uuid[], fascia text, fatturato_cur numeric, fatturato_prec numeric, avvisato_n integer, avvisato_ha_email boolean, avvisato_ultima_tipo text, avvisato_ultima_data timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_today  date := CURRENT_DATE;
  v_offset int  := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,25));
  v_limit  int  := GREATEST(1, COALESCE(p_page_size,25));
BEGIN
  RETURN QUERY
  WITH cls AS (
    SELECT s.id, s.cliente_id, s.importo_scadenza,
      (s.numero_documento ILIKE '%ANTICIPO%') AS is_anticipo,
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
    SELECT c.cliente_id,
      COUNT(*) FILTER (WHERE c.cat = 'scaduto')::int                                                     AS n_scadute,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat='scaduto' AND NOT c.is_anticipo), 0)         AS ssa,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat='scaduto' AND c.is_anticipo), 0)             AS ant,
      COUNT(*) FILTER (WHERE c.cat = 'a_scadere')::int                                                   AS n_a_scadere,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat = 'a_scadere'), 0)::numeric                  AS tot_a_scadere,
      MIN(c.data_scadenza) FILTER (WHERE c.cat = 'a_scadere')                                            AS prossima_scadenza,
      COALESCE(MAX(c.giorni_ritardo) FILTER (WHERE c.cat = 'scaduto'), 0)::int                          AS max_gg,
      COALESCE(ARRAY_AGG(c.id) FILTER (WHERE c.cat = 'scaduto'), ARRAY[]::uuid[])                       AS scadute_ids
    FROM cls c
    GROUP BY c.cliente_id
    HAVING COUNT(*) FILTER (WHERE c.cat = 'scaduto') > 0
  ),
  agg2 AS (
    SELECT cliente_id, n_scadute,
      GREATEST(ssa - ant, LEAST(ssa, 0))::numeric AS tot_scaduto,
      n_a_scadere, tot_a_scadere, prossima_scadenza, max_gg, scadute_ids
    FROM agg
  ),
  avv AS (
    SELECT al.cliente_id,
      COUNT(*)::int                                          AS n_az,
      bool_or(al.tipo = 'email')                             AS ha_email,
      (ARRAY_AGG(al.tipo ORDER BY al.data_azione DESC))[1]   AS ultima_tipo,
      MAX(al.data_azione)                                    AS ultima_data
    FROM (
      SELECT DISTINCT a.id, a.cliente_id, a.tipo::text AS tipo, a.data_azione
      FROM public.azioni_recupero a
      JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
      JOIN public.scadenze s2 ON s2.id = ars.scadenza_id
                              AND s2.stato_contabile = 'Aperta'
                              AND s2.cliente_id = a.cliente_id
      WHERE a.tipo <> 'promemoria_scadenza'
    ) al
    GROUP BY al.cliente_id
  ),
  fat AS (
    SELECT f.cliente_id,
      COALESCE(SUM(f.fatturato) FILTER (WHERE f.anno = p_anno_corrente), 0)::numeric AS cur,
      COALESCE(SUM(f.fatturato) FILTER (WHERE f.anno = p_anno_prec),    0)::numeric AS prev
    FROM public.fatturato_clienti f
    WHERE p_anno_corrente IS NOT NULL
      AND f.anno IN (p_anno_corrente, COALESCE(p_anno_prec, p_anno_corrente - 1))
    GROUP BY f.cliente_id
  ),
  joined AS (
    SELECT
      cl.id                                AS cliente_id,
      cl.ragione_sociale,
      cl.codice_gestionale,
      cl.store_id,
      st.nome                              AS store_nome,
      COALESCE(cl.bloccato, false)         AS bloccato,
      COALESCE(cl.ind_blocco, 0)::int      AS ind_blocco,
      COALESCE(cl.in_gestione_legale,false) AS in_gestione_legale,
      agg2.n_scadute,
      agg2.tot_scaduto,
      agg2.n_a_scadere,
      agg2.tot_a_scadere,
      agg2.prossima_scadenza,
      agg2.max_gg                          AS max_gg_ritardo,
      agg2.scadute_ids,
      CASE
        WHEN agg2.max_gg <= 0  THEN NULL
        WHEN agg2.max_gg <= 30 THEN '0_30'
        WHEN agg2.max_gg <= 60 THEN '31_60'
        ELSE 'oltre_60'
      END                                  AS fascia,
      COALESCE(fat.cur,  0)                AS fatturato_cur,
      COALESCE(fat.prev, 0)                AS fatturato_prec,
      COALESCE(avv.n_az, 0)                AS avvisato_n,
      COALESCE(avv.ha_email, false)        AS avvisato_ha_email,
      avv.ultima_tipo                      AS avvisato_ultima_tipo,
      avv.ultima_data                      AS avvisato_ultima_data
    FROM agg2
    JOIN public.clienti cl ON cl.id = agg2.cliente_id
    LEFT JOIN public.stores st ON st.id = cl.store_id
    LEFT JOIN fat ON fat.cliente_id = cl.id
    LEFT JOIN avv ON avv.cliente_id = cl.id
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
  ),
  filtered AS (
    SELECT * FROM joined j
    WHERE
      (CASE
         WHEN j.tot_scaduto >= 0      THEN j.tot_scaduto    >= COALESCE(p_importo_min, 0)
         WHEN p_mostra_a_credito      THEN abs(j.tot_scaduto) >= COALESCE(p_importo_min, 0)
         ELSE false
       END)
      AND (p_fascia = 'tutte' OR (j.n_scadute > 0 AND j.fascia = p_fascia))
      AND (p_avvisato = 'tutti'
           OR (p_avvisato = 'con_azioni'  AND j.avvisato_n > 0)
           OR (p_avvisato = 'senza_azioni' AND j.avvisato_n = 0))
  ),
  cnt AS (SELECT COUNT(*)::bigint AS total FROM filtered)
  SELECT
    f.cliente_id, f.ragione_sociale, f.codice_gestionale, f.store_id, f.store_nome,
    f.bloccato, f.ind_blocco, f.in_gestione_legale,
    f.n_scadute, f.tot_scaduto, f.n_a_scadere, f.tot_a_scadere,
    f.prossima_scadenza, f.max_gg_ritardo, f.scadute_ids, f.fascia,
    f.fatturato_cur, f.fatturato_prec,
    f.avvisato_n, f.avvisato_ha_email, f.avvisato_ultima_tipo, f.avvisato_ultima_data,
    (SELECT total FROM cnt) AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN f.tot_scaduto >= 0 THEN 0 ELSE 1 END,
    CASE WHEN p_sort_by = 'tot_scaduto'     AND p_sort_dir = 'asc'  THEN f.tot_scaduto    END ASC  NULLS LAST,
    CASE WHEN p_sort_by = 'tot_scaduto'     AND p_sort_dir = 'desc' THEN f.tot_scaduto    END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'tot_a_scadere'   AND p_sort_dir = 'asc'  THEN f.tot_a_scadere  END ASC  NULLS LAST,
    CASE WHEN p_sort_by = 'tot_a_scadere'   AND p_sort_dir = 'desc' THEN f.tot_a_scadere  END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'max_gg'          AND p_sort_dir = 'asc'  THEN f.max_gg_ritardo END ASC  NULLS LAST,
    CASE WHEN p_sort_by = 'max_gg'          AND p_sort_dir = 'desc' THEN f.max_gg_ritardo END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'ragione_sociale' AND p_sort_dir = 'asc'  THEN f.ragione_sociale END ASC  NULLS LAST,
    CASE WHEN p_sort_by = 'ragione_sociale' AND p_sort_dir = 'desc' THEN f.ragione_sociale END DESC NULLS LAST,
    f.ragione_sociale ASC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

-- 5) get_scadenziario_totali ----------------------------------
CREATE OR REPLACE FUNCTION public.get_scadenziario_totali(p_search text DEFAULT NULL::text, p_store_id uuid DEFAULT NULL::uuid, p_fascia text DEFAULT 'tutte'::text, p_stato_blocco text DEFAULT 'tutti'::text, p_stato_legale text DEFAULT 'tutti'::text, p_escludi_bonifici boolean DEFAULT true, p_escludi_legale boolean DEFAULT true, p_avvisato text DEFAULT 'tutti'::text, p_importo_min numeric DEFAULT 0, p_mostra_a_credito boolean DEFAULT false)
 RETURNS TABLE(n_clienti_totali integer, tot_scaduto numeric, tot_a_scadere numeric, n_clienti_scaduti integer, n_clienti_bloccati integer, n_clienti_in_legale integer, n_clienti_crediti integer, tot_crediti numeric, n_bonifici_esclusi integer, n_legale_esclusi integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    SELECT cliente_id,
      COUNT(*) FILTER (WHERE cat='scaduto')::int                                              AS n_scadute,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND NOT is_anticipo), 0)     AS ssa,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND is_anticipo), 0)         AS ant,
      COUNT(*) FILTER (WHERE cat='a_scadere')::int                                            AS n_a_scadere,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='a_scadere'), 0)::numeric              AS tot_a,
      COALESCE(MAX(giorni_ritardo) FILTER (WHERE cat='scaduto'), 0)::int                      AS max_gg
    FROM cls
    GROUP BY cliente_id
    HAVING COUNT(*) FILTER (WHERE cat='scaduto') > 0
  ),
  agg2 AS (
    SELECT cliente_id, n_scadute,
      GREATEST(ssa - ant, LEAST(ssa, 0))::numeric AS tot_s,
      n_a_scadere, tot_a, max_gg
    FROM agg
  ),
  avv AS (
    SELECT al.cliente_id, COUNT(*)::int AS n_az
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
    SELECT cl.id, COALESCE(cl.bloccato,false) AS bloccato,
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
    JOIN public.clienti cl ON cl.id = a.cliente_id
    LEFT JOIN avv av ON av.cliente_id = cl.id
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
  ),
  filt AS (
    SELECT * FROM joined j
    WHERE (CASE WHEN j.tot_s >= 0  THEN j.tot_s     >= COALESCE(p_importo_min,0)
                WHEN p_mostra_a_credito THEN abs(j.tot_s) >= COALESCE(p_importo_min,0)
                ELSE false END)
      AND (p_fascia = 'tutte' OR j.fascia = p_fascia)
      AND (p_avvisato = 'tutti'
           OR (p_avvisato = 'con_azioni'  AND j.avvisato_n > 0)
           OR (p_avvisato = 'senza_azioni' AND j.avvisato_n = 0))
  ),
  bon AS (
    SELECT COUNT(*)::int AS n FROM cls_full
    WHERE cat <> 'pagato' AND upper(COALESCE(codice_pagamento,'')) = 'BOS'
  ),
  leg AS (
    SELECT COUNT(DISTINCT a.cliente_id)::int AS n
    FROM agg2 a
    JOIN public.clienti cl ON cl.id = a.cliente_id
    WHERE COALESCE(cl.in_gestione_legale,false) = true
      AND public.user_can_access_cliente(cl.id)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
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
