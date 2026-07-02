
-- ============================================================
-- Cruscotto incassi: formula canonica per riga in tutte le RPC
-- inc(riga) = CASE
--   WHEN imp < 0 THEN imp
--   WHEN dpe IS NULL THEN 0
--   ELSE LEAST(GREATEST(COALESCE(pag,0),0), imp)
-- END
-- residuo = imp - inc  →  SCADUTO se ds<today, A SCADERE altrimenti
-- eccedenza = GREATEST(COALESCE(pag,0) - imp, 0) quando imp>0 [metadata]
-- ============================================================

DROP FUNCTION IF EXISTS public.get_cruscotto_incassi_mensile(integer);
CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mensile(_anno integer)
RETURNS TABLE(
  mese integer,
  dovuto numeric,
  incassato numeric,
  scaduto numeric,
  a_scadere numeric,
  scaduto_riba numeric,
  a_scadere_riba numeric,
  eccedenza numeric,
  da_incassare numeric,
  pct numeric,
  n_scadenze bigint,
  n_pagate bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH m AS (SELECT generate_series(1,12) AS mese),
  righe AS (
    SELECT
      EXTRACT(MONTH FROM s.data_scadenza)::int AS mese,
      s.importo_scadenza AS imp,
      COALESCE(s.importo_pagato, 0) AS pag,
      s.data_scadenza AS ds,
      s.data_pagamento_effettiva AS dpe,
      (upper(COALESCE(s.codice_pagamento,'')) LIKE 'RB%') AS is_riba
    FROM public.scadenze s
    WHERE s.data_scadenza >= make_date(_anno,1,1)
      AND s.data_scadenza <  make_date(_anno+1,1,1)
      AND s.importo_scadenza <> 0
  ),
  classificata AS (
    SELECT
      mese, imp, pag, ds, dpe, is_riba,
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
    SELECT
      mese,
      SUM(imp) AS dovuto,
      SUM(inc) AS incassato,
      SUM(CASE WHEN ds <  CURRENT_DATE THEN residuo ELSE 0 END) AS scaduto,
      SUM(CASE WHEN ds >= CURRENT_DATE THEN residuo ELSE 0 END) AS a_scadere,
      SUM(CASE WHEN ds <  CURRENT_DATE AND is_riba THEN residuo ELSE 0 END) AS scaduto_riba,
      SUM(CASE WHEN ds >= CURRENT_DATE AND is_riba THEN residuo ELSE 0 END) AS a_scadere_riba,
      SUM(CASE WHEN imp > 0 THEN ecc_riga ELSE 0 END) AS eccedenza,
      COUNT(*) AS n_scadenze,
      COUNT(*) FILTER (WHERE dpe IS NOT NULL AND pag > 0) AS n_pagate
    FROM con_residuo
    GROUP BY 1
  )
  SELECT
    m.mese,
    COALESCE(a.dovuto,0)::numeric,
    COALESCE(a.incassato,0)::numeric,
    COALESCE(a.scaduto,0)::numeric,
    COALESCE(a.a_scadere,0)::numeric,
    COALESCE(a.scaduto_riba,0)::numeric,
    COALESCE(a.a_scadere_riba,0)::numeric,
    COALESCE(a.eccedenza,0)::numeric,
    (COALESCE(a.scaduto,0) + COALESCE(a.a_scadere,0))::numeric AS da_incassare,
    CASE
      WHEN COALESCE(a.dovuto,0) > 0
        THEN LEAST( (COALESCE(a.incassato,0) / a.dovuto) * 100, 100 )
      ELSE 0
    END::numeric AS pct,
    COALESCE(a.n_scadenze,0)::bigint,
    COALESCE(a.n_pagate,0)::bigint
  FROM m
  LEFT JOIN agg a ON a.mese = m.mese
  ORDER BY m.mese;
$function$;

-- ============================================================
-- Dettaglio per cliente (stessa logica per riga)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_cruscotto_incassi_mese_dettaglio(integer, integer);
CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_dettaglio(_anno integer, _mese integer)
RETURNS TABLE(
  cliente_id uuid,
  ragione_sociale text,
  codice_gestionale text,
  store_id uuid,
  store_nome text,
  dovuto_mese numeric,
  incassato_mese numeric,
  eccedenza_mese numeric,
  insoluto_mese numeric,
  scaduto_mese numeric,
  a_scadere_mese numeric,
  esposizione_scaduta_totale numeric,
  n_scadenze_mese integer,
  n_scadenze_pagate_mese integer,
  metodo_prevalente text,
  in_gestione_legale boolean,
  bloccato boolean,
  email text,
  pec text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH d1 AS (SELECT make_date(_anno,_mese,1) AS d),
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
    FROM public.scadenze s, d
    WHERE s.data_scadenza >= d.d
      AND s.data_scadenza <  d.d_next
      AND s.importo_scadenza <> 0
  ),
  classificata AS (
    SELECT
      cliente_id, imp, pag, ds, dpe, codice_pagamento, metodo,
      CASE
        WHEN imp < 0 THEN imp
        WHEN dpe IS NULL THEN 0::numeric
        ELSE LEAST(GREATEST(pag,0), imp)
      END AS inc,
      GREATEST(pag - imp, 0) AS ecc_riga
    FROM righe
  ),
  con_residuo AS (
    SELECT c.*, (imp - inc) AS residuo FROM classificata c
  ),
  mese_agg AS (
    SELECT cliente_id,
      SUM(imp)::numeric AS dovuto_mese,
      SUM(inc)::numeric AS incassato_mese,
      SUM(CASE WHEN imp > 0 THEN ecc_riga ELSE 0 END)::numeric AS eccedenza_mese,
      SUM(CASE WHEN ds <  CURRENT_DATE THEN residuo ELSE 0 END)::numeric AS scaduto_mese,
      SUM(CASE WHEN ds >= CURRENT_DATE THEN residuo ELSE 0 END)::numeric AS a_scadere_mese,
      COUNT(*)::int AS n_scad,
      COUNT(*) FILTER (WHERE dpe IS NOT NULL AND pag > 0)::int AS n_pag
    FROM con_residuo
    GROUP BY cliente_id
  ),
  metodi AS (
    SELECT cliente_id, metodo, SUM(imp) AS tot
    FROM classificata GROUP BY cliente_id, metodo
  ),
  metodo_top AS (
    SELECT DISTINCT ON (cliente_id) cliente_id, metodo AS metodo_top
    FROM metodi ORDER BY cliente_id, tot DESC
  ),
  metodo_cnt AS (
    SELECT cliente_id, COUNT(*)::int AS n_metodi
    FROM metodi WHERE tot <> 0 GROUP BY cliente_id
  ),
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
    (COALESCE(m.scaduto_mese,0) + COALESCE(m.a_scadere_mese,0))::numeric AS insoluto_mese,
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
-- Scadenze del mese: quota_incassata e residuo derivate dalla formula canonica
-- ============================================================
DROP FUNCTION IF EXISTS public.get_cruscotto_incassi_mese_scadenze(integer, integer);
CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_scadenze(_anno integer, _mese integer)
RETURNS TABLE(
  cliente_id uuid,
  ragione_sociale text,
  codice_gestionale text,
  in_gestione_legale boolean,
  bloccato boolean,
  email text,
  pec text,
  scadenza_id uuid,
  numero_documento text,
  data_scadenza date,
  importo_scadenza numeric,
  importo_pagato numeric,
  quota_incassata numeric,
  residuo numeric,
  eccedenza numeric,
  scaduta boolean,
  codice_pagamento text,
  metodo_descrizione text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH d1 AS (SELECT make_date(_anno,_mese,1) AS d),
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
    -- quota_incassata: formula canonica
    CASE
      WHEN COALESCE(s.importo_scadenza,0) < 0 THEN COALESCE(s.importo_scadenza,0)
      WHEN s.data_pagamento_effettiva IS NULL THEN 0::numeric
      ELSE LEAST(GREATEST(COALESCE(s.importo_pagato,0), 0), COALESCE(s.importo_scadenza,0))
    END::numeric AS quota_incassata,
    -- residuo = imp - inc
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
  , d
  WHERE s.data_scadenza >= d.d
    AND s.data_scadenza <  d.d_next
    AND COALESCE(s.importo_scadenza,0) <> 0
    AND public.user_can_access_cliente(c.id);
$function$;
