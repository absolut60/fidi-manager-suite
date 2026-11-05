-- FM58 fetta 2: unità del numero del semaforo e campi 12 mesi a schermo.
DROP FUNCTION public.get_semaforo_affidabilita_cliente(uuid);
DROP FUNCTION public.get_esperienza_pagamento_cliente(uuid);
DROP FUNCTION public.calcola_semaforo_affidabilita_batch(uuid[]);

CREATE FUNCTION public.calcola_semaforo_affidabilita_batch(_ids uuid[])
RETURNS TABLE(cliente_id uuid, stadio text, motivo text, numero numeric, numero_unita text)
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
  calc0 AS (
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
  ),
  calc AS (
    SELECT c0.*,
           (c0.bloccato OR c0.legale OR c0.insoluti > 0 OR c0.eur_totale > 0) AS numero_eur,
           CASE
             WHEN c0.bloccato OR c0.legale OR c0.insoluti > 0 OR c0.eur_totale > 10000 THEN 'rosso'
             WHEN c0.eur_totale > 0 AND c0.n_grave > 0 THEN 'arancione'
             WHEN c0.eur_totale >= 1000 AND c0.eur_totale <= 10000 THEN 'arancione'
             WHEN c0.eur_totale > 0 AND c0.eur_totale < 1000 THEN 'giallo'
             WHEN c0.n_pagate_reali = 0 THEN 'spento'
             WHEN c0.n_pagate_12m >= 3 AND c0.ritardo > 15 THEN 'giallo'
             ELSE 'verde'
           END AS stadio
    FROM calc0 c0
  )
  SELECT
    c.id,
    c.stadio,
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
    CASE WHEN c.numero_eur THEN c.eur_totale ELSE c.ritardo END,
    CASE
      WHEN c.stadio IN ('verde', 'spento') THEN NULL
      WHEN c.numero_eur THEN 'eur'
      ELSE 'gg'
    END
  FROM calc c;
$$;
COMMENT ON FUNCTION public.calcola_semaforo_affidabilita_batch(uuid[]) IS
  'FM58 semaforo di affidabilità: scaduto canonico da scaduto_semaforo_batch e "come paga" da esperienza_pagamento_batch (RiBa e anticipi esclusi, tolleranza, ultimi 12 mesi; giallo per ritardo solo con almeno 3 pagate 12m e ritardo medio 12m > 15). numero_unita: eur (scaduto), gg (ritardo medio 12m), NULL per verde/spento.';
REVOKE ALL ON FUNCTION public.calcola_semaforo_affidabilita_batch(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcola_semaforo_affidabilita_batch(uuid[]) TO service_role, supabase_read_only_user;

CREATE FUNCTION public.get_esperienza_pagamento_cliente(p_cliente_id uuid)
RETURNS TABLE(n_pagate integer, n_in_ritardo integer, perc_in_ritardo numeric, ritardo_medio_gg numeric, max_ritardo_gg integer, n_in_ritardo_12m integer, ritardo_medio_ritardi_gg numeric, tolleranza_gg integer, n_pagate_12m integer, ritardo_medio_12m numeric, ritardo_medio_ritardi_12m numeric)
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
         e.n_in_ritardo_12m, e.ritardo_medio_ritardi_gg, e.tolleranza_gg,
         e.n_pagate_12m, e.ritardo_medio_12m, e.ritardo_medio_ritardi_12m
  FROM public.esperienza_pagamento_batch(ARRAY[p_cliente_id]) e;
END;
$$;
REVOKE ALL ON FUNCTION public.get_esperienza_pagamento_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_esperienza_pagamento_cliente(uuid) TO authenticated, service_role;

CREATE FUNCTION public.get_semaforo_affidabilita_cliente(p_cliente_id uuid)
RETURNS TABLE(stadio text, motivo text, ritardo_medio_ritardi numeric, eur_scaduto_grave numeric, n_scaduto_grave integer, num_insoluti integer, numero numeric, numero_unita text)
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
         v_insoluti,
         b.numero,
         b.numero_unita
  FROM public.calcola_semaforo_affidabilita_batch(ARRAY[p_cliente_id]) b
  LEFT JOIN public.esperienza_pagamento_batch(ARRAY[p_cliente_id]) e ON true
  LEFT JOIN public.scaduto_semaforo_batch(ARRAY[p_cliente_id]) sc ON true;
END;
$$;
REVOKE ALL ON FUNCTION public.get_semaforo_affidabilita_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_semaforo_affidabilita_cliente(uuid) TO authenticated, service_role;
