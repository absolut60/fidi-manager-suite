CREATE OR REPLACE FUNCTION public.ritardo_pagamento_riga(_codice_pagamento text, _numero_documento text, _data_pagamento date, _data_scadenza date, _importo_pagato numeric)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN _data_pagamento IS NULL OR _data_scadenza IS NULL
      OR _importo_pagato IS NULL OR _importo_pagato <= 0
      OR public.is_anticipo(_numero_documento)
    THEN NULL
    ELSE GREATEST((_data_pagamento - _data_scadenza)::int, 0)
  END;
$function$;
REVOKE EXECUTE ON FUNCTION public.ritardo_pagamento_riga(text,text,date,date,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ritardo_pagamento_riga(text,text,date,date,numeric) TO postgres, authenticated, service_role;
COMMENT ON FUNCTION public.ritardo_pagamento_riga(text,text,date,date,numeric) IS 'FM59: tutti i pagamenti reali, RiBa incluse; documenti ANTICIPO esclusi; pagamento prima della scadenza = 0 giorni. Il codice pagamento resta nella firma per compatibilità.';

DROP FUNCTION public.get_esperienza_pagamento_cliente(uuid);
DROP FUNCTION public.esperienza_pagamento_batch(uuid[]);
CREATE OR REPLACE FUNCTION public.esperienza_pagamento_batch(_ids uuid[])
 RETURNS TABLE(cliente_id uuid, n_pagate_reali integer, n_pagate integer, n_in_ritardo integer, perc_in_ritardo numeric, ritardo_medio_gg numeric, max_ritardo_gg integer, ritardo_medio_ritardi_gg numeric, n_pagate_12m integer, n_in_ritardo_12m integer, ritardo_medio_12m numeric, ritardo_medio_ritardi_12m numeric, tolleranza_gg integer, prima_pagata date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      ROUND((AVG(r.rit) FILTER (WHERE r.rit > t.toll AND r.data_scadenza >= current_date - 365))::numeric, 1) AS ritardo_medio_ritardi_12m,
      MIN(r.data_scadenza) FILTER (WHERE r.rit IS NOT NULL) AS prima_pagata
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
    t.toll,
    a.prima_pagata
  FROM ids i CROSS JOIN t
  LEFT JOIN a ON a.cid = i.id;
$function$;
REVOKE EXECUTE ON FUNCTION public.esperienza_pagamento_batch(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esperienza_pagamento_batch(uuid[]) TO postgres, service_role;
COMMENT ON FUNCTION public.esperienza_pagamento_batch(uuid[]) IS 'FM59 fonte unica come paga: RiBa incluse, giorni mai negativi, documenti ANTICIPO esclusi. Storico da prima_pagata (minima data scadenza valida); ultimi 12 mesi su data_scadenza >= oggi-365. Tolleranza configurata, default 5; media 12m con 0 entro tolleranza. Colonne precedenti e ordine invariati.';

CREATE OR REPLACE FUNCTION public.get_esperienza_pagamento_cliente(p_cliente_id uuid)
 RETURNS TABLE(n_pagate integer, n_in_ritardo integer, perc_in_ritardo numeric, ritardo_medio_gg numeric, max_ritardo_gg integer, n_in_ritardo_12m integer, ritardo_medio_ritardi_gg numeric, tolleranza_gg integer, n_pagate_12m integer, ritardo_medio_12m numeric, ritardo_medio_ritardi_12m numeric, prima_pagata date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_can_access_cliente(p_cliente_id) THEN
    RAISE EXCEPTION 'Accesso negato al cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.n_pagate, e.n_in_ritardo, e.perc_in_ritardo, e.ritardo_medio_gg, e.max_ritardo_gg,
         e.n_in_ritardo_12m, e.ritardo_medio_ritardi_gg, e.tolleranza_gg,
         e.n_pagate_12m, e.ritardo_medio_12m, e.ritardo_medio_ritardi_12m,
         e.prima_pagata
  FROM public.esperienza_pagamento_batch(ARRAY[p_cliente_id]) e;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_esperienza_pagamento_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_esperienza_pagamento_cliente(uuid) TO postgres, authenticated, service_role;
COMMENT ON FUNCTION public.get_esperienza_pagamento_cliente(uuid) IS 'FM59: lettura esperienza_pagamento_batch con controllo user_can_access_cliente invariato; prima_pagata aggiunta in fondo, RiBa incluse e giorni mai negativi.';