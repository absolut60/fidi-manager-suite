-- FM58 fetta 1: regola unica "come paga" e scaduto canonico nel semaforo di affidabilità.

CREATE OR REPLACE FUNCTION public.ritardo_pagamento_riga(_codice_pagamento text, _numero_documento text, _data_pagamento date, _data_scadenza date, _importo_pagato numeric)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _data_pagamento IS NULL OR _data_scadenza IS NULL
      OR _importo_pagato IS NULL OR _importo_pagato <= 0
      OR COALESCE(_codice_pagamento, '') ~* '^RB'
      OR public.is_anticipo(_numero_documento)
    THEN NULL
    ELSE (_data_pagamento - _data_scadenza)::int
  END;
$$;
COMMENT ON FUNCTION public.ritardo_pagamento_riga(text, text, date, date, numeric) IS
  'FM58 fonte unica del ritardo di pagamento per riga: NULL se la riga non conta (non pagata davvero, date nulle, RiBa, anticipo), altrimenti giorni pagamento - scadenza (anche negativi).';
REVOKE ALL ON FUNCTION public.ritardo_pagamento_riga(text, text, date, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ritardo_pagamento_riga(text, text, date, date, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.esperienza_pagamento_batch(_ids uuid[])
RETURNS TABLE(
  cliente_id uuid,
  n_pagate_reali integer,
  n_pagate integer, n_in_ritardo integer, perc_in_ritardo numeric, ritardo_medio_gg numeric, max_ritardo_gg integer, ritardo_medio_ritardi_gg numeric,
  n_pagate_12m integer, n_in_ritardo_12m integer, ritardo_medio_12m numeric, ritardo_medio_ritardi_12m numeric,
  tolleranza_gg integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT COALESCE((SELECT CASE WHEN trim(valore) ~ '^[0-9]+$' THEN trim(valore)::int END
                     FROM public.configurazioni WHERE chiave = 'tolleranza_ritardo_pagamento_gg' LIMIT 1), 5) AS toll
  ),
  ids AS (SELECT DISTINCT u AS id FROM unnest(_ids) u WHERE u IS NOT NULL),
  r AS (
    SELECT s.cliente_id AS cid,
           public.ritardo_pagamento_riga(s.codice_pagamento, s.numero_documento, s.data_pagamento_effettiva, s.data_scadenza, s.importo_pagato) AS rit,
           s.data_scadenza,
           (s.data_pagamento_effettiva IS NOT NULL AND s.importo_pagato > 0) AS pagata_reale
    FROM public.scadenze s
    WHERE s.cliente_id = ANY(_ids)
  ),
  a AS (
    SELECT r.cid,
      COUNT(*) FILTER (WHERE r.pagata_reale)::int AS n_pagate_reali,
      COUNT(r.rit)::int AS n_pagate,
      COUNT(*) FILTER (WHERE r.rit > t.toll)::int AS n_in_ritardo,
      ROUND(AVG(r.rit)::numeric, 1) AS ritardo_medio_gg,
      MAX(r.rit)::int AS max_ritardo_gg,
      ROUND((AVG(r.rit) FILTER (WHERE r.rit > t.toll))::numeric, 1) AS ritardo_medio_ritardi_gg,
      COUNT(r.rit) FILTER (WHERE r.data_scadenza >= current_date - 365)::int AS n_pagate_12m,
      COUNT(*) FILTER (WHERE r.rit > t.toll AND r.data_scadenza >= current_date - 365)::int AS n_in_ritardo_12m,
      ROUND((AVG(CASE WHEN r.rit > t.toll THEN r.rit ELSE 0 END)
             FILTER (WHERE r.rit IS NOT NULL AND r.data_scadenza >= current_date - 365))::numeric, 1) AS ritardo_medio_12m,
      ROUND((AVG(r.rit) FILTER (WHERE r.rit > t.toll AND r.data_scadenza >= current_date - 365))::numeric, 1) AS ritardo_medio_ritardi_12m
    FROM r CROSS JOIN t
    GROUP BY r.cid
  )
  SELECT i.id,
    COALESCE(a.n_pagate_reali, 0),
    COALESCE(a.n_pagate, 0),
    COALESCE(a.n_in_ritardo, 0),
    CASE WHEN COALESCE(a.n_pagate, 0) > 0
      THEN ROUND((a.n_in_ritardo::numeric * 100.0 / a.n_pagate)::numeric, 1) ELSE 0::numeric END,
    a.ritardo_medio_gg,
    COALESCE(a.max_ritardo_gg, 0),
    a.ritardo_medio_ritardi_gg,
    COALESCE(a.n_pagate_12m, 0),
    COALESCE(a.n_in_ritardo_12m, 0),
    a.ritardo_medio_12m,
    a.ritardo_medio_ritardi_12m,
    t.toll
  FROM ids i CROSS JOIN t
  LEFT JOIN a ON a.cid = i.id;
$$;
COMMENT ON FUNCTION public.esperienza_pagamento_batch(uuid[]) IS
  'FM58 fonte unica "come paga": storico e ultimi 12 mesi (data_scadenza >= oggi-365) dalle righe valide di ritardo_pagamento_riga; tolleranza da configurazioni tolleranza_ritardo_pagamento_gg (default 5). ritardo_medio_12m = media su tutte le pagate 12m con 0 per le righe entro tolleranza.';
REVOKE ALL ON FUNCTION public.esperienza_pagamento_batch(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esperienza_pagamento_batch(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.scaduto_semaforo_batch(_ids uuid[])
RETURNS TABLE(cliente_id uuid, eur_scaduto numeric, n_grave integer, eur_grave numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH cls AS (
    SELECT s.cliente_id AS cid, s.importo_scadenza, s.giorni_ritardo,
      public.is_anticipo(s.numero_documento) AS ant,
      public.categoria_scadenza_riga(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, CURRENT_DATE, s.tempi_scadenza_key, s.importo_pagato) AS cat
    FROM public.scadenze s
    WHERE s.cliente_id = ANY(_ids)
      AND (s.stato_contabile = 'Aperta' OR s.data_pagamento_effettiva IS NULL)
      AND upper(COALESCE(s.codice_pagamento, '')) <> 'BOS'
  )
  SELECT c.cid,
    public.calcola_scaduto(
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE NOT c.ant), 0),
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.ant), 0)),
    COUNT(*) FILTER (WHERE NOT c.ant AND c.giorni_ritardo > 60)::int,
    COALESCE(SUM(c.importo_scadenza) FILTER (WHERE NOT c.ant AND c.giorni_ritardo > 60), 0)
  FROM cls c
  WHERE c.cat = 'scaduto'
  GROUP BY c.cid;
$$;
COMMENT ON FUNCTION public.scaduto_semaforo_batch(uuid[]) IS
  'FM58 fonte unica dello scaduto del semaforo: righe scadute come scadenziario_clienti_base (BOS esclusi), calcola_scaduto(non anticipi, anticipi); grave = scadute non anticipo con giorni_ritardo > 60.';
REVOKE ALL ON FUNCTION public.scaduto_semaforo_batch(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scaduto_semaforo_batch(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.get_esperienza_pagamento_cliente(p_cliente_id uuid)
RETURNS TABLE(n_pagate integer, n_in_ritardo integer, perc_in_ritardo numeric, ritardo_medio_gg numeric, max_ritardo_gg integer, n_in_ritardo_12m integer, ritardo_medio_ritardi_gg numeric, tolleranza_gg integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_can_access_cliente(p_cliente_id) THEN
    RAISE EXCEPTION 'Accesso negato al cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.n_pagate, e.n_in_ritardo, e.perc_in_ritardo, e.ritardo_medio_gg, e.max_ritardo_gg,
         e.n_in_ritardo_12m, e.ritardo_medio_ritardi_gg, e.tolleranza_gg
  FROM public.esperienza_pagamento_batch(ARRAY[p_cliente_id]) e;
END;
$$;
REVOKE ALL ON FUNCTION public.get_esperienza_pagamento_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_esperienza_pagamento_cliente(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.calcola_semaforo_affidabilita_batch(_ids uuid[])
RETURNS TABLE(cliente_id uuid, stadio text, motivo text, numero numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT c.id,
           COALESCE(c.bloccato, false) AS bloccato,
           COALESCE(c.in_gestione_legale, false) AS legale,
           COALESCE(c.num_insoluti, 0) AS insoluti
    FROM public.clienti c
    WHERE c.id = ANY(_ids)
  ),
  calc AS (
    SELECT b.id, b.bloccato, b.legale, b.insoluti,
           COALESCE(sc.n_grave, 0) AS n_grave,
           COALESCE(sc.eur_grave, 0) AS eur_grave,
           COALESCE(sc.eur_scaduto, 0) AS eur_totale,
           COALESCE(e.n_pagate_reali, 0) AS n_pagate_reali,
           COALESCE(e.n_pagate_12m, 0) AS n_pagate_12m,
           COALESCE(e.n_in_ritardo_12m, 0) AS n_in_ritardo_12m,
           COALESCE(e.ritardo_medio_12m, 0) AS ritardo,
           translate(to_char(COALESCE(sc.eur_grave, 0), 'FM999G999G990D00'), ',.', '.,') AS eur_txt,
           translate(to_char(COALESCE(sc.eur_scaduto, 0), 'FM999G999G990D00'), ',.', '.,') AS eur_totale_txt
    FROM base b
    LEFT JOIN public.scaduto_semaforo_batch(_ids) sc ON sc.cliente_id = b.id
    LEFT JOIN public.esperienza_pagamento_batch(_ids) e ON e.cliente_id = b.id
  )
  SELECT
    c.id,
    CASE
      WHEN c.bloccato OR c.legale OR c.insoluti > 0 OR c.eur_totale > 10000 THEN 'rosso'
      WHEN c.eur_totale > 0 AND c.n_grave > 0 THEN 'arancione'
      WHEN c.eur_totale >= 1000 AND c.eur_totale <= 10000 THEN 'arancione'
      WHEN c.eur_totale > 0 AND c.eur_totale < 1000 THEN 'giallo'
      WHEN c.n_pagate_reali = 0 THEN 'spento'
      WHEN c.n_pagate_12m >= 3 AND c.ritardo > 15 THEN 'giallo'
      ELSE 'verde'
    END,
    CASE
      WHEN c.bloccato THEN 'Cliente bloccato'
      WHEN c.legale THEN 'In gestione legale'
      WHEN c.insoluti > 0 THEN c.insoluti || ' insoluto/i in corso'
      WHEN c.eur_totale > 10000 THEN 'Scaduto totale ' || c.eur_totale_txt || ' €'
      WHEN c.eur_totale > 0 AND c.n_grave > 0 THEN 'Scaduto ' || c.eur_txt || ' € fermo oltre 60 giorni'
      WHEN c.eur_totale >= 1000 AND c.eur_totale <= 10000 THEN 'Scaduto ' || c.eur_totale_txt || ' €'
      WHEN c.eur_totale > 0 AND c.eur_totale < 1000 THEN 'Scaduto ' || c.eur_totale_txt || ' €'
      WHEN c.n_pagate_reali = 0 THEN 'Nessuna esperienza di pagamento'
      WHEN c.n_pagate_12m >= 3 AND c.ritardo > 15 THEN 'Ritardo medio ' || ROUND(c.ritardo)::text || ' giorni negli ultimi 12 mesi'
      WHEN c.n_in_ritardo_12m = 0 AND c.n_pagate_12m > 0 THEN 'Sempre puntuale negli ultimi 12 mesi'
      ELSE 'Pagamenti regolari'
    END,
    CASE
      WHEN (c.bloccato OR c.legale OR c.insoluti > 0 OR c.eur_totale > 0) THEN c.eur_totale
      ELSE c.ritardo
    END
  FROM calc c;
$$;
COMMENT ON FUNCTION public.calcola_semaforo_affidabilita_batch(uuid[]) IS
  'FM58 semaforo di affidabilità: scaduto canonico da scaduto_semaforo_batch e "come paga" da esperienza_pagamento_batch (RiBa e anticipi esclusi, tolleranza, ultimi 12 mesi; giallo per ritardo solo con almeno 3 pagate 12m e ritardo medio 12m > 15).';
REVOKE ALL ON FUNCTION public.calcola_semaforo_affidabilita_batch(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcola_semaforo_affidabilita_batch(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.get_semaforo_affidabilita_cliente(p_cliente_id uuid)
RETURNS TABLE(stadio text, motivo text, ritardo_medio_ritardi numeric, eur_scaduto_grave numeric, n_scaduto_grave integer, num_insoluti integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insoluti int;
BEGIN
  IF NOT public.user_can_access_cliente(p_cliente_id) THEN
    RAISE EXCEPTION 'Accesso negato al cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(c.num_insoluti, 0) INTO v_insoluti
  FROM public.clienti c WHERE c.id = p_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente % non trovato', p_cliente_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT b.stadio, b.motivo,
         COALESCE(e.ritardo_medio_ritardi_12m, 0),
         COALESCE(sc.eur_grave, 0),
         COALESCE(sc.n_grave, 0),
         v_insoluti
  FROM public.calcola_semaforo_affidabilita_batch(ARRAY[p_cliente_id]) b
  LEFT JOIN public.esperienza_pagamento_batch(ARRAY[p_cliente_id]) e ON true
  LEFT JOIN public.scaduto_semaforo_batch(ARRAY[p_cliente_id]) sc ON true;
END;
$$;
REVOKE ALL ON FUNCTION public.get_semaforo_affidabilita_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_semaforo_affidabilita_cliente(uuid) TO authenticated, service_role;
