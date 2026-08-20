CREATE OR REPLACE FUNCTION public.get_dashboard_commerciale(
  _agente_codice text DEFAULT NULL,
  _data_da date DEFAULT NULL,
  _data_a date DEFAULT NULL
)
RETURNS TABLE(
  aperte_n bigint, aperte_val numeric,
  in_lavorazione_n bigint, in_lavorazione_val numeric,
  preventivo_n bigint, preventivo_val numeric,
  vinte_n bigint, vinte_val numeric,
  perse_n bigint, perse_val numeric,
  pipeline_aperta_val numeric,
  tasso_conversione numeric,
  valore_medio_vinta numeric,
  attivita_da_fare_n bigint,
  attivita_arretrate_n bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dir boolean;
  v_agente boolean;
  v_cod text;
  v_store uuid;
  v_filtro_agente text;
  v_filtro_store uuid;
BEGIN
  v_dir := has_role(auth.uid(), 'amministratore'::app_role)
        OR has_role(auth.uid(), 'amministrazione'::app_role)
        OR has_role(auth.uid(), 'direzione'::app_role);
  v_agente := has_role(auth.uid(), 'agente'::app_role);
  SELECT p.codice_agente, p.store_id INTO v_cod, v_store FROM public.profili p WHERE p.id = auth.uid();

  IF v_dir THEN
    v_filtro_agente := NULLIF(_agente_codice, '');
    v_filtro_store := NULL;
  ELSIF v_agente THEN
    IF v_cod IS NULL THEN
      RETURN QUERY SELECT 0::bigint,0::numeric,0::bigint,0::numeric,0::bigint,0::numeric,0::bigint,0::numeric,0::bigint,0::numeric,0::numeric,
                          NULL::numeric, NULL::numeric, 0::bigint, 0::bigint;
      RETURN;
    END IF;
    v_filtro_agente := v_cod;
    v_filtro_store := NULL;
  ELSE
    IF v_store IS NULL THEN
      RETURN QUERY SELECT 0::bigint,0::numeric,0::bigint,0::numeric,0::bigint,0::numeric,0::bigint,0::numeric,0::bigint,0::numeric,0::numeric,
                          NULL::numeric, NULL::numeric, 0::bigint, 0::bigint;
      RETURN;
    END IF;
    v_filtro_agente := NULLIF(_agente_codice, '');
    v_filtro_store := v_store;
  END IF;

  RETURN QUERY
  WITH o AS (
    SELECT op.stato, COALESCE(op.valore_stimato, 0) AS val, op.data_chiusura
    FROM public.opportunita op
    WHERE (v_filtro_agente IS NULL OR op.agente_codice = v_filtro_agente)
      AND (v_filtro_store IS NULL OR op.store_id = v_filtro_store)
  ),
  a AS (
    SELECT ac.completata, ac.data_pianificata
    FROM public.attivita_commerciale ac
    WHERE (v_filtro_agente IS NULL OR ac.agente_codice = v_filtro_agente)
      AND (v_filtro_store IS NULL OR ac.store_id = v_filtro_store)
      AND ac.data_pianificata IS NOT NULL
  ),
  agg AS (
    SELECT
      COUNT(*) FILTER (WHERE stato = 'aperta') AS a_n,
      COALESCE(SUM(val) FILTER (WHERE stato = 'aperta'), 0) AS a_v,
      COUNT(*) FILTER (WHERE stato = 'in_lavorazione') AS l_n,
      COALESCE(SUM(val) FILTER (WHERE stato = 'in_lavorazione'), 0) AS l_v,
      COUNT(*) FILTER (WHERE stato = 'preventivo') AS p_n,
      COALESCE(SUM(val) FILTER (WHERE stato = 'preventivo'), 0) AS p_v,
      COUNT(*) FILTER (WHERE stato = 'vinta'
        AND (_data_da IS NULL OR (data_chiusura IS NOT NULL AND data_chiusura >= _data_da))
        AND (_data_a IS NULL OR (data_chiusura IS NOT NULL AND data_chiusura <= _data_a))) AS v_n,
      COALESCE(SUM(val) FILTER (WHERE stato = 'vinta'
        AND (_data_da IS NULL OR (data_chiusura IS NOT NULL AND data_chiusura >= _data_da))
        AND (_data_a IS NULL OR (data_chiusura IS NOT NULL AND data_chiusura <= _data_a))), 0) AS v_v,
      COUNT(*) FILTER (WHERE stato = 'persa'
        AND (_data_da IS NULL OR (data_chiusura IS NOT NULL AND data_chiusura >= _data_da))
        AND (_data_a IS NULL OR (data_chiusura IS NOT NULL AND data_chiusura <= _data_a))) AS x_n,
      COALESCE(SUM(val) FILTER (WHERE stato = 'persa'
        AND (_data_da IS NULL OR (data_chiusura IS NOT NULL AND data_chiusura >= _data_da))
        AND (_data_a IS NULL OR (data_chiusura IS NOT NULL AND data_chiusura <= _data_a))), 0) AS x_v,
      COALESCE(SUM(val) FILTER (WHERE stato IN ('aperta','in_lavorazione','preventivo')), 0) AS pip
    FROM o
  ),
  att AS (
    SELECT
      COUNT(*) FILTER (WHERE NOT completata AND data_pianificata >= now()) AS df,
      COUNT(*) FILTER (WHERE NOT completata AND data_pianificata < now()) AS ar
    FROM a
  )
  SELECT agg.a_n, agg.a_v, agg.l_n, agg.l_v, agg.p_n, agg.p_v, agg.v_n, agg.v_v, agg.x_n, agg.x_v, agg.pip,
         CASE WHEN (agg.v_n + agg.x_n) > 0 THEN ROUND(agg.v_n::numeric / (agg.v_n + agg.x_n), 4) ELSE NULL END,
         CASE WHEN agg.v_n > 0 THEN ROUND(agg.v_v / agg.v_n, 2) ELSE NULL END,
         att.df, att.ar
  FROM agg, att;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_commerciale(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_commerciale(text, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_dashboard_commerciale_per_agente(
  _data_da date DEFAULT NULL,
  _data_a date DEFAULT NULL
)
RETURNS TABLE(
  agente_codice text, agente_nome text,
  aperte_n bigint, pipeline_val numeric,
  vinte_n bigint, vinte_val numeric,
  perse_n bigint, tasso_conversione numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dir boolean;
  v_agente boolean;
  v_cod text;
  v_store uuid;
  v_filtro_agente text;
  v_filtro_store uuid;
BEGIN
  v_dir := has_role(auth.uid(), 'amministratore'::app_role)
        OR has_role(auth.uid(), 'amministrazione'::app_role)
        OR has_role(auth.uid(), 'direzione'::app_role);
  v_agente := has_role(auth.uid(), 'agente'::app_role);
  SELECT p.codice_agente, p.store_id INTO v_cod, v_store FROM public.profili p WHERE p.id = auth.uid();

  IF v_dir THEN
    v_filtro_agente := NULL; v_filtro_store := NULL;
  ELSIF v_agente THEN
    IF v_cod IS NULL THEN RETURN; END IF;
    v_filtro_agente := v_cod; v_filtro_store := NULL;
  ELSE
    IF v_store IS NULL THEN RETURN; END IF;
    v_filtro_agente := NULL; v_filtro_store := v_store;
  END IF;

  RETURN QUERY
  WITH o AS (
    SELECT op.agente_codice AS cod, op.stato, COALESCE(op.valore_stimato, 0) AS val, op.data_chiusura
    FROM public.opportunita op
    WHERE (v_filtro_agente IS NULL OR op.agente_codice = v_filtro_agente)
      AND (v_filtro_store IS NULL OR op.store_id = v_filtro_store)
  ),
  agg AS (
    SELECT
      o.cod,
      COUNT(*) FILTER (WHERE o.stato = 'aperta') AS a_n,
      COALESCE(SUM(o.val) FILTER (WHERE o.stato IN ('aperta','in_lavorazione','preventivo')), 0) AS pip,
      COUNT(*) FILTER (WHERE o.stato = 'vinta'
        AND (_data_da IS NULL OR (o.data_chiusura IS NOT NULL AND o.data_chiusura >= _data_da))
        AND (_data_a IS NULL OR (o.data_chiusura IS NOT NULL AND o.data_chiusura <= _data_a))) AS v_n,
      COALESCE(SUM(o.val) FILTER (WHERE o.stato = 'vinta'
        AND (_data_da IS NULL OR (o.data_chiusura IS NOT NULL AND o.data_chiusura >= _data_da))
        AND (_data_a IS NULL OR (o.data_chiusura IS NOT NULL AND o.data_chiusura <= _data_a))), 0) AS v_v,
      COUNT(*) FILTER (WHERE o.stato = 'persa'
        AND (_data_da IS NULL OR (o.data_chiusura IS NOT NULL AND o.data_chiusura >= _data_da))
        AND (_data_a IS NULL OR (o.data_chiusura IS NOT NULL AND o.data_chiusura <= _data_a))) AS x_n
    FROM o
    GROUP BY o.cod
  )
  SELECT agg.cod,
         COALESCE(ag.descrizione, agg.cod, 'Non assegnato'),
         agg.a_n, agg.pip, agg.v_n, agg.v_v, agg.x_n,
         CASE WHEN (agg.v_n + agg.x_n) > 0 THEN ROUND(agg.v_n::numeric / (agg.v_n + agg.x_n), 4) ELSE NULL END
  FROM agg
  LEFT JOIN public.agenti ag ON ag.codice = agg.cod
  ORDER BY agg.pip DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_commerciale_per_agente(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_commerciale_per_agente(date, date) TO authenticated, service_role;