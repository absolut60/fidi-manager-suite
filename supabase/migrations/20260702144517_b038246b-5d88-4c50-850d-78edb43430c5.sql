
CREATE OR REPLACE FUNCTION public.is_anticipo(_numero_documento text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(_numero_documento, '') ILIKE '%ANTICIPO%';
$$;

CREATE OR REPLACE FUNCTION public.calcola_scaduto(_ssa numeric, _ant numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(COALESCE(_ssa, 0) - COALESCE(_ant, 0), LEAST(COALESCE(_ssa, 0), 0));
$$;

COMMENT ON FUNCTION public.is_anticipo(text) IS 'Riconosce anticipi da numero_documento. Fonte unica.';
COMMENT ON FUNCTION public.calcola_scaduto(numeric, numeric) IS 'Formula scaduto: GREATEST(ssa - ant, LEAST(ssa,0)). Fonte SQL unica. Gemella TS: sommaScadutoCliente().';

REVOKE ALL ON FUNCTION public.is_anticipo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calcola_scaduto(numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_anticipo(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calcola_scaduto(numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_clienti_scadenziario()
RETURNS TABLE(cliente_id uuid, totale_scaduto numeric, totale_a_scadere numeric, ha_scaduto boolean, ha_a_scadere boolean)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH cls AS (
    SELECT s.cliente_id AS cli_id, s.importo_scadenza,
      public.is_anticipo(s.numero_documento) AS is_anticipo,
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
    SELECT c.cli_id,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.categoria='scaduto' AND NOT c.is_anticipo), 0) AS ssa,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.categoria='scaduto' AND c.is_anticipo), 0) AS ant,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.categoria='a_scadere'), 0) AS a_scad,
      bool_or(c.categoria='scaduto') AS has_s,
      bool_or(c.categoria='a_scadere') AS has_a
    FROM cls c GROUP BY c.cli_id
  )
  SELECT p.cli_id, public.calcola_scaduto(p.ssa, p.ant), p.a_scad, p.has_s, p.has_a FROM per p;
$function$;

CREATE OR REPLACE FUNCTION public.get_clienti_senza_email_con_scadenze()
RETURNS TABLE(cliente_id uuid, codice_gestionale text, ragione_sociale text, email text, pec text, store_nome text, totale_scaduto numeric, totale_a_scadere numeric, n_scadenze_aperte integer, stato_email text)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH cls AS (
    SELECT s.cliente_id, s.importo_scadenza,
      public.is_anticipo(s.numero_documento) AS is_anticipo,
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
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='scaduto' AND is_anticipo), 0) AS ant,
      COALESCE(SUM(importo_scadenza) FILTER (WHERE cat='a_scadere'),0) AS tot_a_scadere,
      COUNT(*) FILTER (WHERE cat IN ('scaduto','a_scadere'))::int AS n_aperte
    FROM cls GROUP BY cliente_id
    HAVING COUNT(*) FILTER (WHERE cat IN ('scaduto','a_scadere')) > 0
  ),
  base AS (
    SELECT c.id, c.codice_gestionale, c.ragione_sociale, c.email, c.pec, st.nome AS store_nome,
           public.calcola_scaduto(agg.ssa, agg.ant) AS tot_scaduto,
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
  SELECT id, codice_gestionale, ragione_sociale, email, pec, store_nome, tot_scaduto, tot_a_scadere, n_aperte, stato_email
  FROM base WHERE stato_email <> 'ok'
  ORDER BY store_nome ASC NULLS LAST, tot_scaduto DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_recupero_clienti_aggregato(
  _store_id uuid DEFAULT NULL, _operatore_id uuid DEFAULT NULL, _search text DEFAULT NULL,
  _data_da timestamptz DEFAULT NULL, _data_a timestamptz DEFAULT NULL,
  _esiti text[] DEFAULT NULL, _tipi text[] DEFAULT NULL, _stadi integer[] DEFAULT NULL)
RETURNS TABLE(cliente_id uuid, ragione_sociale text, store_id uuid, store_nome text, totale_scaduto numeric, azioni_totali integer, azioni_aperte integer, prossima_tipo text, prossima_data timestamptz, ultima_fatta_tipo text, ultima_fatta_data timestamptz, ha_promessa boolean, data_promessa timestamptz, in_ritardo boolean, stadio_sollecito smallint, stadio_data timestamptz, stadio_giorni integer)
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
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN 0 ELSE s.importo_scadenza END) AS ssa,
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN s.importo_scadenza ELSE 0 END) AS ant
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE
    GROUP BY s.cliente_id
  ),
  scad_clamp AS (SELECT cliente_id, public.calcola_scaduto(ssa, ant) AS totale_scaduto FROM scad),
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

CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_dettaglio(_anno integer, _mese integer)
RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, store_id uuid, store_nome text, dovuto_mese numeric, incassato_mese numeric, insoluto_mese numeric, esposizione_scaduta_totale numeric, n_scadenze_mese integer, n_scadenze_pagate_mese integer, in_gestione_legale boolean, bloccato boolean, email text, pec text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH d1 AS (SELECT make_date(_anno, _mese, 1) AS d),
  d AS (SELECT d, (d + interval '1 month')::date AS d_next FROM d1),
  mese_agg AS (
    SELECT s.cliente_id,
      SUM(s.importo_scadenza)::numeric AS dovuto_mese,
      SUM(CASE WHEN s.data_pagamento_effettiva IS NOT NULL AND s.importo_pagato > 0 THEN s.importo_pagato ELSE 0 END)::numeric AS incassato_mese,
      COUNT(*)::int AS n_scad,
      COUNT(*) FILTER (WHERE s.data_pagamento_effettiva IS NOT NULL AND s.importo_pagato > 0)::int AS n_pag
    FROM public.scadenze s, d
    WHERE s.data_scadenza >= d.d AND s.data_scadenza < d.d_next AND s.importo_scadenza <> 0
    GROUP BY s.cliente_id
  ),
  scad_oggi AS (
    SELECT s.cliente_id,
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN 0 ELSE s.importo_scadenza END)::numeric AS ssa,
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN s.importo_scadenza ELSE 0 END)::numeric AS ant
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE
    GROUP BY s.cliente_id
  ),
  base AS (
    SELECT
      c.id AS cli_id, c.ragione_sociale, c.codice_gestionale, c.store_id, st.nome AS store_nome,
      COALESCE(m.dovuto_mese, 0) AS dovuto_mese,
      COALESCE(m.incassato_mese, 0) AS incassato_mese,
      GREATEST(COALESCE(m.dovuto_mese,0) - COALESCE(m.incassato_mese,0), 0) AS insoluto_mese,
      COALESCE(public.calcola_scaduto(so.ssa, so.ant), 0) AS esposizione_scaduta_totale,
      COALESCE(m.n_scad, 0) AS n_scad_mese,
      COALESCE(m.n_pag, 0) AS n_pag_mese,
      COALESCE(c.in_gestione_legale, false) AS in_gestione_legale,
      COALESCE(c.bloccato, false) AS bloccato,
      c.email, c.pec
    FROM mese_agg m
    JOIN public.clienti c ON c.id = m.cliente_id
    LEFT JOIN public.stores st ON st.id = c.store_id
    LEFT JOIN scad_oggi so ON so.cliente_id = c.id
    WHERE public.user_can_access_cliente(c.id)
  )
  SELECT cli_id, ragione_sociale, codice_gestionale, store_id, store_nome,
    dovuto_mese, incassato_mese, insoluto_mese, esposizione_scaduta_totale,
    n_scad_mese, n_pag_mese, in_gestione_legale, bloccato, email, pec
  FROM base
  ORDER BY esposizione_scaduta_totale DESC NULLS LAST, insoluto_mese DESC NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.get_scadenziario_totali(p_search text DEFAULT NULL, p_store_id uuid DEFAULT NULL, p_fascia text DEFAULT 'tutte', p_stato_blocco text DEFAULT 'tutti', p_stato_legale text DEFAULT 'tutti', p_escludi_bonifici boolean DEFAULT true, p_escludi_legale boolean DEFAULT true, p_avvisato text DEFAULT 'tutti', p_importo_min numeric DEFAULT 0, p_mostra_a_credito boolean DEFAULT false)
RETURNS TABLE(n_clienti_totali integer, tot_scaduto numeric, tot_a_scadere numeric, n_clienti_scaduti integer, n_clienti_bloccati integer, n_clienti_in_legale integer, n_clienti_crediti integer, tot_crediti numeric, n_bonifici_esclusi integer, n_legale_esclusi integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.get_scadenziario_ids(p_search text DEFAULT NULL, p_store_id uuid DEFAULT NULL, p_fascia text DEFAULT 'tutte', p_stato_blocco text DEFAULT 'tutti', p_stato_legale text DEFAULT 'tutti', p_escludi_bonifici boolean DEFAULT true, p_escludi_legale boolean DEFAULT true, p_avvisato text DEFAULT 'tutti', p_importo_min numeric DEFAULT 0, p_mostra_a_credito boolean DEFAULT false)
RETURNS TABLE(cliente_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
  )
  SELECT j.cli_id FROM joined j
  WHERE (CASE WHEN j.tot_s >= 0 THEN j.tot_s >= COALESCE(p_importo_min,0)
              WHEN p_mostra_a_credito THEN abs(j.tot_s) >= COALESCE(p_importo_min,0)
              ELSE false END)
    AND (p_fascia = 'tutte' OR j.fascia = p_fascia)
    AND (p_avvisato = 'tutti' OR (p_avvisato = 'con_azioni' AND j.avvisato_n > 0) OR (p_avvisato = 'senza_azioni' AND j.avvisato_n = 0));
END;
$function$;

DROP FUNCTION IF EXISTS public.get_scadenziario_lista_paginata(text, uuid, text, text, text, boolean, boolean, text, numeric, boolean, integer, integer, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_scadenziario_lista_paginata(
  p_search text DEFAULT NULL, p_store_id uuid DEFAULT NULL, p_fascia text DEFAULT 'tutte',
  p_stato_blocco text DEFAULT 'tutti', p_stato_legale text DEFAULT 'tutti',
  p_escludi_bonifici boolean DEFAULT true, p_escludi_legale boolean DEFAULT true,
  p_avvisato text DEFAULT 'tutti', p_importo_min numeric DEFAULT 0, p_mostra_a_credito boolean DEFAULT false,
  p_anno_corrente integer DEFAULT NULL, p_anno_prec integer DEFAULT NULL,
  p_sort_by text DEFAULT 'tot_scaduto', p_sort_dir text DEFAULT 'desc',
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, store_id uuid, store_nome text, bloccato boolean, ind_blocco integer, in_gestione_legale boolean, n_scadute integer, tot_scaduto numeric, n_a_scadere integer, tot_a_scadere numeric, prossima_scadenza date, max_gg_ritardo integer, scadute_ids uuid[], fascia text, fatturato_cur numeric, fatturato_prec numeric, avvisato_n integer, avvisato_ha_email boolean, avvisato_ultima_tipo text, avvisato_ultima_data timestamptz, ha_promessa boolean, data_promessa date, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
      prom.data_promessa AS data_promessa
    FROM agg2 ag2
    JOIN public.clienti cl ON cl.id = ag2.cli_id
    LEFT JOIN public.stores st ON st.id = cl.store_id
    LEFT JOIN fat ON fat.cli_id = cl.id
    LEFT JOIN avv ON avv.cli_id = cl.id
    LEFT JOIN prom ON prom.cli_id = cl.id
    WHERE public.user_can_access_cliente(cl.id)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_stato_blocco = 'tutti' OR (p_stato_blocco = 'bloccati' AND COALESCE(cl.bloccato,false) = true) OR (p_stato_blocco = 'non_bloccati' AND COALESCE(cl.bloccato,false) = false))
      AND (p_stato_legale = 'tutti' OR (p_stato_legale = 'in_legale' AND COALESCE(cl.in_gestione_legale,false) = true) OR (p_stato_legale = 'non_in_legale' AND COALESCE(cl.in_gestione_legale,false) = false))
      AND (NOT p_escludi_legale OR COALESCE(cl.in_gestione_legale,false) = false)
      AND (p_search IS NULL OR p_search = '' OR cl.ragione_sociale ILIKE '%' || p_search || '%' OR cl.codice_gestionale ILIKE '%' || p_search || '%')
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
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_scadenziario_lista_paginata(text, uuid, text, text, text, boolean, boolean, text, numeric, boolean, integer, integer, text, text, integer, integer) TO authenticated, service_role;
