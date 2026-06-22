-- RPC paginata per la pagina /scadenziario.
-- Sostituisce il download di TUTTE le scadenze+clienti + aggregazione JS.
-- Restituisce SOLO la pagina richiesta, gia' aggregata per cliente e ordinata.
-- Classificazione UFFICIALE (specchio di src/lib/scadenze.ts):
--   SCADUTO   = stato_contabile='Aperta' AND data_scadenza < oggi
--   A SCADERE = data_pagamento_effettiva IS NULL AND data_scadenza >= oggi
--   PAGATO    = altrimenti (escluso dalla lista)

CREATE OR REPLACE FUNCTION public.get_scadenziario_lista_paginata(
  p_search             text    DEFAULT NULL,
  p_store_id           uuid    DEFAULT NULL,
  p_fascia             text    DEFAULT 'tutte',          -- tutte|0_30|31_60|oltre_60
  p_stato_blocco       text    DEFAULT 'tutti',          -- tutti|bloccati|non_bloccati
  p_stato_legale       text    DEFAULT 'tutti',          -- tutti|in_legale|non_in_legale
  p_escludi_bonifici   boolean DEFAULT true,
  p_escludi_legale     boolean DEFAULT true,
  p_avvisato           text    DEFAULT 'tutti',          -- tutti|con_azioni|senza_azioni
  p_importo_min        numeric DEFAULT 0,
  p_mostra_a_credito   boolean DEFAULT false,
  p_anno_corrente      int     DEFAULT NULL,
  p_anno_prec          int     DEFAULT NULL,
  p_sort_by            text    DEFAULT 'tot_scaduto',    -- tot_scaduto|tot_a_scadere|ragione_sociale|max_gg
  p_sort_dir           text    DEFAULT 'desc',           -- asc|desc
  p_page               int     DEFAULT 1,
  p_page_size          int     DEFAULT 25
)
RETURNS TABLE(
  cliente_id              uuid,
  ragione_sociale         text,
  codice_gestionale       text,
  store_id                uuid,
  store_nome              text,
  bloccato                boolean,
  ind_blocco              int,
  in_gestione_legale      boolean,
  n_scadute               int,
  tot_scaduto             numeric,
  n_a_scadere             int,
  tot_a_scadere           numeric,
  prossima_scadenza       date,
  max_gg_ritardo          int,
  scadute_ids             uuid[],
  fascia                  text,
  fatturato_cur           numeric,
  fatturato_prec          numeric,
  avvisato_n              int,
  avvisato_ha_email       boolean,
  avvisato_ultima_tipo    text,
  avvisato_ultima_data    timestamptz,
  total_count             bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today  date := CURRENT_DATE;
  v_offset int  := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,25));
  v_limit  int  := GREATEST(1, COALESCE(p_page_size,25));
BEGIN
  RETURN QUERY
  WITH cls AS (
    SELECT
      s.id,
      s.cliente_id,
      s.importo_scadenza,
      s.data_scadenza,
      s.giorni_ritardo,
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
    SELECT
      c.cliente_id,
      COUNT(*) FILTER (WHERE c.cat = 'scaduto')::int                                       AS n_scadute,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat = 'scaduto'), 0)::numeric        AS tot_scaduto,
      COUNT(*) FILTER (WHERE c.cat = 'a_scadere')::int                                     AS n_a_scadere,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat = 'a_scadere'), 0)::numeric     AS tot_a_scadere,
      MIN(c.data_scadenza) FILTER (WHERE c.cat = 'a_scadere')                              AS prossima_scadenza,
      COALESCE(MAX(c.giorni_ritardo) FILTER (WHERE c.cat = 'scaduto'), 0)::int             AS max_gg,
      COALESCE(ARRAY_AGG(c.id) FILTER (WHERE c.cat = 'scaduto'), ARRAY[]::uuid[])          AS scadute_ids
    FROM cls c
    GROUP BY c.cliente_id
    HAVING COUNT(*) FILTER (WHERE c.cat = 'scaduto') > 0
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
      agg.n_scadute,
      agg.tot_scaduto,
      agg.n_a_scadere,
      agg.tot_a_scadere,
      agg.prossima_scadenza,
      agg.max_gg                           AS max_gg_ritardo,
      agg.scadute_ids,
      CASE
        WHEN agg.max_gg <= 0  THEN NULL
        WHEN agg.max_gg <= 30 THEN '0_30'
        WHEN agg.max_gg <= 60 THEN '31_60'
        ELSE 'oltre_60'
      END                                  AS fascia,
      COALESCE(fat.cur,  0)                AS fatturato_cur,
      COALESCE(fat.prev, 0)                AS fatturato_prec,
      COALESCE(avv.n_az, 0)                AS avvisato_n,
      COALESCE(avv.ha_email, false)        AS avvisato_ha_email,
      avv.ultima_tipo                      AS avvisato_ultima_tipo,
      avv.ultima_data                      AS avvisato_ultima_data
    FROM agg
    JOIN public.clienti cl ON cl.id = agg.cliente_id
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
    -- Debitori (tot>=0) prima, crediti (tot<0) in fondo
    CASE WHEN f.tot_scaduto >= 0 THEN 0 ELSE 1 END,
    -- Sort utente
    CASE WHEN p_sort_by = 'tot_scaduto'     AND p_sort_dir = 'asc'  THEN f.tot_scaduto    END ASC  NULLS LAST,
    CASE WHEN p_sort_by = 'tot_scaduto'     AND p_sort_dir = 'desc' THEN f.tot_scaduto    END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'tot_a_scadere'   AND p_sort_dir = 'asc'  THEN f.tot_a_scadere  END ASC  NULLS LAST,
    CASE WHEN p_sort_by = 'tot_a_scadere'   AND p_sort_dir = 'desc' THEN f.tot_a_scadere  END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'max_gg'          AND p_sort_dir = 'asc'  THEN f.max_gg_ritardo END ASC  NULLS LAST,
    CASE WHEN p_sort_by = 'max_gg'          AND p_sort_dir = 'desc' THEN f.max_gg_ritardo END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'ragione_sociale' AND p_sort_dir = 'asc'  THEN f.ragione_sociale END ASC  NULLS LAST,
    CASE WHEN p_sort_by = 'ragione_sociale' AND p_sort_dir = 'desc' THEN f.ragione_sociale END DESC NULLS LAST,
    -- Fallback stabile
    f.ragione_sociale ASC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_scadenziario_lista_paginata(
  text, uuid, text, text, text, boolean, boolean, text, numeric, boolean, int, int, text, text, int, int
) TO authenticated;


-- RPC dei totali / KPI di intestazione, calcolati su TUTTI i clienti che matchano il filtro.
-- I numeri devono coincidere con quelli mostrati nelle KPI cards quando si applicano gli stessi filtri.

CREATE OR REPLACE FUNCTION public.get_scadenziario_totali(
  p_search           text    DEFAULT NULL,
  p_store_id         uuid    DEFAULT NULL,
  p_fascia           text    DEFAULT 'tutte',
  p_stato_blocco     text    DEFAULT 'tutti',
  p_stato_legale     text    DEFAULT 'tutti',
  p_escludi_bonifici boolean DEFAULT true,
  p_escludi_legale   boolean DEFAULT true,
  p_avvisato         text    DEFAULT 'tutti',
  p_importo_min      numeric DEFAULT 0,
  p_mostra_a_credito boolean DEFAULT false
)
RETURNS TABLE(
  n_clienti_totali     int,
  tot_scaduto          numeric,
  tot_a_scadere        numeric,
  n_clienti_scaduti    int,
  n_clienti_bloccati   int,
  n_clienti_in_legale  int,
  n_clienti_crediti    int,
  tot_crediti          numeric,
  n_bonifici_esclusi   int,
  n_legale_esclusi     int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH cls_full AS (
    -- senza esclusione bonifici, per conteggio bonifici_esclusi
    SELECT s.id, s.cliente_id, s.importo_scadenza, s.codice_pagamento,
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
      COUNT(*) FILTER (WHERE cat='scaduto')::int                                  AS n_scadute,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto'), 0)::numeric    AS tot_s,
      COUNT(*) FILTER (WHERE cat='a_scadere')::int                                AS n_a_scadere,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='a_scadere'), 0)::numeric  AS tot_a,
      COALESCE(MAX(NULL::int), 0) AS _pad
    FROM cls
    GROUP BY cliente_id
    HAVING COUNT(*) FILTER (WHERE cat='scaduto') > 0
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
      a.tot_s, a.tot_a, a.n_scadute,
      COALESCE(av.n_az, 0) AS avvisato_n,
      CASE WHEN COALESCE(a.n_scadute,0) = 0 THEN NULL
        WHEN (SELECT MAX(c2.giorni_ritardo) FILTER (WHERE c2.cat='scaduto') FROM cls c2 WHERE c2.cliente_id = cl.id) <= 30 THEN '0_30'
        WHEN (SELECT MAX(c2.giorni_ritardo) FILTER (WHERE c2.cat='scaduto') FROM cls c2 WHERE c2.cliente_id = cl.id) <= 60 THEN '31_60'
        ELSE 'oltre_60'
      END AS fascia
    FROM agg a
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
    -- clienti in legale con scadenze aperte (rispettando store + bonifici)
    SELECT COUNT(DISTINCT a.cliente_id)::int AS n
    FROM agg a
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
$$;

GRANT EXECUTE ON FUNCTION public.get_scadenziario_totali(
  text, uuid, text, text, text, boolean, boolean, text, numeric, boolean
) TO authenticated;