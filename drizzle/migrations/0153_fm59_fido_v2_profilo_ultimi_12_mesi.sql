CREATE OR REPLACE FUNCTION public.get_fido_teorico_v2(_cliente_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(cliente_id uuid, acquisto_storico numeric, acquisto_tendenza numeric, acquisto_mensile numeric, ciclo_gg numeric, mesi_stagionali numeric, profilo text, coefficiente numeric, base numeric, esposizione numeric, ordini_aperti numeric, fabbisogno numeric, fido_proposto numeric, fido_attuale numeric, consumo_perc numeric, regola text, da_verificare boolean, spiegazione text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cfg AS MATERIALIZED (
    SELECT
      public.store_id_effettivo(NULL) AS sid,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_margine_soglia'), ',', '.')), '')::numeric, 0.80) AS ms_picco,
      date_trunc('month', CURRENT_DATE)::date AS m0,
      COALESCE(
        (SELECT array_agg(trim(x)::numeric / 100 ORDER BY o)
           FROM unnest(string_to_array((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_stagionalita'), ',')) WITH ORDINALITY AS u(x, o)
          HAVING count(*) = 12),
        ARRAY[0.77,0.93,1.07,1.16,1.08,1.03,1.13,0.37,1.00,1.24,1.17,1.07]::numeric[]
      ) AS idx,
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
  picco AS MATERIALIZED (
    SELECT * FROM public.esposizione_picco_cliente(ARRAY(SELECT id FROM cli), 30)
  ),
  fm AS MATERIALIZED (
    SELECT m.cliente_id, m.mese, COALESCE(m.importo_lordo, 0)::numeric AS imp
    FROM public.fatturato_mensile_cliente m
    WHERE m.cliente_id IN (SELECT id FROM cli)
  ),
  primo AS (
    -- I DDT sono acquisti del mese chiuso più recente, anche senza fatture.
    SELECT cliente_id, min(mese) AS primo_mese, max(mese) AS ultimo_mese
    FROM (SELECT cliente_id, mese FROM fm WHERE imp > 0
          UNION ALL SELECT c.id, (cfg.m0 - interval '1 month')::date FROM cli c CROSS JOIN cfg WHERE c.ddt > 0) a
    GROUP BY cliente_id
  ),
  -- 12 mesi chiusi prima del mese corrente, con il loro indice stagionale
  mesi AS (
    SELECT (cfg.m0 - make_interval(months => k))::date AS mese,
           cfg.idx[EXTRACT(month FROM (cfg.m0 - make_interval(months => k)))::int] AS i
    FROM cfg, generate_series(1, 12) AS k
  ),
  chiusi AS (
    SELECT c.id AS cliente_id, ms.mese, ms.i,
      COALESCE(f.imp, 0) + CASE WHEN ms.mese = (cfg.m0 - interval '1 month')::date THEN c.ddt ELSE 0 END AS imp, p.primo_mese
    FROM cli c
    CROSS JOIN mesi ms CROSS JOIN cfg
    LEFT JOIN primo p ON p.cliente_id = c.id
    LEFT JOIN fm f ON f.cliente_id = c.id AND f.mese = ms.mese
  ),
  stor AS (
    SELECT cliente_id,
      sum(imp) FILTER (WHERE mese >= primo_mese) / NULLIF(sum(i) FILTER (WHERE mese >= primo_mese), 0) AS storico,
      sum(imp) AS fatt12
    FROM chiusi GROUP BY cliente_id
  ),
  tend AS (
    -- Ultimi tre mesi DI CALENDARIO: gli zeri restano nel denominatore.
    SELECT ch.cliente_id, sum(ch.imp) / NULLIF(sum(ch.i), 0) AS tendenza
    FROM chiusi ch CROSS JOIN cfg
    WHERE ch.mese >= (cfg.m0 - interval '3 months')::date AND ch.mese >= ch.primo_mese
    GROUP BY ch.cliente_id
  ),
  ciclo_fatture AS (
    SELECT s.cliente_id,
      sum(s.dilazione_teorica::numeric * s.importo_scadenza) / NULLIF(sum(s.importo_scadenza), 0) AS ciclo
    FROM public.scadenze s
    WHERE s.cliente_id IN (SELECT id FROM cli)
      AND s.data_documento >= CURRENT_DATE - interval '12 months'
      AND s.data_documento <= CURRENT_DATE
      AND NOT public.is_anticipo(s.numero_documento)
      AND s.importo_scadenza > 0 AND s.dilazione_teorica > 0
    GROUP BY s.cliente_id
  ),
  -- profilo di pagamento su scadenze dal 2022, senza ANTICIPO (FM59: ultimi 12 mesi; storico pesato solo senza pagamenti negli ultimi 12 mesi)
  pag AS (
    SELECT s.cliente_id,
      CASE WHEN count(*) FILTER (WHERE s.u12) > 0
        THEN sum(s.importo_pagato * GREATEST(s.data_pagamento_effettiva - s.data_scadenza, 0)) FILTER (WHERE s.u12) / NULLIF(sum(s.importo_pagato) FILTER (WHERE s.u12), 0)
        ELSE sum(s.importo_pagato * w * GREATEST(s.data_pagamento_effettiva - s.data_scadenza, 0)) / NULLIF(sum(s.importo_pagato * w), 0)
      END AS ritardo_medio,
      CASE WHEN count(*) FILTER (WHERE s.u12) > 0
        THEN COALESCE(sum(s.importo_pagato) FILTER (WHERE s.u12 AND s.data_pagamento_effettiva - s.data_scadenza > (SELECT toll FROM cfg)), 0)
          / NULLIF(sum(s.importo_pagato) FILTER (WHERE s.u12), 0)
        ELSE sum(s.importo_pagato * w) FILTER (WHERE s.data_pagamento_effettiva - s.data_scadenza > (SELECT toll FROM cfg))
          / NULLIF(sum(s.importo_pagato * w), 0)
      END AS quota_ritardo,
      (count(*) FILTER (WHERE s.u12) = 0) AS usa_storico,
      COALESCE(sum(s.importo_pagato) FILTER (WHERE s.data_pagamento_effettiva >= CURRENT_DATE - interval '12 months'), 0) AS pagato12
    FROM (
      SELECT s.*, CASE WHEN s.data_scadenza >= CURRENT_DATE - interval '12 months' THEN 2 ELSE 1 END AS w,
        (s.data_scadenza >= CURRENT_DATE - interval '12 months') AS u12
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
  b AS MATERIALIZED (
    SELECT c.*, cfg.*,
      GREATEST(c.esp, c.esp + COALESCE(pc.aperto_picco - pc.aperto_oggi, 0)) AS esp_picco,
      st.storico, t.tendenza, COALESCE(st.fatt12, 0) AS fatt12,
      COALESCE((SELECT f.imp FROM fm f WHERE f.cliente_id = c.id AND f.mese = cfg.m0), 0) AS fatt_corr,
      p.primo_mese,
      -- FM55: ultimo acquisto = più recente tra fatturato mensile e ultima fatturazione Gamma
      GREATEST(p.ultimo_mese, c.ult_gamma) AS ult_acq,
      (c.creato_nuovo OR c.rich_recente) AS nuovo,
      -- fido concesso: fido gestionale; se 0, importo della richiesta approvata recente
      CASE WHEN c.fa > 0 THEN c.fa ELSE COALESCE(c.rich_imp, 0) END AS concesso,
      COALESCE(fe.imp, 0) AS fermo_imp,
      COALESCE(sc.scaduto, 0) AS scaduto,
      COALESCE(so.scaduto_oltre, 0) AS sc_oltre, COALESCE(so.giorni_max, 0) AS sc_gmax, COALESCE(so.pagato_12m, 0) AS sc_pag12,
      pg.ritardo_medio, pg.quota_ritardo, COALESCE(pg.usa_storico, true) AS usa_storico, COALESCE(pg.pagato12, 0) AS pagato12,
      COALESCE(cf.ciclo, CASE WHEN c.gg IS NULL THEN NULL
           WHEN c.rate IS NOT NULL AND array_length(c.rate, 1) >= 2
             THEN c.gg - ((SELECT max(r) FROM unnest(c.rate) r) - (SELECT avg(r) FROM unnest(c.rate) r))
           ELSE c.gg::numeric END) AS ciclo
    FROM cli c CROSS JOIN cfg
    LEFT JOIN picco pc ON pc.cliente_id = c.id
    LEFT JOIN stor st ON st.cliente_id = c.id
    LEFT JOIN tend t ON t.cliente_id = c.id
    LEFT JOIN ciclo_fatture cf ON cf.cliente_id = c.id
    LEFT JOIN primo p ON p.cliente_id = c.id
    LEFT JOIN fermo fe ON fe.cliente_id = c.id
    LEFT JOIN scad sc ON sc.cliente_id = c.id
    LEFT JOIN public.scaduto_oltre_giorni(_cliente_ids) so ON so.cliente_id = c.id
    LEFT JOIN pag pg ON pg.cliente_id = c.id
  ),
  b2 AS MATERIALIZED (
    SELECT b.*,
      COALESCE((2 * b.storico + b.tendenza) / 3, b.storico, b.tendenza, 0) AS acq,
      (SELECT COALESCE(sum(b.idx[EXTRACT(month FROM (b.m0 + make_interval(months => k)))::int]
                 * LEAST(1, GREATEST(0, COALESCE(b.ciclo, 0) / 30.0 - k))), 0)
         FROM generate_series(0, 7) AS k) AS mesi_st,
      CASE
        WHEN b.fatt12 <= 0 AND b.fatt_corr <= 0 AND b.ddt <= 0 THEN
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
        WHEN b.store_id = 'b07c4c61-12e4-4a87-8e79-bbb9c181ffe9'::uuid THEN 'sede_esclusa'
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
  b3 AS MATERIALIZED (
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
  b4 AS MATERIALIZED (
    SELECT b3.*,
      CASE WHEN b3.prof = 'dormiente' THEN public.arrotonda_fido_v2(b3.fido_dorm)
           WHEN b3.prof IN ('perso','mai_acquistato') THEN 0::numeric
           WHEN b3.prof = 'nuovo_in_attesa' THEN GREATEST(b3.concesso, 0)
           ELSE public.arrotonda_fido_v2(b3.acq * b3.mesi_st * b3.coef) END AS base_v,
      b3.esp AS fabb
    FROM b3
  ),
  b5_originale AS MATERIALIZED (
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
  ),
  freno AS MATERIALIZED (
    SELECT b5_originale.*,
      -- FM55 fetta 6: cliente NON attivo (public.cliente_attivo, gemello di isClienteAttivo) = fido teorico zero,
      -- dopo il freno; esclusi nuovo_in_attesa e clienti con ordini aperti; solo regola 'calcolo'.
      CASE WHEN na THEN 0::numeric
        WHEN con_mt AND fp < fa THEN
        LEAST(fa, GREATEST(fp, public.arrotonda_fido_v2(GREATEST(esp_picco, esp + ord) / NULLIF(ms_picco, 0))))
        ELSE fp END AS fp_frenato
    FROM (SELECT b5_originale.*,
            (reg = 'calcolo' AND prof <> 'nuovo_in_attesa' AND ord <= 0
              AND NOT public.cliente_attivo(ult_gamma, ddt)) AS na
          FROM b5_originale) b5_originale
  )
  SELECT
    r.id,
    round(r.storico, 2), round(r.tendenza, 2), round(r.acq, 2),
    r.ciclo, round(r.mesi_st, 3), r.prof, r.coef,
    r.base_v, r.esp, r.ord, r.fabb, r.fp_frenato, r.fa,
    CASE WHEN r.fa > 0 THEN round(r.esp / r.fa, 4) END,
    r.reg,
    ((r.primo_mese IS NOT NULL AND r.primo_mese >= (r.m0 - interval '2 months')::date) OR r.prof = 'nuovo_in_attesa' OR r.reg = 'scaduto_non_incassato'),
    CASE WHEN r.na THEN 'Cliente non attivo: nessuna fattura dal 01/01/' || public.cliente_attivo_cutoff_anno() || ', fido teorico zero.'
    ELSE CASE r.reg
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
           || COALESCE(' ' || NULLIF(public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, false), '') || '.', '')
      WHEN 'condizione_mancante' THEN 'Condizione di pagamento non riconosciuta: impossibile calcolare il fido.'
      WHEN 'pagamento_immediato' THEN 'Pagamento immediato: non serve un fido.'
      ELSE
        CASE r.prof
          WHEN 'dormiente' THEN 'Non compra da '
               || ((EXTRACT(year FROM r.m0) - EXTRACT(year FROM r.ult_acq)) * 12 + EXTRACT(month FROM r.m0) - EXTRACT(month FROM r.ult_acq))::int
               || ' mesi: fido minimo di ' || replace(to_char(r.base_v, 'FM999,999,999'), ',', '.') || ' € per servirlo se torna.'
          WHEN 'perso' THEN 'Ultimo acquisto ' || to_char(r.ult_acq, 'MM/YYYY') || ', oltre '
               || r.m_dorm::int || ' mesi fa: nessun fido. Se torna serve una nuova richiesta fido; intanto pagamento in contanti.'
               || CASE WHEN r.fp_frenato > 0 THEN ' ' || public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, false) || ': il fido copre quanto ci deve.' ELSE '' END
          WHEN 'mai_acquistato' THEN 'Nessun acquisto registrato: nessun fido.'
          WHEN 'nuovo_in_attesa' THEN 'Cliente nuovo in attesa del primo acquisto: si mantiene il fido concesso di '
               || translate(rtrim(to_char(r.base_v, 'FM999,999,990.99'), '.'), ',.', '.,') || ' €. Da verificare.'
               || CASE WHEN r.fp_frenato > r.base_v THEN ' ' || public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, false) || ': il fido copre quanto ci deve.' ELSE '' END
          ELSE (
            'Compra in media ' || replace(to_char(round(r.acq), 'FM999,999,999'), ',', '.')
               || ' € al mese e, dalle sue fatture, paga in circa ' || round(r.ciclo)::int || ' giorni'
               || ': il fido giusto per i suoi acquisti è ' || replace(to_char(r.base_v, 'FM999,999,999'), ',', '.') || ' €'
            || CASE WHEN r.prof IN ('patologico_scaduto_fermo','patologico_insoluti_ripetuti','patologico_insoluto_pesante','insoluto_isolato','ritardo_abituale','ritardo_abituale_grave')
                      AND r.coef IS NOT NULL AND r.coef < 1
                    THEN ', ridotto ' || CASE WHEN round((1 - r.coef) * 100)::int::text ~ '^(8|11)' THEN 'dell''' ELSE 'del ' END || round((1 - r.coef) * 100)::int || '%' ELSE '' END
            || CASE r.prof
                 WHEN 'patologico_scaduto_fermo' THEN ' per scaduto fermo oltre 60 giorni.'
                 WHEN 'patologico_insoluti_ripetuti' THEN ' per insoluti ripetuti.'
                 WHEN 'patologico_insoluto_pesante' THEN ' per un insoluto con scaduto rilevante.'
                 WHEN 'insoluto_isolato' THEN ' per un insoluto in corso.'
                 WHEN 'ritardo_abituale' THEN ' perché paga spesso in ritardo' || CASE WHEN r.usa_storico THEN ' (storico: nessun pagamento negli ultimi 12 mesi)' ELSE ' (ultimi 12 mesi)' END || '.'
                 WHEN 'ritardo_abituale_grave' THEN ' perché paga spesso con ritardi lunghi' || CASE WHEN r.usa_storico THEN ' (storico: nessun pagamento negli ultimi 12 mesi)' ELSE ' (ultimi 12 mesi)' END || '.'
                 ELSE '.' END
            || ' ' || COALESCE(NULLIF(public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, false), ''), 'Oggi non ci deve nulla')
            || '.'
            || ' Per lavorare tranquillo gli servono ' || replace(to_char(r.fp_frenato, 'FM999,999,999'), ',', '.') || ' €'
            || CASE WHEN r.con_mt THEN ' (lasciamo un margine del 20%).' ELSE '.' END
          ) END
    END END
    || CASE WHEN r.ord > 0 THEN ' Ha anche ordini clienti aperti per ' || replace(to_char(round(r.ord), 'FM999,999,999'), ',', '.') || ' €'
         || CASE WHEN r.esp + r.ord > r.fp_frenato THEN ', che se consegnati supererebbero il fido' ELSE '' END || '.' ELSE '' END
    || CASE WHEN r.fp_frenato > r.fa AND r.fp_frenato > public.arrotonda_fido_v2(r.base_v * COALESCE((SELECT NULLIF(trim(replace(valore, ',', '.')), '')::numeric FROM public.configurazioni WHERE chiave='fido_v2_tetto_base'), 1.5))
         THEN ' Sta comprando molto più del solito (oltre una volta e mezza il fido giusto): va autorizzato.' ELSE '' END
    || CASE WHEN r.fp_frenato > r.fp AND r.esp + r.ord > r.esp_picco THEN ' Ha ordini aperti per '
         || replace(to_char(round(r.ord), 'FM999,999,999'), ',', '.')
         || ' €: per consegnarli senza bloccarlo il fido non scende sotto '
         || replace(to_char(r.fp_frenato, 'FM999,999,999'), ',', '.') || ' €.'
         WHEN r.fp_frenato > r.fp THEN ' Negli ultimi 30 giorni è arrivato a doverci '
         || replace(to_char(round(r.esp_picco), 'FM999,999,999'), ',', '.')
         || ' €: per non bloccarlo il fido non scende sotto '
         || replace(to_char(r.fp_frenato, 'FM999,999,999'), ',', '.') || ' €.' ELSE '' END
  FROM freno r;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) TO authenticated, service_role;