-- 1) Helper: ricava lo store dal chiamante, non dal parametro
CREATE OR REPLACE FUNCTION public.store_id_effettivo(_store_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_store uuid;
BEGIN
  v_uid := auth.uid();

  -- service_role / job interni: nessun utente => comportamento invariato
  IF v_uid IS NULL THEN
    RETURN _store_id;
  END IF;

  -- ruoli con visibilita' globale: parametro rispettato (anche NULL = tutti)
  IF public.has_role(v_uid, 'amministratore'::app_role)
     OR public.has_role(v_uid, 'direzione'::app_role)
     OR public.has_role(v_uid, 'amministrazione'::app_role)
     OR public.has_role(v_uid, 'approvatore_liv1'::app_role)
     OR public.has_role(v_uid, 'approvatore_liv2'::app_role)
     OR public.has_role(v_uid, 'approvatore_liv3'::app_role)
  THEN
    RETURN _store_id;
  END IF;

  SELECT p.store_id INTO v_store FROM public.profili p WHERE p.id = v_uid;
  IF v_store IS NOT NULL THEN
    RETURN v_store;
  END IF;

  RAISE EXCEPTION 'Non autorizzato';
END;
$function$;

REVOKE ALL ON FUNCTION public.store_id_effettivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_id_effettivo(uuid) TO authenticated, service_role;

-- 2) RPC con _store_id
CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mensile(_anno integer, _store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(mese integer, dovuto numeric, incassato numeric, scaduto numeric, a_scadere numeric, scaduto_riba numeric, a_scadere_riba numeric, eccedenza numeric, da_incassare numeric, pct numeric, n_scadenze bigint, n_pagate bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(_store_id) AS s),
  m AS (SELECT generate_series(1,12) AS mese),
  righe AS (
    SELECT
      EXTRACT(MONTH FROM s.data_scadenza)::int AS mese,
      s.importo_scadenza AS imp,
      COALESCE(s.importo_pagato, 0) AS pag,
      s.data_scadenza AS ds,
      s.data_pagamento_effettiva AS dpe,
      (upper(COALESCE(s.codice_pagamento,'')) LIKE 'RB%') AS is_riba
    FROM public.scadenze s
    JOIN public.clienti c ON c.id = s.cliente_id
    CROSS JOIN eff
    WHERE s.data_scadenza >= make_date(_anno,1,1)
      AND s.data_scadenza <  make_date(_anno+1,1,1)
      AND s.importo_scadenza <> 0
      AND (eff.s IS NULL OR c.store_id = eff.s)
  ),
  classificata AS (
    SELECT mese, imp, pag, ds, dpe, is_riba,
      CASE
        WHEN imp < 0 THEN imp
        WHEN dpe IS NULL THEN 0::numeric
        ELSE LEAST(GREATEST(pag, 0), imp)
      END AS inc
    FROM righe
  ),
  con_residuo AS (
    SELECT mese, imp, pag, ds, dpe, is_riba, inc,
           (imp - inc) AS residuo,
           GREATEST(pag - imp, 0) AS ecc_riga
    FROM classificata
  ),
  agg AS (
    SELECT mese,
      SUM(imp) AS dovuto,
      SUM(inc) AS incassato,
      SUM(CASE WHEN ds <  CURRENT_DATE THEN residuo ELSE 0 END) AS scaduto,
      SUM(CASE WHEN ds >= CURRENT_DATE THEN residuo ELSE 0 END) AS a_scadere,
      SUM(CASE WHEN ds <  CURRENT_DATE AND is_riba THEN residuo ELSE 0 END) AS scaduto_riba,
      SUM(CASE WHEN ds >= CURRENT_DATE AND is_riba THEN residuo ELSE 0 END) AS a_scadere_riba,
      SUM(CASE WHEN imp > 0 THEN ecc_riga ELSE 0 END) AS eccedenza,
      COUNT(*) AS n_scadenze,
      COUNT(*) FILTER (WHERE dpe IS NOT NULL AND pag > 0) AS n_pagate
    FROM con_residuo GROUP BY 1
  )
  SELECT m.mese,
    COALESCE(a.dovuto,0)::numeric,
    COALESCE(a.incassato,0)::numeric,
    COALESCE(a.scaduto,0)::numeric,
    COALESCE(a.a_scadere,0)::numeric,
    COALESCE(a.scaduto_riba,0)::numeric,
    COALESCE(a.a_scadere_riba,0)::numeric,
    COALESCE(a.eccedenza,0)::numeric,
    (COALESCE(a.scaduto,0) + COALESCE(a.a_scadere,0))::numeric,
    CASE WHEN COALESCE(a.dovuto,0) > 0
      THEN LEAST((COALESCE(a.incassato,0) / a.dovuto) * 100, 100)
      ELSE 0 END::numeric,
    COALESCE(a.n_scadenze,0)::bigint,
    COALESCE(a.n_pagate,0)::bigint
  FROM m LEFT JOIN agg a ON a.mese = m.mese
  ORDER BY m.mese;
$function$;

CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_dettaglio(_anno integer, _mese integer, _store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, store_id uuid, store_nome text, dovuto_mese numeric, incassato_mese numeric, eccedenza_mese numeric, insoluto_mese numeric, scaduto_mese numeric, a_scadere_mese numeric, esposizione_scaduta_totale numeric, n_scadenze_mese integer, n_scadenze_pagate_mese integer, metodo_prevalente text, in_gestione_legale boolean, bloccato boolean, email text, pec text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(_store_id) AS s),
  d1 AS (SELECT make_date(_anno,_mese,1) AS d),
  d AS (SELECT d, (d + interval '1 month')::date AS d_next FROM d1),
  righe AS (
    SELECT
      s.cliente_id,
      s.importo_scadenza AS imp,
      COALESCE(s.importo_pagato,0) AS pag,
      s.data_scadenza AS ds,
      s.data_pagamento_effettiva AS dpe,
      s.codice_pagamento,
      CASE
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'RB%' THEN 'RiBa'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'BO%' THEN 'Bonifico'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'RID%' THEN 'RID'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'S%'
          OR upper(COALESCE(s.codice_pagamento,'')) LIKE 'RD%'
          OR upper(COALESCE(s.codice_pagamento,'')) LIKE 'O%' THEN 'Rimessa'
        ELSE 'Altro'
      END AS metodo
    FROM public.scadenze s
    JOIN public.clienti c2 ON c2.id = s.cliente_id
    CROSS JOIN d, eff
    WHERE s.data_scadenza >= d.d
      AND s.data_scadenza <  d.d_next
      AND s.importo_scadenza <> 0
      AND (eff.s IS NULL OR c2.store_id = eff.s)
  ),
  classificata AS (
    SELECT cliente_id, imp, pag, ds, dpe, codice_pagamento, metodo,
      CASE
        WHEN imp < 0 THEN imp
        WHEN dpe IS NULL THEN 0::numeric
        ELSE LEAST(GREATEST(pag,0), imp)
      END AS inc,
      GREATEST(pag - imp, 0) AS ecc_riga
    FROM righe
  ),
  con_residuo AS (SELECT c.*, (imp - inc) AS residuo FROM classificata c),
  mese_agg AS (
    SELECT cliente_id,
      SUM(imp)::numeric AS dovuto_mese,
      SUM(inc)::numeric AS incassato_mese,
      SUM(CASE WHEN imp > 0 THEN ecc_riga ELSE 0 END)::numeric AS eccedenza_mese,
      SUM(CASE WHEN ds <  CURRENT_DATE THEN residuo ELSE 0 END)::numeric AS scaduto_mese,
      SUM(CASE WHEN ds >= CURRENT_DATE THEN residuo ELSE 0 END)::numeric AS a_scadere_mese,
      COUNT(*)::int AS n_scad,
      COUNT(*) FILTER (WHERE dpe IS NOT NULL AND pag > 0)::int AS n_pag
    FROM con_residuo GROUP BY cliente_id
  ),
  metodi AS (SELECT cliente_id, metodo, SUM(imp) AS tot FROM classificata GROUP BY cliente_id, metodo),
  metodo_top AS (SELECT DISTINCT ON (cliente_id) cliente_id, metodo AS metodo_top FROM metodi ORDER BY cliente_id, tot DESC),
  metodo_cnt AS (SELECT cliente_id, COUNT(*)::int AS n_metodi FROM metodi WHERE tot <> 0 GROUP BY cliente_id),
  metodo_final AS (
    SELECT mt.cliente_id,
      CASE WHEN COALESCE(mc.n_metodi,1) > 1 THEN 'Misto' ELSE mt.metodo_top END AS metodo_prevalente
    FROM metodo_top mt LEFT JOIN metodo_cnt mc ON mc.cliente_id = mt.cliente_id
  ),
  scad_oggi AS (
    SELECT s.cliente_id,
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN 0 ELSE s.importo_scadenza END)::numeric AS ssa,
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN s.importo_scadenza ELSE 0 END)::numeric AS ant
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE
    GROUP BY s.cliente_id
  )
  SELECT
    c.id, c.ragione_sociale, c.codice_gestionale, c.store_id, st.nome,
    COALESCE(m.dovuto_mese,0),
    COALESCE(m.incassato_mese,0),
    COALESCE(m.eccedenza_mese,0),
    (COALESCE(m.scaduto_mese,0) + COALESCE(m.a_scadere_mese,0))::numeric,
    COALESCE(m.scaduto_mese,0),
    COALESCE(m.a_scadere_mese,0),
    COALESCE(public.calcola_scaduto(so.ssa, so.ant), 0),
    COALESCE(m.n_scad,0),
    COALESCE(m.n_pag,0),
    COALESCE(mf.metodo_prevalente,'Altro'),
    COALESCE(c.in_gestione_legale,false),
    COALESCE(c.bloccato,false),
    c.email, c.pec
  FROM mese_agg m
  JOIN public.clienti c ON c.id = m.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN scad_oggi so ON so.cliente_id = c.id
  LEFT JOIN metodo_final mf ON mf.cliente_id = c.id
  WHERE public.user_can_access_cliente(c.id)
  ORDER BY COALESCE(m.scaduto_mese,0) DESC NULLS LAST,
           COALESCE(m.a_scadere_mese,0) DESC NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_scadenze(_anno integer, _mese integer, _store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, in_gestione_legale boolean, bloccato boolean, email text, pec text, store_id uuid, store_nome text, scadenza_id uuid, numero_documento text, data_scadenza date, importo_scadenza numeric, importo_pagato numeric, quota_incassata numeric, residuo numeric, eccedenza numeric, scaduta boolean, codice_pagamento text, metodo_descrizione text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(_store_id) AS s),
  d1 AS (SELECT make_date(_anno,_mese,1) AS d),
  d AS (SELECT d, (d + interval '1 month')::date AS d_next FROM d1)
  SELECT
    c.id AS cliente_id,
    c.ragione_sociale,
    c.codice_gestionale,
    COALESCE(c.in_gestione_legale,false),
    COALESCE(c.bloccato,false),
    c.email,
    c.pec,
    c.store_id,
    st.nome AS store_nome,
    s.id AS scadenza_id,
    s.numero_documento,
    s.data_scadenza,
    COALESCE(s.importo_scadenza,0)::numeric,
    COALESCE(s.importo_pagato,0)::numeric,
    CASE
      WHEN COALESCE(s.importo_scadenza,0) < 0 THEN COALESCE(s.importo_scadenza,0)
      WHEN s.data_pagamento_effettiva IS NULL THEN 0::numeric
      ELSE LEAST(GREATEST(COALESCE(s.importo_pagato,0), 0), COALESCE(s.importo_scadenza,0))
    END::numeric AS quota_incassata,
    (COALESCE(s.importo_scadenza,0) -
      CASE
        WHEN COALESCE(s.importo_scadenza,0) < 0 THEN COALESCE(s.importo_scadenza,0)
        WHEN s.data_pagamento_effettiva IS NULL THEN 0::numeric
        ELSE LEAST(GREATEST(COALESCE(s.importo_pagato,0), 0), COALESCE(s.importo_scadenza,0))
      END
    )::numeric AS residuo,
    GREATEST(COALESCE(s.importo_pagato,0) - COALESCE(s.importo_scadenza,0), 0)::numeric AS eccedenza,
    (s.data_scadenza < CURRENT_DATE) AS scaduta,
    s.codice_pagamento,
    cp.descrizione AS metodo_descrizione
  FROM public.scadenze s
  JOIN public.clienti c ON c.id = s.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN public.codici_pagamento cp ON cp.cod = s.codice_pagamento
  , d, eff
  WHERE s.data_scadenza >= d.d
    AND s.data_scadenza <  d.d_next
    AND COALESCE(s.importo_scadenza,0) <> 0
    AND public.user_can_access_cliente(c.id)
    AND (eff.s IS NULL OR c.store_id = eff.s);
$function$;

CREATE OR REPLACE FUNCTION public.get_dso_aggregato(_cliente_id uuid DEFAULT NULL::uuid, _store_id uuid DEFAULT NULL::uuid, _data_da date DEFAULT NULL::date, _data_a date DEFAULT NULL::date)
 RETURNS TABLE(all_teorico_pond numeric, all_teorico_medio numeric, all_reale_pond numeric, all_reale_medio numeric, all_scollamento_pond numeric, all_scollamento_medio numeric, all_n bigint, all_importo numeric, cred_teorico_pond numeric, cred_teorico_medio numeric, cred_reale_pond numeric, cred_reale_medio numeric, cred_scollamento_pond numeric, cred_scollamento_medio numeric, cred_n bigint, cred_importo numeric, n_anticipo bigint, n_puntuali bigint, n_ritardo bigint, importo_anticipo numeric, importo_puntuali numeric, importo_ritardo numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(_store_id) AS s),
  d AS (
    SELECT
      (s.data_scadenza - s.data_documento)::int AS teorico,
      (s.data_pagamento_effettiva - s.data_documento)::int AS reale,
      (s.data_pagamento_effettiva - s.data_scadenza)::int AS ritardo,
      COALESCE(s.importo_pagato, s.importo_scadenza) AS peso
    FROM public.scadenze s
    LEFT JOIN public.clienti c ON c.id = s.cliente_id
    CROSS JOIN eff
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_scadenza IS NOT NULL
      AND s.data_documento IS NOT NULL
      AND COALESCE(s.importo_pagato, s.importo_scadenza) > 0
      AND (_cliente_id IS NULL OR s.cliente_id = _cliente_id)
      AND (eff.s IS NULL OR c.store_id = eff.s)
      AND (_data_da IS NULL OR s.data_scadenza >= _data_da)
      AND (_data_a IS NULL OR s.data_scadenza <= _data_a)
  )
  SELECT
    CASE WHEN SUM(peso)>0 THEN ROUND((SUM(teorico*peso)/SUM(peso))::numeric,1) END,
    ROUND(AVG(teorico)::numeric,1),
    CASE WHEN SUM(peso)>0 THEN ROUND((SUM(reale*peso)/SUM(peso))::numeric,1) END,
    ROUND(AVG(reale)::numeric,1),
    CASE WHEN SUM(peso)>0 THEN ROUND((SUM((reale-teorico)*peso)/SUM(peso))::numeric,1) END,
    ROUND(AVG(reale-teorico)::numeric,1),
    COUNT(*), COALESCE(SUM(peso),0),
    CASE WHEN SUM(peso) FILTER (WHERE teorico>0)>0
      THEN ROUND((SUM(teorico*peso) FILTER (WHERE teorico>0)/SUM(peso) FILTER (WHERE teorico>0))::numeric,1) END,
    ROUND(AVG(teorico) FILTER (WHERE teorico>0)::numeric,1),
    CASE WHEN SUM(peso) FILTER (WHERE teorico>0)>0
      THEN ROUND((SUM(reale*peso) FILTER (WHERE teorico>0)/SUM(peso) FILTER (WHERE teorico>0))::numeric,1) END,
    ROUND(AVG(reale) FILTER (WHERE teorico>0)::numeric,1),
    CASE WHEN SUM(peso) FILTER (WHERE teorico>0)>0
      THEN ROUND((SUM((reale-teorico)*peso) FILTER (WHERE teorico>0)/SUM(peso) FILTER (WHERE teorico>0))::numeric,1) END,
    ROUND(AVG(reale-teorico) FILTER (WHERE teorico>0)::numeric,1),
    COUNT(*) FILTER (WHERE teorico>0),
    COALESCE(SUM(peso) FILTER (WHERE teorico>0),0),
    COUNT(*) FILTER (WHERE ritardo<0),
    COUNT(*) FILTER (WHERE ritardo=0),
    COUNT(*) FILTER (WHERE ritardo>0),
    COALESCE(SUM(peso) FILTER (WHERE ritardo<0),0),
    COALESCE(SUM(peso) FILTER (WHERE ritardo=0),0),
    COALESCE(SUM(peso) FILTER (WHERE ritardo>0),0)
  FROM d;
$function$;

CREATE OR REPLACE FUNCTION public.get_dso_serie_mensile(_cliente_id uuid DEFAULT NULL::uuid, _store_id uuid DEFAULT NULL::uuid, _mesi_indietro integer DEFAULT 24)
 RETURNS TABLE(mese date, all_teorico numeric, all_reale numeric, cred_teorico numeric, cred_reale numeric, n_scadenze bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(_store_id) AS s),
  d AS (
    SELECT
      date_trunc('month', s.data_scadenza)::date AS mese,
      (s.data_scadenza - s.data_documento)::int AS teorico,
      (s.data_pagamento_effettiva - s.data_documento)::int AS reale,
      COALESCE(s.importo_pagato, s.importo_scadenza) AS peso
    FROM public.scadenze s
    LEFT JOIN public.clienti c ON c.id = s.cliente_id
    CROSS JOIN eff
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_scadenza IS NOT NULL
      AND s.data_documento IS NOT NULL
      AND COALESCE(s.importo_pagato, s.importo_scadenza) > 0
      AND s.data_scadenza >= (date_trunc('month', CURRENT_DATE) - (_mesi_indietro || ' months')::interval)::date
      AND (_cliente_id IS NULL OR s.cliente_id = _cliente_id)
      AND (eff.s IS NULL OR c.store_id = eff.s)
  )
  SELECT mese,
    CASE WHEN SUM(peso)>0 THEN ROUND((SUM(teorico*peso)/SUM(peso))::numeric,1) END,
    CASE WHEN SUM(peso)>0 THEN ROUND((SUM(reale*peso)/SUM(peso))::numeric,1) END,
    CASE WHEN SUM(peso) FILTER (WHERE teorico>0)>0
      THEN ROUND((SUM(teorico*peso) FILTER (WHERE teorico>0)/SUM(peso) FILTER (WHERE teorico>0))::numeric,1) END,
    CASE WHEN SUM(peso) FILTER (WHERE teorico>0)>0
      THEN ROUND((SUM(reale*peso) FILTER (WHERE teorico>0)/SUM(peso) FILTER (WHERE teorico>0))::numeric,1) END,
    COUNT(*)
  FROM d
  GROUP BY mese
  ORDER BY mese;
$function$;

CREATE OR REPLACE FUNCTION public.get_incassi_periodo(_dal date, _al date, _cliente_search text DEFAULT NULL::text, _metodi text[] DEFAULT NULL::text[], _store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, store_id uuid, store_nome text, n_incassi bigint, totale_incassato numeric, n_saldi bigint, n_parziali bigint, tipo_prevalente text, ultimo_incasso date, metodo_prevalente text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(_store_id) AS s),
  pagate AS (
    SELECT
      s.cliente_id,
      s.importo_pagato,
      s.importo_scadenza,
      s.data_pagamento_effettiva,
      s.codice_pagamento,
      CASE
        WHEN COALESCE(s.importo_pagato, 0) >= COALESCE(s.importo_scadenza, 0)
          THEN 'saldo' ELSE 'parziale'
      END AS tipo,
      CASE
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'RB%' THEN 'RiBa'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'BO%' THEN 'Bonifico'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'RID%' THEN 'RID'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'S%'
          OR upper(COALESCE(s.codice_pagamento,'')) LIKE 'RD%'
          OR upper(COALESCE(s.codice_pagamento,'')) LIKE 'O%' THEN 'Rimessa'
        ELSE 'Altro'
      END AS metodo
    FROM public.scadenze s
    JOIN public.clienti c2 ON c2.id = s.cliente_id
    CROSS JOIN eff
    WHERE s.data_pagamento_effettiva IS NOT NULL
      AND s.data_pagamento_effettiva BETWEEN _dal AND _al
      AND COALESCE(s.importo_pagato, 0) > 0
      AND COALESCE(s.importo_scadenza, 0) <> 0
      AND (eff.s IS NULL OR c2.store_id = eff.s)
  ),
  pagate_f AS (
    SELECT * FROM pagate
    WHERE _metodi IS NULL OR cardinality(_metodi) = 0 OR metodo = ANY(_metodi)
  ),
  metodi_cli AS (SELECT cliente_id, metodo, SUM(importo_pagato) AS tot FROM pagate_f GROUP BY cliente_id, metodo),
  metodo_top AS (SELECT DISTINCT ON (cliente_id) cliente_id, metodo AS metodo_top FROM metodi_cli ORDER BY cliente_id, tot DESC),
  metodo_cnt AS (SELECT cliente_id, COUNT(*)::int AS n_metodi FROM metodi_cli WHERE tot <> 0 GROUP BY cliente_id),
  metodo_final AS (
    SELECT mt.cliente_id,
      CASE WHEN COALESCE(mc.n_metodi,1) > 1 THEN 'Misto' ELSE mt.metodo_top END AS metodo_prevalente
    FROM metodo_top mt LEFT JOIN metodo_cnt mc ON mc.cliente_id = mt.cliente_id
  )
  SELECT
    c.id, c.ragione_sociale::text, c.codice_gestionale::text,
    c.store_id, st.nome::text AS store_nome,
    COUNT(*)::bigint,
    SUM(p.importo_pagato)::numeric,
    SUM((p.tipo = 'saldo')::int)::bigint,
    SUM((p.tipo = 'parziale')::int)::bigint,
    CASE WHEN SUM((p.tipo = 'saldo')::int) >= SUM((p.tipo = 'parziale')::int)
      THEN 'saldo' ELSE 'parziale' END,
    MAX(p.data_pagamento_effettiva),
    COALESCE(mf.metodo_prevalente, 'Altro')
  FROM pagate_f p
  JOIN public.clienti c ON c.id = p.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN metodo_final mf ON mf.cliente_id = c.id
  WHERE _cliente_search IS NULL
     OR _cliente_search = ''
     OR c.ragione_sociale ILIKE '%' || _cliente_search || '%'
     OR c.codice_gestionale ILIKE '%' || _cliente_search || '%'
  GROUP BY c.id, c.ragione_sociale, c.codice_gestionale, c.store_id, st.nome, mf.metodo_prevalente
  ORDER BY SUM(p.importo_pagato) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_incassi_periodo_dettaglio(_dal date, _al date, _cliente_id uuid, _metodi text[] DEFAULT NULL::text[], _store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(scadenza_id uuid, numero_documento text, data_scadenza date, importo_scadenza numeric, importo_pagato numeric, data_pagamento_effettiva date, codice_pagamento text, metodo_descrizione text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(_store_id) AS s)
  SELECT
    s.id, s.numero_documento, s.data_scadenza,
    COALESCE(s.importo_scadenza,0)::numeric,
    COALESCE(s.importo_pagato,0)::numeric,
    s.data_pagamento_effettiva,
    s.codice_pagamento,
    cp.descrizione
  FROM public.scadenze s
  JOIN public.clienti c ON c.id = s.cliente_id
  LEFT JOIN public.codici_pagamento cp ON cp.cod = s.codice_pagamento
  CROSS JOIN eff
  WHERE s.cliente_id = _cliente_id
    AND s.data_pagamento_effettiva IS NOT NULL
    AND s.data_pagamento_effettiva BETWEEN _dal AND _al
    AND COALESCE(s.importo_pagato,0) > 0
    AND COALESCE(s.importo_scadenza,0) <> 0
    AND public.user_can_access_cliente(c.id)
    AND (eff.s IS NULL OR c.store_id = eff.s)
    AND (_metodi IS NULL OR cardinality(_metodi) = 0 OR (
      CASE
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'RB%' THEN 'RiBa'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'BO%' THEN 'Bonifico'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'RID%' THEN 'RID'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'S%'
          OR upper(COALESCE(s.codice_pagamento,'')) LIKE 'RD%'
          OR upper(COALESCE(s.codice_pagamento,'')) LIKE 'O%' THEN 'Rimessa'
        ELSE 'Altro'
      END = ANY(_metodi)
    ))
  ORDER BY s.data_pagamento_effettiva ASC, s.data_scadenza ASC;
$function$;

-- 3) Le due senza parametro: filtro derivato dal chiamante
CREATE OR REPLACE FUNCTION public.get_fatturato_clienti_scadenziario(_anno_corrente integer, _anno_prec integer)
 RETURNS TABLE(cliente_id uuid, fatturato_anno_corrente numeric, fatturato_anno_prec numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(NULL::uuid) AS s),
  clienti_scad AS (
    SELECT DISTINCT s.cliente_id
    FROM public.scadenze s
    JOIN public.clienti c ON c.id = s.cliente_id
    CROSS JOIN eff
    WHERE s.cliente_id IS NOT NULL
      AND s.stato_contabile = 'Aperta'
      AND (eff.s IS NULL OR c.store_id = eff.s)
  )
  SELECT
    cs.cliente_id,
    COALESCE(SUM(f.fatturato) FILTER (WHERE f.anno = _anno_corrente), 0)::numeric AS fatturato_anno_corrente,
    COALESCE(SUM(f.fatturato) FILTER (WHERE f.anno = _anno_prec), 0)::numeric AS fatturato_anno_prec
  FROM clienti_scad cs
  LEFT JOIN public.fatturato_clienti f
    ON f.cliente_id = cs.cliente_id
   AND f.anno IN (_anno_corrente, _anno_prec)
  GROUP BY cs.cliente_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_promemoria_scadenze_dettaglio(_data date, _escludi_legale boolean DEFAULT true, _escludi_bloccati boolean DEFAULT false, _escludi_bos boolean DEFAULT true, _includi_bonifici boolean DEFAULT true, _includi_riba boolean DEFAULT true)
 RETURNS TABLE(scadenza_id uuid, cliente_id uuid, ragione_sociale text, email text, pec text, store_id uuid, store_nome text, store_insegna text, store_indirizzo text, store_cap text, store_citta text, store_provincia text, store_telefono text, numero_documento text, data_documento date, data_scadenza date, importo_scadenza numeric, codice_pagamento text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.store_id_effettivo(NULL::uuid) AS s)
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
    AND (eff.s IS NULL OR c.store_id = eff.s)
    AND (_escludi_legale IS FALSE OR COALESCE(s.in_legale, false) = false)
    AND (_escludi_bloccati IS FALSE OR COALESCE(c.bloccato, false) = false)
    AND (_escludi_bos IS FALSE OR COALESCE(s.codice_pagamento, '') NOT ILIKE 'BOS%')
    AND (
      (_includi_bonifici AND COALESCE(s.codice_pagamento, '') ILIKE 'BO%')
      OR (_includi_riba AND COALESCE(s.codice_pagamento, '') ILIKE 'RB%')
    )
  ORDER BY c.ragione_sociale ASC, s.data_scadenza ASC, s.numero_documento ASC;
$function$;

-- 4) Tracciamento clic: solo processo interno (redirect server-side con service_role)
REVOKE EXECUTE ON FUNCTION public.registra_clic_campagna(text, text, text, text) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.registra_clic_campagna(text, text, text, text) TO service_role;