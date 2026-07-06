
-- Helper permessi: restituisce lo store effettivo su cui la RPC deve filtrare.
-- - Utenti trasversali (admin/amministrazione/direzione/approvatori L1-L3): pass-through di _requested (NULL = tutte).
-- - Utenti ristretti (es. store_manager): forzati alla loro sede (profili.store_id), IGNORANDO _requested.
CREATE OR REPLACE FUNCTION public.effective_store_filter(_requested uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(),'amministratore'::app_role)
      OR public.has_role(auth.uid(),'amministrazione'::app_role)
      OR public.has_role(auth.uid(),'direzione'::app_role)
      OR public.has_role(auth.uid(),'approvatore_liv1'::app_role)
      OR public.has_role(auth.uid(),'approvatore_liv2'::app_role)
      OR public.has_role(auth.uid(),'approvatore_liv3'::app_role)
    THEN _requested
    ELSE (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
  END;
$$;

-- ============================================================
-- 1) get_cruscotto_incassi_mensile — aggiunge _store_id
-- ============================================================
DROP FUNCTION IF EXISTS public.get_cruscotto_incassi_mensile(integer);
DROP FUNCTION IF EXISTS public.get_cruscotto_incassi_mensile(integer, uuid);
CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mensile(_anno integer, _store_id uuid DEFAULT NULL)
 RETURNS TABLE(mese integer, dovuto numeric, incassato numeric, scaduto numeric, a_scadere numeric, scaduto_riba numeric, a_scadere_riba numeric, eccedenza numeric, da_incassare numeric, pct numeric, n_scadenze bigint, n_pagate bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.effective_store_filter(_store_id) AS s),
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

-- ============================================================
-- 2) get_cruscotto_incassi_mese_dettaglio — aggiunge _store_id
-- ============================================================
DROP FUNCTION IF EXISTS public.get_cruscotto_incassi_mese_dettaglio(integer, integer);
DROP FUNCTION IF EXISTS public.get_cruscotto_incassi_mese_dettaglio(integer, integer, uuid);
CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_dettaglio(_anno integer, _mese integer, _store_id uuid DEFAULT NULL)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, store_id uuid, store_nome text, dovuto_mese numeric, incassato_mese numeric, eccedenza_mese numeric, insoluto_mese numeric, scaduto_mese numeric, a_scadere_mese numeric, esposizione_scaduta_totale numeric, n_scadenze_mese integer, n_scadenze_pagate_mese integer, metodo_prevalente text, in_gestione_legale boolean, bloccato boolean, email text, pec text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.effective_store_filter(_store_id) AS s),
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

-- ============================================================
-- 3) get_cruscotto_incassi_mese_scadenze — aggiunge _store_id
-- ============================================================
DROP FUNCTION IF EXISTS public.get_cruscotto_incassi_mese_scadenze(integer, integer);
DROP FUNCTION IF EXISTS public.get_cruscotto_incassi_mese_scadenze(integer, integer, uuid);
CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_scadenze(_anno integer, _mese integer, _store_id uuid DEFAULT NULL)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, in_gestione_legale boolean, bloccato boolean, email text, pec text, scadenza_id uuid, numero_documento text, data_scadenza date, importo_scadenza numeric, importo_pagato numeric, quota_incassata numeric, residuo numeric, eccedenza numeric, scaduta boolean, codice_pagamento text, metodo_descrizione text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.effective_store_filter(_store_id) AS s),
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
  LEFT JOIN public.codici_pagamento cp ON cp.cod = s.codice_pagamento
  , d, eff
  WHERE s.data_scadenza >= d.d
    AND s.data_scadenza <  d.d_next
    AND COALESCE(s.importo_scadenza,0) <> 0
    AND public.user_can_access_cliente(c.id)
    AND (eff.s IS NULL OR c.store_id = eff.s);
$function$;

-- ============================================================
-- 4) get_incassi_periodo — aggiunge _store_id
-- ============================================================
DROP FUNCTION IF EXISTS public.get_incassi_periodo(date, date, text, text[]);
DROP FUNCTION IF EXISTS public.get_incassi_periodo(date, date, text, text[], uuid);
CREATE OR REPLACE FUNCTION public.get_incassi_periodo(_dal date, _al date, _cliente_search text DEFAULT NULL::text, _metodi text[] DEFAULT NULL::text[], _store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, n_incassi bigint, totale_incassato numeric, n_saldi bigint, n_parziali bigint, tipo_prevalente text, ultimo_incasso date, metodo_prevalente text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.effective_store_filter(_store_id) AS s),
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
  LEFT JOIN metodo_final mf ON mf.cliente_id = c.id
  WHERE _cliente_search IS NULL
     OR _cliente_search = ''
     OR c.ragione_sociale ILIKE '%' || _cliente_search || '%'
     OR c.codice_gestionale ILIKE '%' || _cliente_search || '%'
  GROUP BY c.id, c.ragione_sociale, c.codice_gestionale, mf.metodo_prevalente
  ORDER BY SUM(p.importo_pagato) DESC;
$function$;

-- ============================================================
-- 5) get_incassi_periodo_dettaglio — aggiunge _store_id (per coerenza)
-- Il filtro sul singolo cliente e' gia' implicito (user_can_access_cliente),
-- ma aggiungiamo il parametro per uniformita' e per bloccare un cliente
-- fuori-sede su un utente ristretto.
-- ============================================================
DO $mig$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('DROP FUNCTION IF EXISTS public.%I(%s);', p.proname, pg_get_function_identity_arguments(p.oid)) AS ddl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_incassi_periodo_dettaglio'
  LOOP
    EXECUTE r.ddl;
  END LOOP;
END $mig$;

CREATE OR REPLACE FUNCTION public.get_incassi_periodo_dettaglio(_dal date, _al date, _cliente_id uuid, _metodi text[] DEFAULT NULL::text[], _store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(scadenza_id uuid, numero_documento text, data_scadenza date, importo_scadenza numeric, importo_pagato numeric, data_pagamento_effettiva date, codice_pagamento text, metodo_descrizione text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS (SELECT public.effective_store_filter(_store_id) AS s)
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
