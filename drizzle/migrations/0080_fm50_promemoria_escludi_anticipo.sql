CREATE OR REPLACE FUNCTION public.get_promemoria_clienti_aggregato(_mesi text[], _store_id uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text, _importo_min numeric DEFAULT NULL::numeric, _escludi_legale boolean DEFAULT true, _escludi_bloccati boolean DEFAULT false)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, store_id uuid, store_nome text, email text, pec text, bloccato boolean, n_scadenze integer, totale_a_scadere numeric, prima_scadenza date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH sc AS (
    SELECT s.cliente_id,
      COUNT(*)::int AS n_scadenze,
      SUM(s.importo_scadenza) AS totale,
      MIN(s.data_scadenza) AS prima
    FROM public.scadenze s
    WHERE s.data_pagamento_effettiva IS NULL
      AND s.data_scadenza IS NOT NULL
      AND s.data_scadenza >= current_date
      AND _mesi IS NOT NULL AND array_length(_mesi, 1) > 0
      AND to_char(s.data_scadenza, 'YYYY-MM') = ANY(_mesi)
      AND NOT public.is_anticipo(s.numero_documento)
    GROUP BY s.cliente_id
  )
  SELECT c.id, c.ragione_sociale, c.store_id, st.nome, c.email, c.pec,
    COALESCE(c.bloccato, false), sc.n_scadenze, sc.totale, sc.prima
  FROM sc
  JOIN public.clienti c ON c.id = sc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  WHERE public.user_can_access_cliente(c.id)
    AND (_escludi_legale IS FALSE OR COALESCE(c.in_gestione_legale, false) = false)
    AND (_store_id IS NULL OR c.store_id = _store_id)
    AND (_search IS NULL OR _search = '' OR c.ragione_sociale ILIKE '%' || _search || '%')
    AND (_importo_min IS NULL OR sc.totale >= _importo_min)
    AND (_escludi_bloccati IS FALSE OR COALESCE(c.bloccato, false) = false)
  ORDER BY sc.prima ASC, c.ragione_sociale ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_promemoria_clienti_aggregato(_mesi text[], _store_id uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text, _importo_min numeric DEFAULT NULL::numeric, _escludi_legale boolean DEFAULT true, _escludi_bloccati boolean DEFAULT false, _escludi_bos boolean DEFAULT true)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, store_id uuid, store_nome text, email text, pec text, bloccato boolean, n_scadenze integer, totale_a_scadere numeric, prima_scadenza date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH sc AS (
    SELECT s.cliente_id,
      COUNT(*)::int AS n_scadenze,
      SUM(s.importo_scadenza) AS totale,
      MIN(s.data_scadenza) AS prima
    FROM public.scadenze s
    WHERE s.data_pagamento_effettiva IS NULL
      AND s.data_scadenza IS NOT NULL
      AND s.data_scadenza >= current_date
      AND _mesi IS NOT NULL AND array_length(_mesi, 1) > 0
      AND to_char(s.data_scadenza, 'YYYY-MM') = ANY(_mesi)
      AND NOT public.is_anticipo(s.numero_documento)
    GROUP BY s.cliente_id
  )
  SELECT c.id, c.ragione_sociale, c.store_id, st.nome, c.email, c.pec,
    COALESCE(c.bloccato, false), sc.n_scadenze, sc.totale, sc.prima
  FROM sc
  JOIN public.clienti c ON c.id = sc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  WHERE public.user_can_access_cliente(c.id)
    AND (_escludi_legale IS FALSE OR COALESCE(c.in_gestione_legale, false) = false)
    AND (_store_id IS NULL OR c.store_id = _store_id)
    AND (_search IS NULL OR _search = '' OR c.ragione_sociale ILIKE '%' || _search || '%')
    AND (_importo_min IS NULL OR sc.totale >= _importo_min)
    AND (_escludi_bloccati IS FALSE OR COALESCE(c.bloccato, false) = false)
    AND (_escludi_bos IS FALSE OR COALESCE(c.condizione_pagamento_cod, '') <> 'BOS')
  ORDER BY sc.prima ASC, c.ragione_sociale ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_promemoria_scadenze_dettaglio(_data date, _escludi_legale boolean DEFAULT true, _escludi_bloccati boolean DEFAULT false, _escludi_bos boolean DEFAULT true, _includi_bonifici boolean DEFAULT true, _includi_riba boolean DEFAULT true)
 RETURNS TABLE(scadenza_id uuid, cliente_id uuid, ragione_sociale text, email text, pec text, store_id uuid, store_nome text, store_insegna text, store_indirizzo text, store_cap text, store_citta text, store_provincia text, store_telefono text, numero_documento text, data_documento date, data_scadenza date, importo_scadenza numeric, codice_pagamento text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS MATERIALIZED (SELECT public.store_id_effettivo(NULL::uuid) AS s)
  SELECT
    s.id AS scadenza_id,
    c.id AS cliente_id,
    c.ragione_sociale,
    c.email,
    c.pec,
    c.store_id,
    st.nome AS store_nome,
    st.insegna AS store_insegna,
    st.indirizzo AS store_indirizzo,
    st.cap AS store_cap,
    st.citta AS store_citta,
    st.provincia AS store_provincia,
    st.telefono AS store_telefono,
    s.numero_documento,
    s.data_documento,
    s.data_scadenza,
    s.importo_scadenza,
    s.codice_pagamento
  FROM public.scadenze s
  JOIN public.clienti c ON c.id = s.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  CROSS JOIN eff
  WHERE s.data_pagamento_effettiva IS NULL
    AND s.data_scadenza = _data
    AND COALESCE(s.importo_scadenza, 0) > 0
    AND NOT public.is_anticipo(s.numero_documento)
    AND (eff.s IS NULL OR c.store_id = eff.s)
    AND (_escludi_legale IS FALSE OR COALESCE(c.in_gestione_legale, false) = false)
    AND (_escludi_bloccati IS FALSE OR COALESCE(c.bloccato, false) = false)
    AND (_escludi_bos IS FALSE OR COALESCE(s.codice_pagamento, '') NOT ILIKE 'BOS%')
    AND (
      (_includi_bonifici AND COALESCE(s.codice_pagamento, '') ILIKE 'BO%')
      OR (_includi_riba AND COALESCE(s.codice_pagamento, '') ILIKE 'RB%')
    )
  ORDER BY c.ragione_sociale ASC, s.data_scadenza ASC, s.numero_documento ASC;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_promemoria_clienti_aggregato(text[],uuid,text,numeric,boolean,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_promemoria_clienti_aggregato(text[],uuid,text,numeric,boolean,boolean,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_promemoria_scadenze_dettaglio(date,boolean,boolean,boolean,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_promemoria_clienti_aggregato(text[],uuid,text,numeric,boolean,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_promemoria_clienti_aggregato(text[],uuid,text,numeric,boolean,boolean,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_promemoria_scadenze_dettaglio(date,boolean,boolean,boolean,boolean,boolean) TO authenticated, service_role;