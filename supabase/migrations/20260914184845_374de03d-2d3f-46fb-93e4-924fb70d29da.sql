CREATE OR REPLACE FUNCTION public.calcola_semaforo_affidabilita_batch(_ids uuid[])
 RETURNS TABLE(cliente_id uuid, stadio text, motivo text, numero numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT c.id,
           COALESCE(c.bloccato, false) AS bloccato,
           COALESCE(c.in_gestione_legale, false) AS legale,
           COALESCE(c.num_insoluti, 0) AS insoluti
    FROM public.clienti c
    WHERE c.id = ANY(_ids)
  ),
  grave AS (
    SELECT s.cliente_id AS cid,
           COUNT(*)::int AS n_grave,
           COALESCE(SUM(s.importo_scadenza), 0) AS eur_grave
    FROM public.scadenze s
    WHERE s.cliente_id = ANY(_ids)
      AND s.stato_contabile = 'Aperta'
      AND s.importo_scadenza > 0
      AND NOT public.is_anticipo(s.numero_documento)
      AND s.tempi_scadenza ILIKE 'Scaduto%'
      AND (s.tempi_scadenza ILIKE '%60-90%' OR s.tempi_scadenza ILIKE '%90-120%' OR s.tempi_scadenza ILIKE '%oltre 120%')
    GROUP BY s.cliente_id
  ),
  totale AS (
    SELECT s.cliente_id AS cid,
           COALESCE(SUM(s.importo_scadenza), 0) AS eur_totale
    FROM public.scadenze s
    WHERE s.cliente_id = ANY(_ids)
      AND s.stato_contabile = 'Aperta'
      AND s.importo_scadenza > 0
      AND NOT public.is_anticipo(s.numero_documento)
      AND s.tempi_scadenza ILIKE 'Scaduto%'
    GROUP BY s.cliente_id
  ),
  rit AS (
    SELECT s.cliente_id AS cid,
           COALESCE(ROUND(AVG((s.data_pagamento_effettiva - s.data_scadenza))
             FILTER (WHERE (s.data_pagamento_effettiva - s.data_scadenza) > 0)::numeric, 1), 0) AS ritardo
    FROM public.scadenze s
    WHERE s.cliente_id = ANY(_ids)
      AND s.data_pagamento_effettiva IS NOT NULL
      AND s.data_scadenza IS NOT NULL
      AND s.importo_pagato IS NOT NULL
      AND s.importo_pagato > 0
    GROUP BY s.cliente_id
  ),
  calc AS (
    SELECT b.id,
           b.bloccato, b.legale, b.insoluti,
           COALESCE(g.n_grave, 0) AS n_grave,
           COALESCE(g.eur_grave, 0) AS eur_grave,
           COALESCE(t.eur_totale, 0) AS eur_totale,
           COALESCE(r.ritardo, 0) AS ritardo,
           translate(to_char(COALESCE(g.eur_grave, 0), 'FM999G999G990D00'), ',.', '.,') AS eur_txt,
           translate(to_char(COALESCE(t.eur_totale, 0), 'FM999G999G990D00'), ',.', '.,') AS eur_totale_txt
    FROM base b
    LEFT JOIN grave g ON g.cid = b.id
    LEFT JOIN totale t ON t.cid = b.id
    LEFT JOIN rit r ON r.cid = b.id
  )
  SELECT
    c.id,
    CASE
      WHEN c.bloccato OR c.legale OR c.insoluti > 0 OR c.eur_totale > 10000 THEN 'rosso'
      WHEN c.n_grave > 0 THEN 'arancione'
      WHEN c.eur_totale >= 1000 AND c.eur_totale <= 10000 THEN 'arancione'
      WHEN c.eur_totale > 0 AND c.eur_totale < 1000 THEN 'giallo'
      WHEN c.ritardo > 15 THEN 'giallo'
      ELSE 'verde'
    END AS stadio,
    CASE
      WHEN c.bloccato THEN 'Cliente bloccato'
      WHEN c.legale THEN 'In gestione legale'
      WHEN c.insoluti > 0 THEN c.insoluti || ' insoluto/i in corso'
      WHEN c.eur_totale > 10000 THEN 'Scaduto totale ' || c.eur_totale_txt || ' €'
      WHEN c.n_grave > 0 THEN 'Scaduto ' || c.eur_txt || ' € fermo oltre 60 giorni'
      WHEN c.eur_totale >= 1000 AND c.eur_totale <= 10000 THEN 'Scaduto ' || c.eur_totale_txt || ' €'
      WHEN c.eur_totale > 0 AND c.eur_totale < 1000 THEN 'Scaduto ' || c.eur_totale_txt || ' €'
      WHEN c.ritardo > 15 THEN 'Ritardo medio ' || ROUND(c.ritardo)::text || ' giorni sui pagamenti'
      WHEN c.ritardo = 0 THEN 'Sempre puntuale'
      ELSE 'Pagamenti regolari'
    END AS motivo,
    CASE
      WHEN (c.bloccato OR c.legale OR c.insoluti > 0 OR c.eur_totale > 0) THEN c.eur_totale
      ELSE c.ritardo
    END AS numero
  FROM calc c;
$function$;

CREATE OR REPLACE FUNCTION public.get_semaforo_affidabilita_cliente(p_cliente_id uuid)
 RETURNS TABLE(stadio text, motivo text, ritardo_medio_ritardi numeric, eur_scaduto_grave numeric, n_scaduto_grave integer, num_insoluti integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_insoluti int;
  v_n_grave int := 0;
  v_eur_grave numeric := 0;
  v_ritardo numeric := 0;
  v_stadio text;
  v_motivo text;
BEGIN
  IF NOT public.user_can_access_cliente(p_cliente_id) THEN
    RAISE EXCEPTION 'Accesso negato al cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clienti c WHERE c.id = p_cliente_id) THEN
    RAISE EXCEPTION 'Cliente % non trovato', p_cliente_id USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(c.num_insoluti, 0)
    INTO v_insoluti
  FROM public.clienti c WHERE c.id = p_cliente_id;

  -- Scaduto GRAVE: solo fasce oltre 60 giorni (colonne extra del RETURN)
  SELECT COUNT(*)::int, COALESCE(SUM(s.importo_scadenza), 0)
    INTO v_n_grave, v_eur_grave
  FROM public.scadenze s
  WHERE s.cliente_id = p_cliente_id
    AND s.stato_contabile = 'Aperta'
    AND s.importo_scadenza > 0
    AND NOT public.is_anticipo(s.numero_documento)
    AND s.tempi_scadenza ILIKE 'Scaduto%'
    AND (s.tempi_scadenza ILIKE '%60-90%' OR s.tempi_scadenza ILIKE '%90-120%' OR s.tempi_scadenza ILIKE '%oltre 120%');

  SELECT COALESCE(ROUND(AVG((s.data_pagamento_effettiva - s.data_scadenza))
           FILTER (WHERE (s.data_pagamento_effettiva - s.data_scadenza) > 0)::numeric, 1), 0)
    INTO v_ritardo
  FROM public.scadenze s
  WHERE s.cliente_id = p_cliente_id
    AND s.data_pagamento_effettiva IS NOT NULL
    AND s.data_scadenza IS NOT NULL
    AND s.importo_pagato IS NOT NULL
    AND s.importo_pagato > 0;

  -- Stadio e motivo dalla fonte unica (batch)
  SELECT b.stadio, b.motivo INTO v_stadio, v_motivo
  FROM public.calcola_semaforo_affidabilita_batch(ARRAY[p_cliente_id]) b;

  RETURN QUERY SELECT v_stadio, v_motivo, v_ritardo, v_eur_grave, v_n_grave, v_insoluti;
END;
$function$;