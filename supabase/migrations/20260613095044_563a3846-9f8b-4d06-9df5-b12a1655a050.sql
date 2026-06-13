
CREATE OR REPLACE FUNCTION public.get_promemoria_clienti_aggregato(
  _mesi text[],
  _store_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _importo_min numeric DEFAULT NULL,
  _escludi_legale boolean DEFAULT true,
  _escludi_bloccati boolean DEFAULT false
)
RETURNS TABLE (
  cliente_id uuid,
  ragione_sociale text,
  store_id uuid,
  store_nome text,
  email text,
  pec text,
  bloccato boolean,
  n_scadenze integer,
  totale_a_scadere numeric,
  prima_scadenza date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH sc AS (
    SELECT
      s.cliente_id,
      COUNT(*)::int AS n_scadenze,
      SUM(s.importo_scadenza) AS totale,
      MIN(s.data_scadenza) AS prima
    FROM public.scadenze s
    WHERE s.tempi_scadenza ILIKE '%scader%'
      AND s.data_scadenza >= current_date
      AND (_escludi_legale IS FALSE OR COALESCE(s.in_legale, false) = false)
      AND _mesi IS NOT NULL
      AND array_length(_mesi, 1) > 0
      AND to_char(s.data_scadenza, 'YYYY-MM') = ANY(_mesi)
    GROUP BY s.cliente_id
  )
  SELECT
    c.id,
    c.ragione_sociale,
    c.store_id,
    st.nome,
    c.email,
    c.pec,
    COALESCE(c.bloccato, false),
    sc.n_scadenze,
    sc.totale,
    sc.prima
  FROM sc
  JOIN public.clienti c ON c.id = sc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  WHERE public.user_can_access_cliente(c.id)
    AND (_store_id IS NULL OR c.store_id = _store_id)
    AND (_search IS NULL OR _search = '' OR c.ragione_sociale ILIKE '%' || _search || '%')
    AND (_importo_min IS NULL OR sc.totale >= _importo_min)
    AND (_escludi_bloccati IS FALSE OR COALESCE(c.bloccato, false) = false)
  ORDER BY sc.prima ASC, c.ragione_sociale ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_promemoria_clienti_aggregato(text[], uuid, text, numeric, boolean, boolean) TO authenticated;
