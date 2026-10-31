-- FM55 fetta 3A: ordini fuori giro, margine 80%, tetto 1,5 x base e segnalazioni ordine_fuori_giro / oltre_tetto.
ALTER TABLE public.fido_teorico_cliente
  ADD COLUMN IF NOT EXISTS ordini_fuori numeric,
  ADD COLUMN IF NOT EXISTS tetto numeric,
  ADD COLUMN IF NOT EXISTS valore_senza_tetto numeric;

-- Fonte unica della regola margine/tetto (regola calcolo, profili di comportamento).
CREATE OR REPLACE FUNCTION public.fido_v2_margine_tetto(_base numeric, _esp numeric, _ord numeric, _acq numeric, _sc_oltre numeric)
RETURNS TABLE(ordini_fuori numeric, valore numeric, tetto numeric, fp numeric, margine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  WITH cfg AS (
    SELECT
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_ordini_mesi_max'),',','.')),'')::numeric, 1) AS mesi,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_tetto_base'),',','.')),'')::numeric, 1.5) AS tb,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_margine_soglia'),',','.')),'')::numeric, 0.80) AS ms,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_scaduto_importo'),',','.')),'')::numeric, 500) AS sc_imp
  ), n AS (
    SELECT COALESCE(_base,0) b, COALESCE(_esp,0) e, COALESCE(_ord,0) o,
           LEAST(COALESCE(_ord,0), GREATEST(COALESCE(_acq,0),0) * cfg.mesi) AS onorm, cfg.*,
           COALESCE(_sc_oltre,0) > cfg.sc_imp AS sc_inc
    FROM cfg
  ), s AS (
    SELECT n.*, n.e + n.onorm AS fn, (NOT (n.e + n.onorm > n.b) AND NOT n.sc_inc) AS sano FROM n
  ), w AS (
    SELECT s.*, GREATEST(s.b, CASE WHEN s.sano THEN s.fn / NULLIF(s.ms,0) ELSE s.fn END) AS val, s.b * s.tb AS tt FROM s
  )
  SELECT w.o - w.onorm, w.val, w.tt,
         GREATEST(w.b, public.arrotonda_fido_v2(LEAST(w.val, w.tt))),
         (w.sano AND w.fn / NULLIF(w.ms,0) > w.b)
  FROM w
$f$;
REVOKE EXECUTE ON FUNCTION public.fido_v2_margine_tetto(numeric,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fido_v2_margine_tetto(numeric,numeric,numeric,numeric,numeric) TO authenticated, service_role;

-- Segnalazioni: nuova versione (ordine_fuori_giro al posto di ordini_prevalenti, oltre_tetto).
CREATE OR REPLACE FUNCTION public.segnalazioni_fido(_regola text, _base numeric, _fabbisogno numeric, _ordini numeric, _fido_gamma numeric, _scaduto_oltre numeric, _pagato_12m numeric, _ordini_fuori numeric, _valore_senza_tetto numeric, _tetto numeric)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cfg AS (
    SELECT
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='alert_fidi_soglia_1'),',','.')),'')::numeric, 0.80) AS soglia,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_scaduto_importo'),',','.')),'')::numeric, 500) AS sc_imp
  ), v AS (
    SELECT COALESCE(_base,0) b, COALESCE(_fabbisogno,0) fab, COALESCE(_fido_gamma,0) fg,
           COALESCE(_scaduto_oltre,0) so, COALESCE(_ordini_fuori,0) ofu FROM cfg
  )
  SELECT array_remove(ARRAY[
    CASE WHEN _regola='cliente_bloccato' THEN 'bloccato' END,
    CASE WHEN _regola='scaduto_non_incassato' THEN 'scaduto_non_incassato' END,
    CASE WHEN COALESCE(_regola,'') NOT IN ('scaduto_non_incassato','cliente_bloccato','gestione_legale') AND v.so > cfg.sc_imp THEN 'scaduto_da_incassare' END,
    CASE WHEN v.b>0 AND v.fab>v.b THEN 'impegni_sopra_base' END,
    CASE WHEN v.ofu > 0 THEN 'ordine_fuori_giro' END,
    CASE WHEN _tetto IS NOT NULL AND _valore_senza_tetto > _tetto THEN 'oltre_tetto' END,
    CASE WHEN v.fg>0 AND v.fab/v.fg >= cfg.soglia AND NOT (v.b>0 AND v.fab>v.b) THEN 'uso_pieno' END
  ], NULL)
  FROM v, cfg
$function$;
REVOKE EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) TO authenticated, service_role;
COMMENT ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric) IS 'DEPRECATED: sostituita dalla versione a 10 argomenti (fetta 3A).';

CREATE OR REPLACE FUNCTION public.get_fido_teorico_v2(_cliente_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(cliente_id uuid, acquisto_storico numeric, acquisto_tendenza numeric, acquisto_mensile numeric, ciclo_gg numeric, mesi_stagionali numeric, profilo text, coefficiente numeric, base numeric, esposizione numeric, ordini_aperti numeric, fabbisogno numeric, fido_proposto numeric, fido_attuale numeric, consumo_perc numeric, regola text, da_verificare boolean, spiegazione text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cfg AS MATERIALIZED (
    SELECT
      public.store_id_effettivo(NULL) AS sid,
      date_trunc('month', CURRENT_DATE)::date AS m0,
      EXTRACT(day FROM CURRENT_DATE)::numeric AS gg_trascorsi,
      EXTRACT(day FROM (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day'))::numeric AS gg_mese,
      COALESCE(
        (SELECT array_agg(trim(x)::numeric / 100 ORDER BY o)
           FROM unnest(string_to_array((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_stagionalita'), ',')) WITH ORDINALITY AS u(x, o)
          HAVING count(*) = 12),
        ARRAY[0.77,0.93,1.07,1.16,1.08,1.03,1.13,0.37,1.00,1.24,1.17,1.07]::numeric[]
      ) AS idx,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_giorno_minimo_mese_corrente'), ',', '.')), '')::numeric, 10) AS gmin,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_tolleranza_gg'), ',', '.')), '')::numeric, 15) AS toll,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_soglia_residuo_eur'), ',', '.')), '')::numeric, 500) AS soglia,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_quota_insoluto_isolato'), ',', '.')), '')::numeric, 0.10) AS q_ins,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_quota_ritardo_occasionale'), ',', '.')), '')::numeric, 0.50) AS q_occ,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_fido_dormienti_eur'), ',', '.')), '')::numeric, 500) AS fido_dorm,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_mesi_dormiente_max'), ',', '.')), '')::numeric, 18) AS m_dorm,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_mesi_cliente_nuovo'), ',', '.')), '')::numeric, 6) AS m_nuovo,
      COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_data_carico_iniziale')), '')::date, DATE '2026-06-30') AS data_carico,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_abituale'), ',', '.')), '')::numeric, 0.80) AS c_abit,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_grave'), ',', '.')), '')::numeric, 0.60) AS c_grave,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_insoluto_isolato'), ',', '.')), '')::numeric, 0.80) AS c_iso,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_pat_insoluto_pesante'), ',', '.')), '')::numeric, 0.60) AS c_pes,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_pat_insoluti_ripetuti'), ',', '.')), '')::numeric, 0.40) AS c_rip,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_pat_scaduto_fermo'), ',', '.')), '')::numeric, 0.20) AS c_fermo,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_scaduto_importo'), ',', '.')), '')::numeric, 500) AS sc_imp,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_scaduto_giorni'), ',', '.')), '')::numeric, 15)::int AS sc_gg_cfg,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_scaduto_giorni_riba'), ',', '.')), '')::numeric, 5)::int AS sc_gg_riba,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_scaduto_quota_pagato'), ',', '.')), '')::numeric, 0.10) AS sc_quota,
      -- come get_fido_teorico
      (lower(COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_escludi_sede')), ''), 'false')) IN ('true','t','1','si','sì')) AS escludi_sede,
      COALESCE(
        (SELECT array_agg(v) FROM (
           SELECT regexp_replace(x, '\D', '', 'g') AS v
           FROM unnest(string_to_array(COALESCE((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_piva_escluse'), ''), ',')) AS x
         ) q WHERE q.v <> ''),
        ARRAY[]::text[]
      ) AS pive
  ),
  cli AS MATERIALIZED (
    SELECT
      c.id, c.store_id,
      regexp_replace(COALESCE(c.partita_iva, ''), '\D', '', 'g') AS piva,
      COALESCE(c.fido_gestionale, 0)::numeric AS fa,
      GREATEST(0, COALESCE(c.totale_rischio, 0))::numeric AS esp,
      GREATEST(0, COALESCE(c.doc_da_evadere, 0))::numeric AS ord,
      COALESCE(c.doc_da_fatturare, 0)::numeric AS ddt,
      g.giorni_totali AS gg,
      COALESCE(g.pagamento_immediato, false) AS immediato,
      COALESCE(c.num_insoluti, 0)::int AS insoluti,
      COALESCE(c.bloccato, false) AS bloccato,
      COALESCE(c.in_gestione_legale, false) AS legale,
      date_trunc('month', c.ultima_data_fatturazione)::date AS ult_gamma,
      (c.created_at::date > cfg.data_carico
       AND c.created_at >= (CURRENT_DATE - make_interval(months => cfg.m_nuovo::int))) AS creato_nuovo,
      (SELECT rf.importo_approvato FROM public.richieste_fido rf
        WHERE rf.cliente_id = c.id AND rf.stato::text = 'approvata'
          AND rf.tipo::text IN ('nuovo','nuovo_fido')
          AND COALESCE(rf.data_approvazione, rf.updated_at) >= (CURRENT_DATE - make_interval(months => cfg.m_nuovo::int))
        ORDER BY COALESCE(rf.data_approvazione, rf.updated_at) DESC LIMIT 1) AS rich_imp,
      EXISTS (SELECT 1 FROM public.richieste_fido rf
        WHERE rf.cliente_id = c.id AND rf.stato::text = 'approvata'
          AND rf.tipo::text IN ('nuovo','nuovo_fido')
          AND COALESCE(rf.data_approvazione, rf.updated_at) >= (CURRENT_DATE - make_interval(months => cfg.m_nuovo::int))) AS rich_recente,
      (SELECT array_agg(n::numeric)
         FROM regexp_split_to_table(
                (regexp_match(COALESCE(NULLIF(trim(c.condizione_pagamento_desc), ''), cp.descrizione), '(\d+(?:\s*/\s*\d+)+)'))[1],
                '\s*/\s*') AS n) AS rate
    FROM public.clienti c
    CROSS JOIN cfg
    LEFT JOIN public.codici_pagamento cp ON cp.cod = c.condizione_pagamento_cod
    LEFT JOIN public.codici_pagamento_giorni g
      ON lower(trim(g.descrizione)) = lower(trim(COALESCE(NULLIF(trim(c.condizione_pagamento_desc), ''), cp.descrizione)))
    WHERE (cfg.sid IS NULL OR c.store_id = cfg.sid)
      AND (_cliente_ids IS NULL OR c.id = ANY(_cliente_ids))
  ),
  fm AS MATERIALIZED (
    SELECT m.cliente_id, m.mese, COALESCE(m.importo_lordo, 0)::numeric AS imp
    FROM public.fatturato_mensile_cliente m
    WHERE m.cliente_id IN (SELECT id FROM cli)
  ),
  primo AS (
    SELECT cliente_id, min(mese) AS primo_mese, max(mese) AS ultimo_mese FROM fm WHERE imp > 0 GROUP BY cliente_id
  ),
  -- 12 mesi chiusi prima del mese corrente, con il loro indice stagionale
  mesi AS (
    SELECT (cfg.m0 - make_interval(months => k))::date AS mese,
           cfg.idx[EXTRACT(month FROM (cfg.m0 - make_interval(months => k)))::int] AS i
    FROM cfg, generate_series(1, 12) AS k
  ),
  chiusi AS (
    SELECT c.id AS cliente_id, ms.mese, ms.i, COALESCE(f.imp, 0) AS imp, p.primo_mese
    FROM cli c
    CROSS JOIN mesi ms
    LEFT JOIN primo p ON p.cliente_id = c.id
    LEFT JOIN fm f ON f.cliente_id = c.id AND f.mese = ms.mese
  ),
  stor AS (
    SELECT cliente_id,
      sum(imp) FILTER (WHERE mese >= primo_mese) / NULLIF(sum(i) FILTER (WHERE mese >= primo_mese), 0) AS storico,
      sum(imp) AS fatt12
    FROM chiusi GROUP BY cliente_id
  ),
  rec AS (
    SELECT cliente_id, imp / i AS v,
      row_number() OVER (PARTITION BY cliente_id ORDER BY mese DESC) AS rn
    FROM chiusi WHERE imp > 0
  ),
  corr AS (
    SELECT c.id AS cliente_id,
      COALESCE(f.imp, 0) AS fatt_corr,
      (COALESCE(f.imp, 0) + c.ddt) * cfg.gg_mese / cfg.gg_trascorsi
        / cfg.idx[EXTRACT(month FROM cfg.m0)::int] AS stima
    FROM cli c CROSS JOIN cfg
    LEFT JOIN fm f ON f.cliente_id = c.id AND f.mese = cfg.m0
  ),
  tend AS (
    SELECT x.cliente_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY x.v)::numeric AS tendenza
    FROM (
      SELECT cliente_id, v FROM rec WHERE rn <= 3
      UNION ALL
      -- FM55 fetta 1b: il mese in corso entra nella mediana solo dal giorno gmin
      SELECT k.cliente_id, k.stima FROM corr k, cfg WHERE cfg.gg_trascorsi >= cfg.gmin
    ) x
    WHERE EXISTS (SELECT 1 FROM rec r WHERE r.cliente_id = x.cliente_id)
       OR EXISTS (SELECT 1 FROM corr k, cfg WHERE k.cliente_id = x.cliente_id AND k.stima > 0 AND cfg.gg_trascorsi >= cfg.gmin)
    GROUP BY x.cliente_id
  ),
  -- profilo di pagamento su scadenze dal 2022, senza ANTICIPO
  pag AS (
    SELECT s.cliente_id,
      sum(s.importo_pagato * w * GREATEST(s.data_pagamento_effettiva - s.data_scadenza, 0)) / NULLIF(sum(s.importo_pagato * w), 0) AS ritardo_medio,
      sum(s.importo_pagato * w) FILTER (WHERE s.data_pagamento_effettiva - s.data_scadenza > (SELECT toll FROM cfg))
        / NULLIF(sum(s.importo_pagato * w), 0) AS quota_ritardo,
      COALESCE(sum(s.importo_pagato) FILTER (WHERE s.data_pagamento_effettiva >= CURRENT_DATE - interval '12 months'), 0) AS pagato12
    FROM (
      SELECT s.*, CASE WHEN s.data_scadenza >= CURRENT_DATE - interval '12 months' THEN 2 ELSE 1 END AS w
      FROM public.scadenze s
      WHERE s.cliente_id IN (SELECT id FROM cli)
        AND s.data_scadenza >= DATE '2022-01-01'
        AND NOT public.is_anticipo(s.numero_documento)
        AND s.data_pagamento_effettiva IS NOT NULL
        AND COALESCE(s.importo_pagato, 0) > 0
    ) s
    GROUP BY s.cliente_id
  ),
  -- scaduto fermo: stesso criterio di get_fido_teorico (fasce 60-90 / 90-120 / oltre 120)
  fermo AS (
    SELECT s.cliente_id, sum(s.importo_scadenza) AS imp
    FROM public.scadenze s
    WHERE s.cliente_id IN (SELECT id FROM cli)
      AND s.stato_contabile = 'Aperta'
      AND COALESCE(s.importo_scadenza, 0) > 0
      AND NOT public.is_anticipo(s.numero_documento)
      AND s.tempi_scadenza ILIKE 'Scaduto%'
      AND (s.tempi_scadenza ILIKE '%60-90%' OR s.tempi_scadenza ILIKE '%90-120%' OR s.tempi_scadenza ILIKE '%oltre 120%')
    GROUP BY s.cliente_id
  ),
  -- scaduto canonico dell'app: come scadenziario_clienti_base (calcola_scaduto su righe 'scaduto')
  scad AS (
    SELECT x.cliente_id,
      public.calcola_scaduto(
        COALESCE(sum(x.importo_scadenza) FILTER (WHERE NOT x.ant), 0),
        COALESCE(sum(x.importo_scadenza) FILTER (WHERE x.ant), 0)) AS scaduto
    FROM (
      SELECT s.cliente_id, s.importo_scadenza, public.is_anticipo(s.numero_documento) AS ant
      FROM public.scadenze s
      WHERE s.cliente_id IN (SELECT id FROM cli)
        AND (s.stato_contabile = 'Aperta' OR s.data_pagamento_effettiva IS NULL)
        AND public.categoria_scadenza_riga(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, CURRENT_DATE, s.tempi_scadenza_key, s.importo_pagato) = 'scaduto'
    ) x
    GROUP BY x.cliente_id
  ),
  b AS (
    SELECT c.*, cfg.*,
      st.storico, t.tendenza, COALESCE(st.fatt12, 0) AS fatt12, k.fatt_corr,
      p.primo_mese,
      -- FM55: ultimo acquisto = più recente tra fatturato mensile e ultima fatturazione Gamma
      GREATEST(p.ultimo_mese, c.ult_gamma) AS ult_acq,
      (c.creato_nuovo OR c.rich_recente) AS nuovo,
      -- fido concesso: fido gestionale; se 0, importo della richiesta approvata recente
      CASE WHEN c.fa > 0 THEN c.fa ELSE COALESCE(c.rich_imp, 0) END AS concesso,
      COALESCE(fe.imp, 0) AS fermo_imp,
      COALESCE(sc.scaduto, 0) AS scaduto,
      COALESCE(so.scaduto_oltre, 0) AS sc_oltre, COALESCE(so.giorni_max, 0) AS sc_gmax, COALESCE(so.pagato_12m, 0) AS sc_pag12,
      pg.ritardo_medio, pg.quota_ritardo, COALESCE(pg.pagato12, 0) AS pagato12,
      CASE WHEN c.gg IS NULL THEN NULL
           WHEN c.rate IS NOT NULL AND array_length(c.rate, 1) >= 2
             THEN c.gg - ((SELECT max(r) FROM unnest(c.rate) r) - (SELECT avg(r) FROM unnest(c.rate) r))
           ELSE c.gg::numeric END AS ciclo
    FROM cli c CROSS JOIN cfg
    LEFT JOIN stor st ON st.cliente_id = c.id
    LEFT JOIN tend t ON t.cliente_id = c.id
    LEFT JOIN corr k ON k.cliente_id = c.id
    LEFT JOIN primo p ON p.cliente_id = c.id
    LEFT JOIN fermo fe ON fe.cliente_id = c.id
    LEFT JOIN scad sc ON sc.cliente_id = c.id
    LEFT JOIN public.scaduto_oltre_giorni(_cliente_ids) so ON so.cliente_id = c.id
    LEFT JOIN pag pg ON pg.cliente_id = c.id
  ),
  b2 AS (
    SELECT b.*,
      COALESCE((b.storico + b.tendenza) / 2, b.storico, b.tendenza, 0) AS acq,
      (SELECT COALESCE(sum(b.idx[EXTRACT(month FROM (b.m0 + make_interval(months => k)))::int]
                 * LEAST(1, GREATEST(0, COALESCE(b.ciclo, 0) / 30.0 - k))), 0)
         FROM generate_series(0, 7) AS k) AS mesi_st,
      CASE
        WHEN b.fatt12 <= 0 AND b.fatt_corr <= 0 THEN
          CASE
            WHEN b.ult_acq IS NULL THEN CASE WHEN b.nuovo THEN 'nuovo_in_attesa' ELSE 'mai_acquistato' END
            WHEN ((EXTRACT(year FROM b.m0) - EXTRACT(year FROM b.ult_acq)) * 12 + EXTRACT(month FROM b.m0) - EXTRACT(month FROM b.ult_acq)) <= b.m_dorm THEN 'dormiente'
            ELSE 'perso'
          END
        WHEN b.fermo_imp > b.soglia THEN 'patologico_scaduto_fermo'
        WHEN b.insoluti >= 2 THEN 'patologico_insoluti_ripetuti'
        WHEN b.insoluti = 1 AND b.scaduto > b.soglia AND b.scaduto >= b.q_ins * b.pagato12 THEN 'patologico_insoluto_pesante'
        WHEN b.insoluti = 1 THEN 'insoluto_isolato'
        WHEN COALESCE(b.ritardo_medio, 0) <= b.toll THEN 'puntuale'
        WHEN COALESCE(b.quota_ritardo, 0) < b.q_occ THEN 'ritardo_occasionale'
        WHEN b.ritardo_medio <= 45 THEN 'ritardo_abituale'
        ELSE 'ritardo_abituale_grave'
      END AS prof,
      CASE
        WHEN b.store_id = '3c57ae39-1f3a-4085-96ef-2f2d2c4c8221'::uuid AND b.escludi_sede THEN 'sede_esclusa'
        WHEN b.piva <> '' AND b.piva = ANY(b.pive) THEN 'esclusa_gruppo'
        WHEN b.bloccato THEN 'cliente_bloccato'
        WHEN b.legale THEN 'gestione_legale'
        WHEN b.sc_oltre > b.sc_imp AND (b.sc_pag12 <= 0 OR b.sc_oltre > b.sc_quota * b.sc_pag12) THEN 'scaduto_non_incassato'
        WHEN b.gg IS NULL THEN 'condizione_mancante'
        WHEN b.immediato THEN 'pagamento_immediato'
        ELSE 'calcolo'
      END AS reg
    FROM b
  ),
  b3 AS (
    SELECT b2.*,
      CASE b2.prof
        WHEN 'dormiente' THEN 1
        WHEN 'perso' THEN 1
        WHEN 'mai_acquistato' THEN 1
        WHEN 'nuovo_in_attesa' THEN 1
        WHEN 'patologico_scaduto_fermo' THEN b2.c_fermo
        WHEN 'patologico_insoluti_ripetuti' THEN b2.c_rip
        WHEN 'patologico_insoluto_pesante' THEN b2.c_pes
        WHEN 'insoluto_isolato' THEN b2.c_iso
        WHEN 'ritardo_abituale' THEN b2.c_abit
        WHEN 'ritardo_abituale_grave' THEN b2.c_grave
        ELSE 1
      END::numeric AS coef,
      (b2.prof LIKE 'patologico%') AS patol
    FROM b2
  ),
  b4 AS (
    SELECT b3.*,
      CASE WHEN b3.prof = 'dormiente' THEN public.arrotonda_fido_v2(b3.fido_dorm)
           WHEN b3.prof IN ('perso','mai_acquistato') THEN 0::numeric
           WHEN b3.prof = 'nuovo_in_attesa' THEN GREATEST(b3.concesso, 0)
           ELSE public.arrotonda_fido_v2(b3.acq * b3.mesi_st * b3.coef) END AS base_v,
      CASE WHEN b3.patol THEN b3.esp ELSE b3.esp + b3.ord END AS fabb
    FROM b3
  ),
  b5 AS (
    SELECT b4.*,
      CASE b4.reg
        WHEN 'sede_esclusa' THEN b4.fa
        WHEN 'esclusa_gruppo' THEN b4.fa
        WHEN 'calcolo' THEN
          CASE WHEN b4.prof IN ('puntuale','ritardo_occasionale','ritardo_abituale','ritardo_abituale_grave','insoluto_isolato') THEN mt.fp
            WHEN b4.prof = 'nuovo_in_attesa'
            THEN CASE WHEN b4.fabb > b4.base_v THEN public.arrotonda_fido_v2(b4.fabb) ELSE b4.base_v END
            ELSE public.arrotonda_fido_v2(GREATEST(b4.base_v, b4.fabb)) END
        ELSE 0::numeric
      END AS fp,
      -- FM55 fetta 1b: "paga in circa" usa i giorni di pagamento, non i mesi stagionali
      round(COALESCE(b4.ciclo, 0) / 30.0 * 2) / 2 AS mesi_mezzi,
      (b4.reg = 'calcolo' AND b4.prof IN ('puntuale','ritardo_occasionale','ritardo_abituale','ritardo_abituale_grave','insoluto_isolato')) AS con_mt,
      mt.margine AS mt_margine, mt.ordini_fuori AS mt_fuori, mt.valore AS mt_valore, mt.tetto AS mt_tetto
    FROM b4
    LEFT JOIN LATERAL public.fido_v2_margine_tetto(b4.base_v, b4.esp, b4.ord, round(b4.acq, 2), b4.sc_oltre) mt ON true
  )
  SELECT
    r.id,
    round(r.storico, 2), round(r.tendenza, 2), round(r.acq, 2),
    r.ciclo, round(r.mesi_st, 3), r.prof, r.coef,
    r.base_v, r.esp, r.ord, r.fabb, r.fp, r.fa,
    CASE WHEN r.fa > 0 THEN round((r.esp + r.ord) / r.fa, 4) END,
    r.reg,
    ((r.primo_mese IS NOT NULL AND r.primo_mese >= (r.m0 - interval '2 months')::date) OR r.prof = 'nuovo_in_attesa' OR r.reg = 'scaduto_non_incassato'),
    CASE r.reg
      WHEN 'sede_esclusa' THEN 'Sede esclusa dal calcolo: mantiene il fido attuale.'
      WHEN 'esclusa_gruppo' THEN 'Società del gruppo esclusa dal calcolo: mantiene il fido attuale.'
      WHEN 'cliente_bloccato' THEN 'Cliente bloccato: nessun fido proposto.'
      WHEN 'gestione_legale' THEN 'Cliente in gestione legale: nessun fido proposto.'
      WHEN 'scaduto_non_incassato' THEN 'Cliente con scaduto non incassato: '
           || translate(rtrim(to_char(r.sc_oltre, 'FM999,999,990.99'), '.'), ',.', '.,')
           || ' € scaduti oltre le soglie (' || r.sc_gg_cfg || ' giorni; RiBa ' || r.sc_gg_riba || ' giorni) (fino a ' || r.sc_gmax || ' giorni), '
           || CASE WHEN r.sc_pag12 > 0 THEN 'pari al ' || round(r.sc_oltre / r.sc_pag12 * 100)::int || '% di quanto pagato in 12 mesi'
                   ELSE 'nessun pagamento negli ultimi 12 mesi' END
           || '. Fido a zero finché non rientra.'
           || COALESCE(' ' || NULLIF(public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, NOT r.patol), '') || '.', '')
      WHEN 'condizione_mancante' THEN 'Condizione di pagamento non riconosciuta: impossibile calcolare il fido.'
      WHEN 'pagamento_immediato' THEN 'Pagamento immediato: non serve un fido.'
      ELSE
        CASE r.prof
          WHEN 'dormiente' THEN 'Non compra da '
               || ((EXTRACT(year FROM r.m0) - EXTRACT(year FROM r.ult_acq)) * 12 + EXTRACT(month FROM r.m0) - EXTRACT(month FROM r.ult_acq))::int
               || ' mesi: fido minimo di ' || replace(to_char(r.base_v, 'FM999,999,999'), ',', '.') || ' € per servirlo se torna.'
          WHEN 'perso' THEN 'Ultimo acquisto ' || to_char(r.ult_acq, 'MM/YYYY') || ', oltre '
               || r.m_dorm::int || ' mesi fa: nessun fido. Se torna serve una nuova richiesta fido; intanto pagamento in contanti.'
               || CASE WHEN r.fp > 0 THEN ' ' || public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, NOT r.patol) || ': il fido copre questi impegni.' ELSE '' END
          WHEN 'mai_acquistato' THEN 'Nessun acquisto registrato: nessun fido.'
          WHEN 'nuovo_in_attesa' THEN 'Cliente nuovo in attesa del primo acquisto: si mantiene il fido concesso di '
               || translate(rtrim(to_char(r.base_v, 'FM999,999,990.99'), '.'), ',.', '.,') || ' €. Da verificare.'
               || CASE WHEN r.fp > r.base_v THEN ' ' || public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, NOT r.patol) || ': il fido copre questi impegni.' ELSE '' END
          ELSE (
            'Compra in media ' || replace(to_char(round(r.acq), 'FM999,999,999'), ',', '.')
               || ' € al mese e paga in circa '
               || CASE WHEN r.mesi_mezzi < 1 THEN round(r.ciclo)::int || ' giorni'
                       WHEN r.mesi_mezzi = floor(r.mesi_mezzi) THEN floor(r.mesi_mezzi)::int || CASE WHEN r.mesi_mezzi = 1 THEN ' mese' ELSE ' mesi' END
                       ELSE floor(r.mesi_mezzi)::int || CASE WHEN floor(r.mesi_mezzi) = 1 THEN ' mese' ELSE ' mesi' END || ' e mezzo' END
               || ': la base è ' || replace(to_char(r.base_v, 'FM999,999,999'), ',', '.') || ' €. '
            || COALESCE(NULLIF(public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, NOT r.patol), ''), 'Nessun impegno aperto')
            || ': per servirlo servono ' || replace(to_char(r.fp, 'FM999,999,999'), ',', '.') || ' €.'
            || CASE r.prof
                 WHEN 'patologico_scaduto_fermo' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' per scaduto fermo oltre 60 giorni; gli ordini aperti non sono considerati.'
                 WHEN 'patologico_insoluti_ripetuti' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' per insoluti ripetuti; gli ordini aperti non sono considerati.'
                 WHEN 'patologico_insoluto_pesante' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' per un insoluto con scaduto rilevante; gli ordini aperti non sono considerati.'
                 WHEN 'insoluto_isolato' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' per un insoluto in corso.'
                 WHEN 'ritardo_abituale' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' perché paga spesso in ritardo.'
                 WHEN 'ritardo_abituale_grave' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' perché paga spesso con ritardi lunghi.'
                 ELSE '' END
            || CASE WHEN r.con_mt AND r.mt_margine THEN ' Margine 20% per stare sotto l''80% del fido.' ELSE '' END
            || CASE WHEN r.con_mt AND r.mt_fuori > 0 THEN ' Ordini oltre un mese di acquisti ('
                 || replace(to_char(round(r.mt_fuori), 'FM999,999,999'), ',', '.') || ' €) non conteggiati: da autorizzare.' ELSE '' END
            || CASE WHEN r.con_mt AND r.mt_valore > r.mt_tetto THEN ' Tetto 1,5 volte la base ('
                 || replace(to_char(round(r.mt_tetto), 'FM999,999,999'), ',', '.') || ' €): oltre decide una persona.' ELSE '' END
          ) END
    END
  FROM b5 r;
$function$;

CREATE OR REPLACE FUNCTION public.ricalcola_fido_teorico_blocco(_dopo_id uuid, _dimensione integer DEFAULT 500)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ids uuid[];
BEGIN
 IF current_setting('role', true) <> 'service_role'
 AND session_user NOT IN ('postgres', 'supabase_admin')
 AND NOT public.has_role(auth.uid(), 'amministratore')
 AND NOT public.has_role(auth.uid(), 'direzione') THEN
 RAISE EXCEPTION 'Operazione non consentita';
 END IF;
 SELECT array_agg(id ORDER BY id) INTO v_ids FROM (
 SELECT id FROM public.clienti WHERE (_dopo_id IS NULL OR id > _dopo_id) ORDER BY id LIMIT _dimensione
 ) s;
 IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN RETURN NULL; END IF;
 INSERT INTO public.fido_teorico_cliente (
 cliente_id, fatturato_rolling, ritmo_mensile, giorni, giorni_mancanti,
 fido_base, fido_base_lordo, ddt_da_fatturare, giorni_oltre_accordo,
 profilo_pagamento, coefficiente, fido_proposto, fido_proposto_senza_coefficiente,
 fido_attuale, scostamento, regola_applicata, sede_cinisello, richiede_verifica,
 nota_proposta, fido_teorico_puro, pavimento_applicato, esposizione_corrente, calcolato_at
 ) SELECT
 t.cliente_id, t.fatturato_rolling, t.ritmo_mensile, t.giorni, t.giorni_mancanti,
 t.fido_base, t.fido_base_lordo, t.ddt_da_fatturare, t.giorni_oltre_accordo,
 t.profilo_pagamento, t.coefficiente, t.fido_proposto, t.fido_proposto_senza_coefficiente,
 t.fido_attuale, t.scostamento, t.regola_applicata, t.sede_cinisello, t.richiede_verifica,
 t.nota_proposta, t.fido_teorico_puro, t.pavimento_applicato, t.esposizione_corrente, now()
 FROM public.get_fido_teorico(v_ids, false) t
 ON CONFLICT (cliente_id) DO UPDATE SET
 fatturato_rolling=EXCLUDED.fatturato_rolling, ritmo_mensile=EXCLUDED.ritmo_mensile,
 giorni=EXCLUDED.giorni, giorni_mancanti=EXCLUDED.giorni_mancanti,
 fido_base=EXCLUDED.fido_base, fido_base_lordo=EXCLUDED.fido_base_lordo,
 ddt_da_fatturare=EXCLUDED.ddt_da_fatturare, giorni_oltre_accordo=EXCLUDED.giorni_oltre_accordo,
 profilo_pagamento=EXCLUDED.profilo_pagamento, coefficiente=EXCLUDED.coefficiente,
 fido_proposto=EXCLUDED.fido_proposto, fido_proposto_senza_coefficiente=EXCLUDED.fido_proposto_senza_coefficiente,
 fido_attuale=EXCLUDED.fido_attuale, scostamento=EXCLUDED.scostamento,
 regola_applicata=EXCLUDED.regola_applicata, sede_cinisello=EXCLUDED.sede_cinisello,
 richiede_verifica=EXCLUDED.richiede_verifica, nota_proposta=EXCLUDED.nota_proposta,
 fido_teorico_puro=EXCLUDED.fido_teorico_puro, pavimento_applicato=EXCLUDED.pavimento_applicato,
 esposizione_corrente=EXCLUDED.esposizione_corrente, calcolato_at=now();
 UPDATE public.fido_teorico_cliente f SET semaforo_stadio=s.stadio,semaforo_motivo=s.motivo,semaforo_numero=s.numero
 FROM public.calcola_semaforo_affidabilita_batch(v_ids) s WHERE f.cliente_id=s.cliente_id;
 INSERT INTO public.fido_teorico_v2 (
 cliente_id,acquisto_storico,acquisto_tendenza,acquisto_mensile,ciclo_gg,
 mesi_stagionali,profilo,coefficiente,base,esposizione,ordini_aperti,fabbisogno,
 fido_proposto,fido_attuale,consumo_perc,regola,da_verificare,spiegazione,calcolato_at
 ) SELECT v.cliente_id,v.acquisto_storico,v.acquisto_tendenza,v.acquisto_mensile,v.ciclo_gg,
 v.mesi_stagionali,v.profilo,v.coefficiente,v.base,v.esposizione,v.ordini_aperti,v.fabbisogno,
 v.fido_proposto,v.fido_attuale,v.consumo_perc,v.regola,v.da_verificare,v.spiegazione,now()
 FROM public.get_fido_teorico_v2(v_ids) v
 ON CONFLICT (cliente_id) DO UPDATE SET
 acquisto_storico=EXCLUDED.acquisto_storico,acquisto_tendenza=EXCLUDED.acquisto_tendenza,
 acquisto_mensile=EXCLUDED.acquisto_mensile,ciclo_gg=EXCLUDED.ciclo_gg,
 mesi_stagionali=EXCLUDED.mesi_stagionali,profilo=EXCLUDED.profilo,coefficiente=EXCLUDED.coefficiente,
 base=EXCLUDED.base,esposizione=EXCLUDED.esposizione,ordini_aperti=EXCLUDED.ordini_aperti,
 fabbisogno=EXCLUDED.fabbisogno,fido_proposto=EXCLUDED.fido_proposto,fido_attuale=EXCLUDED.fido_attuale,
 consumo_perc=EXCLUDED.consumo_perc,regola=EXCLUDED.regola,da_verificare=EXCLUDED.da_verificare,
 spiegazione=EXCLUDED.spiegazione,calcolato_at=now();
 -- FM55: dopo gli upsert v1 e v2, i valori pubblicati per tutti sono quelli della v2.
 -- Le colonne non mappate (inclusi semaforo e dati storici v1) restano invariate.
 UPDATE public.fido_teorico_cliente f SET
 fido_proposto=v.fido_proposto,fido_attuale=v.fido_attuale,
 scostamento=v.fido_proposto-v.fido_attuale,esposizione_corrente=v.esposizione,
 coefficiente=v.coefficiente,richiede_verifica=v.da_verificare,nota_proposta=v.spiegazione,
 profilo_pagamento=CASE WHEN v.profilo LIKE 'patologico%' THEN 'patologico' ELSE 'sano' END,
 ritmo_mensile=v.acquisto_mensile,giorni=round(v.ciclo_gg)::integer,
 fido_base=v.base,fido_base_lordo=v.base,fido_teorico_puro=v.base,
 fido_proposto_senza_coefficiente=public.arrotonda_fido_v2(GREATEST(v.acquisto_mensile*v.mesi_stagionali,v.fabbisogno)),
 pavimento_applicato=false,
 regola_applicata=CASE WHEN v.regola IN ('fascia_500','fascia_5000') THEN 'calcolo' ELSE v.regola END,
 acquisto_storico=v.acquisto_storico,acquisto_tendenza=v.acquisto_tendenza,
 acquisto_mensile=v.acquisto_mensile,ciclo_gg=v.ciclo_gg,mesi_stagionali=v.mesi_stagionali,
 profilo=v.profilo,base=v.base,ordini_aperti=v.ordini_aperti,fabbisogno=v.fabbisogno,
 consumo_perc=v.consumo_perc,spiegazione=v.spiegazione
 FROM public.fido_teorico_v2 v WHERE f.cliente_id=v.cliente_id AND f.cliente_id=ANY(v_ids);
 -- FM55: scaduto oltre N giorni (fonte unica scaduto_oltre_giorni), 0 se nessuno.
 UPDATE public.fido_teorico_cliente f SET
 scaduto_oltre=GREATEST(COALESCE(s.scaduto_oltre,0),0), scaduto_oltre_giorni=COALESCE(s.giorni_max,0), pagato_12m=GREATEST(COALESCE(s.pagato_12m,0),0)
 FROM unnest(v_ids) u(id) LEFT JOIN public.scaduto_oltre_giorni(v_ids) s ON s.cliente_id=u.id
 WHERE f.cliente_id=u.id;
 -- FM55 fetta 3A: ordini fuori giro, tetto e valore prima del tetto (fonte unica fido_v2_margine_tetto),
 -- solo per regola calcolo e profili di comportamento; altrimenti 0 / NULL.
 UPDATE public.fido_teorico_cliente f SET
 ordini_fuori=COALESCE(mt.ordini_fuori,0), tetto=mt.tetto, valore_senza_tetto=mt.valore
 FROM public.fido_teorico_cliente f2
 LEFT JOIN LATERAL public.fido_v2_margine_tetto(f2.base,f2.esposizione_corrente,f2.ordini_aperti,f2.acquisto_mensile,f2.scaduto_oltre) mt
   ON f2.regola_applicata='calcolo' AND f2.profilo IN ('puntuale','ritardo_occasionale','ritardo_abituale','ritardo_abituale_grave','insoluto_isolato')
 WHERE f.cliente_id=f2.cliente_id AND f.cliente_id=ANY(v_ids);
 -- FM55: segnalazioni (fonte unica segnalazioni_fido) sulle colonne appena pubblicate.
 UPDATE public.fido_teorico_cliente f SET
 segnalazioni=public.segnalazioni_fido(f.regola_applicata,f.base,f.fabbisogno,f.ordini_aperti,f.fido_attuale,f.scaduto_oltre,f.pagato_12m,f.ordini_fuori,f.valore_senza_tetto,f.tetto)
 WHERE f.cliente_id=ANY(v_ids);
 RETURN v_ids[array_length(v_ids,1)];
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid, integer) TO authenticated, service_role;