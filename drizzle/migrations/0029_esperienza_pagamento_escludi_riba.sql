CREATE OR REPLACE FUNCTION public.get_esperienza_pagamento_cliente(p_cliente_id uuid)
 RETURNS TABLE(n_pagate integer, n_in_ritardo integer, perc_in_ritardo numeric, ritardo_medio_gg numeric, max_ritardo_gg integer, n_in_ritardo_12m integer, ritardo_medio_ritardi_gg numeric, tolleranza_gg integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _raw text;
  _toll int := 5;
BEGIN
  IF NOT public.user_can_access_cliente(p_cliente_id) THEN
    RAISE EXCEPTION 'Accesso negato al cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;

  SELECT trim(valore) INTO _raw FROM public.configurazioni WHERE chiave = 'tolleranza_ritardo_pagamento_gg' LIMIT 1;
  IF _raw ~ '^[0-9]+$' THEN _toll := _raw::int; END IF;

  RETURN QUERY
  WITH d AS (
    SELECT (s.data_pagamento_effettiva - s.data_scadenza)::int AS ritardo, s.data_scadenza
    FROM public.scadenze s
    WHERE s.cliente_id = p_cliente_id
      AND s.data_pagamento_effettiva IS NOT NULL
      AND s.data_scadenza IS NOT NULL
      AND s.importo_pagato IS NOT NULL
      AND s.importo_pagato > 0
      AND COALESCE(s.codice_pagamento, '') !~* '^RB'
  )
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE d.ritardo > _toll)::int,
    CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE d.ritardo > _toll)::numeric * 100.0 / COUNT(*))::numeric, 1)
      ELSE 0::numeric END,
    CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(d.ritardo)::numeric, 1) ELSE NULL END,
    COALESCE(MAX(d.ritardo), 0)::int,
    COUNT(*) FILTER (WHERE d.ritardo > _toll AND d.data_scadenza >= current_date - 365)::int,
    ROUND((AVG(d.ritardo) FILTER (WHERE d.ritardo > _toll))::numeric, 1),
    _toll
  FROM d;
END;
$function$;

COMMENT ON FUNCTION public.get_esperienza_pagamento_cliente(uuid) IS
'Fonte unica "pagate in ritardo": scadenze NON RiBa pagate (data_pagamento_effettiva, importo_pagato>0) con ritardo oltre configurazioni.tolleranza_ritardo_pagamento_gg (default 5). Le RiBa sono escluse: il loro mancato pagamento è un insoluto.';

REVOKE EXECUTE ON FUNCTION public.get_esperienza_pagamento_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_esperienza_pagamento_cliente(uuid) TO authenticated, service_role;