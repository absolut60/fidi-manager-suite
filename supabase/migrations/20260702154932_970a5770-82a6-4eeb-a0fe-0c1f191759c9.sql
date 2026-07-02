
-- Aggiorna RPC dettaglio mese: scaduto/a_scadere usano importo_scadenza INTERO
-- per le scadenze con data_pagamento_effettiva NULL (RiBa presentate incluse).
CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_dettaglio(_anno integer, _mese integer)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, store_id uuid, store_nome text, dovuto_mese numeric, incassato_mese numeric, insoluto_mese numeric, scaduto_mese numeric, a_scadere_mese numeric, esposizione_scaduta_totale numeric, n_scadenze_mese integer, n_scadenze_pagate_mese integer, metodo_prevalente text, in_gestione_legale boolean, bloccato boolean, email text, pec text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH d1 AS (SELECT make_date(_anno, _mese, 1) AS d),
  d AS (SELECT d, (d + interval '1 month')::date AS d_next FROM d1),
  righe AS (
    SELECT
      s.cliente_id,
      s.importo_scadenza,
      s.importo_pagato,
      s.data_scadenza,
      s.data_pagamento_effettiva,
      s.codice_pagamento,
      CASE
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'RB%' THEN 'RiBa'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'BO%' THEN 'Bonifico'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'RID%' THEN 'RID'
        WHEN upper(COALESCE(s.codice_pagamento,'')) LIKE 'S%'
          OR upper(COALESCE(s.codice_pagamento,'')) LIKE 'RD%'
          OR upper(COALESCE(s.codice_pagamento,'')) LIKE 'O%' THEN 'Rimessa'
        ELSE 'Altro'
      END AS metodo,
      (s.data_pagamento_effettiva IS NOT NULL AND COALESCE(s.importo_pagato,0) > 0) AS is_pagata
    FROM public.scadenze s, d
    WHERE s.data_scadenza >= d.d
      AND s.data_scadenza < d.d_next
      AND s.importo_scadenza <> 0
  ),
  mese_agg AS (
    SELECT r.cliente_id,
      SUM(r.importo_scadenza)::numeric AS dovuto_mese,
      -- Incassato: solo se dpe NOT NULL AND pag>0 (isPagatoReale)
      SUM(CASE WHEN r.is_pagata THEN r.importo_pagato ELSE 0 END)::numeric AS incassato_mese,
      -- Scaduto: per riga, imp - quota_incassata_reale, in bucket per data
      SUM(CASE WHEN r.data_scadenza < CURRENT_DATE
               THEN COALESCE(r.importo_scadenza,0)
                    - CASE WHEN r.is_pagata THEN COALESCE(r.importo_pagato,0) ELSE 0 END
               ELSE 0 END)::numeric AS scaduto_mese,
      SUM(CASE WHEN r.data_scadenza >= CURRENT_DATE
               THEN COALESCE(r.importo_scadenza,0)
                    - CASE WHEN r.is_pagata THEN COALESCE(r.importo_pagato,0) ELSE 0 END
               ELSE 0 END)::numeric AS a_scadere_mese,
      COUNT(*)::int AS n_scad,
      COUNT(*) FILTER (WHERE r.is_pagata)::int AS n_pag
    FROM righe r
    GROUP BY r.cliente_id
  ),
  metodi AS (
    SELECT r.cliente_id, r.metodo, SUM(r.importo_scadenza) AS tot
    FROM righe r
    GROUP BY r.cliente_id, r.metodo
  ),
  metodo_top AS (
    SELECT DISTINCT ON (cliente_id) cliente_id, metodo AS metodo_top
    FROM metodi
    ORDER BY cliente_id, tot DESC
  ),
  metodo_cnt AS (
    SELECT cliente_id, COUNT(*)::int AS n_metodi
    FROM metodi
    WHERE tot <> 0
    GROUP BY cliente_id
  ),
  metodo_final AS (
    SELECT mt.cliente_id,
      CASE WHEN COALESCE(mc.n_metodi,1) > 1 THEN 'Misto' ELSE mt.metodo_top END AS metodo_prevalente
    FROM metodo_top mt
    LEFT JOIN metodo_cnt mc ON mc.cliente_id = mt.cliente_id
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
    COALESCE(m.dovuto_mese, 0),
    COALESCE(m.incassato_mese, 0),
    GREATEST(COALESCE(m.dovuto_mese,0) - COALESCE(m.incassato_mese,0), 0),
    COALESCE(m.scaduto_mese, 0),
    COALESCE(m.a_scadere_mese, 0),
    COALESCE(public.calcola_scaduto(so.ssa, so.ant), 0),
    COALESCE(m.n_scad, 0),
    COALESCE(m.n_pag, 0),
    COALESCE(mf.metodo_prevalente, 'Altro'),
    COALESCE(c.in_gestione_legale, false),
    COALESCE(c.bloccato, false),
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

-- Aggiorna RPC scadenze: residuo INTERO quando dpe NULL (RiBa presentate incluse)
CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_scadenze(_anno integer, _mese integer)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, codice_gestionale text, in_gestione_legale boolean, bloccato boolean, email text, pec text, scadenza_id uuid, numero_documento text, data_scadenza date, importo_scadenza numeric, importo_pagato numeric, quota_incassata numeric, residuo numeric, scaduta boolean, codice_pagamento text, metodo_descrizione text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH d1 AS (SELECT make_date(_anno, _mese, 1) AS d),
  d AS (SELECT d, (d + interval '1 month')::date AS d_next FROM d1)
  SELECT
    c.id AS cliente_id,
    c.ragione_sociale,
    c.codice_gestionale,
    COALESCE(c.in_gestione_legale, false),
    COALESCE(c.bloccato, false),
    c.email,
    c.pec,
    s.id AS scadenza_id,
    s.numero_documento,
    s.data_scadenza,
    COALESCE(s.importo_scadenza, 0)::numeric,
    COALESCE(s.importo_pagato, 0)::numeric,
    CASE
      WHEN s.data_pagamento_effettiva IS NOT NULL AND COALESCE(s.importo_pagato, 0) > 0
        THEN COALESCE(s.importo_pagato, 0)
      ELSE 0
    END::numeric AS quota_incassata,
    -- Residuo per il "da incassare": se dpe è NULL conta l'intero importo_scadenza
    -- (RiBa presentate non sono incassate). Se è pagata (dpe not null, pag>0),
    -- residuo = importo_scadenza - importo_pagato (parziali reali).
    CASE
      WHEN s.data_pagamento_effettiva IS NOT NULL AND COALESCE(s.importo_pagato, 0) > 0
        THEN COALESCE(s.importo_scadenza, 0) - COALESCE(s.importo_pagato, 0)
      ELSE COALESCE(s.importo_scadenza, 0)
    END::numeric AS residuo,
    (s.data_scadenza < CURRENT_DATE) AS scaduta,
    s.codice_pagamento,
    cp.descrizione AS metodo_descrizione
  FROM public.scadenze s
  JOIN public.clienti c ON c.id = s.cliente_id
  LEFT JOIN public.codici_pagamento cp ON cp.cod = s.codice_pagamento
  , d
  WHERE s.data_scadenza >= d.d
    AND s.data_scadenza < d.d_next
    AND COALESCE(s.importo_scadenza, 0) <> 0
    AND public.user_can_access_cliente(c.id);
$function$;
