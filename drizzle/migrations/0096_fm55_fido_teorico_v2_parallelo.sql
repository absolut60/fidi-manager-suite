-- FM55 fetta 1: nuovo fido teorico calcolato IN PARALLELO (sola osservazione).
-- Non tocca get_fido_teorico, fido_teorico_cliente, arrotonda_fido_proposto,
-- coefficiente_comportamento né alcuna schermata.

CREATE TABLE public.fido_teorico_v2 (
  cliente_id uuid PRIMARY KEY REFERENCES public.clienti(id) ON DELETE CASCADE,
  acquisto_storico numeric,
  acquisto_tendenza numeric,
  acquisto_mensile numeric,
  ciclo_gg numeric,
  mesi_stagionali numeric,
  profilo text,
  coefficiente numeric,
  base numeric,
  esposizione numeric,
  ordini_aperti numeric,
  fabbisogno numeric,
  fido_proposto numeric,
  fido_attuale numeric,
  consumo_perc numeric,
  regola text,
  da_verificare boolean NOT NULL DEFAULT false,
  spiegazione text,
  calcolato_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fido_teorico_v2 TO authenticated;
GRANT ALL ON public.fido_teorico_v2 TO service_role;

ALTER TABLE public.fido_teorico_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura fido teorico v2: solo clienti visibili" ON public.fido_teorico_v2
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clienti c WHERE c.id = fido_teorico_v2.cliente_id));

CREATE POLICY "Scrittura fido teorico v2 solo admin" ON public.fido_teorico_v2
  FOR ALL TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'amministratore'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'direzione'::public.app_role)))
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'amministratore'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'direzione'::public.app_role)));

CREATE POLICY "Secondo fattore (FM44)" ON public.fido_teorico_v2
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok()))
  WITH CHECK ((SELECT public.auth_mfa_ok()));

-- Arrotondamento per eccesso del nuovo fido: fino a 1.000 multipli di 500,
-- fino a 5.000 multipli di 1.000, oltre multipli di 5.000 (senza tetto).
CREATE OR REPLACE FUNCTION public.arrotonda_fido_v2(_x numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _x IS NULL THEN NULL
    WHEN _x <= 0 THEN 0::numeric
    WHEN _x <= 1000 THEN ceil(_x / 500) * 500
    WHEN _x <= 5000 THEN ceil(_x / 1000) * 1000
    ELSE ceil(_x / 5000) * 5000
  END::numeric;
$$;
REVOKE EXECUTE ON FUNCTION public.arrotonda_fido_v2(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arrotonda_fido_v2(numeric) TO authenticated, service_role;

-- GEMELLO TEMPORANEO di get_fido_teorico: le esclusioni (sede, gruppo, bloccato,
-- legale, condizione mancante, pagamento immediato) e i loro esiti sono copiati
-- da get_fido_teorico. La funzione vecchia sparirà nella fetta finale di FM55.
CREATE OR REPLACE FUNCTION public.get_fido_teorico_v2(_cliente_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(
  cliente_id uuid, acquisto_storico numeric, acquisto_tendenza numeric, acquisto_mensile numeric,
  ciclo_gg numeric, mesi_stagionali numeric, profilo text, coefficiente numeric, base numeric,
  esposizione numeric, ordini_aperti numeric, fabbisogno numeric, fido_proposto numeric,
  fido_attuale numeric, consumo_perc numeric, regola text, da_verificare boolean, spiegazione text
)
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
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_tolleranza_gg'), ',', '.')), '')::numeric, 15) AS toll,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_soglia_residuo_eur'), ',', '.')), '')::numeric, 500) AS soglia,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_quota_insoluto_isolato'), ',', '.')), '')::numeric, 0.10) AS q_ins,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_quota_ritardo_occasionale'), ',', '.')), '')::numeric, 0.50) AS q_occ,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_fido_dormienti_eur'), ',', '.')), '')::numeric, 500) AS fido_dorm,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_abituale'), ',', '.')), '')::numeric, 0.80) AS c_abit,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_grave'), ',', '.')), '')::numeric, 0.60) AS c_grave,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_insoluto_isolato'), ',', '.')), '')::numeric, 0.80) AS c_iso,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_pat_insoluto_pesante'), ',', '.')), '')::numeric, 0.60) AS c_pes,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_pat_insoluti_ripetuti'), ',', '.')), '')::numeric, 0.40) AS c_rip,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_coeff_pat_scaduto_fermo'), ',', '.')), '')::numeric, 0.20) AS c_fermo,
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
    SELECT cliente_id, min(mese) AS primo_mese FROM fm WHERE imp > 0 GROUP BY cliente_id
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
      SELECT cliente_id, stima FROM corr
    ) x
    WHERE EXISTS (SELECT 1 FROM rec r WHERE r.cliente_id = x.cliente_id)
       OR EXISTS (SELECT 1 FROM corr k WHERE k.cliente_id = x.cliente_id AND k.stima > 0)
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
      COALESCE(fe.imp, 0) AS fermo_imp,
      COALESCE(sc.scaduto, 0) AS scaduto,
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
    LEFT JOIN pag pg ON pg.cliente_id = c.id
  ),
  b2 AS (
    SELECT b.*,
      COALESCE((b.storico + b.tendenza) / 2, b.storico, b.tendenza, 0) AS acq,
      (SELECT COALESCE(sum(b.idx[EXTRACT(month FROM (b.m0 + make_interval(months => k)))::int]
                 * LEAST(1, GREATEST(0, COALESCE(b.ciclo, 0) / 30.0 - k))), 0)
         FROM generate_series(0, 7) AS k) AS mesi_st,
      CASE
        WHEN b.fatt12 <= 0 AND b.fatt_corr <= 0 THEN 'dormiente'
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
           ELSE public.arrotonda_fido_v2(b3.acq * b3.mesi_st * b3.coef) END AS base_v,
      CASE WHEN b3.patol THEN b3.esp ELSE b3.esp + b3.ord END AS fabb
    FROM b3
  ),
  b5 AS (
    SELECT b4.*,
      CASE b4.reg
        WHEN 'sede_esclusa' THEN b4.fa
        WHEN 'esclusa_gruppo' THEN b4.fa
        WHEN 'calcolo' THEN public.arrotonda_fido_v2(GREATEST(b4.base_v, b4.fabb))
        ELSE 0::numeric
      END AS fp,
      round(b4.mesi_st * 2) / 2 AS mesi_mezzi
    FROM b4
  )
  SELECT
    r.id,
    round(r.storico, 2), round(r.tendenza, 2), round(r.acq, 2),
    r.ciclo, round(r.mesi_st, 3), r.prof, r.coef,
    r.base_v, r.esp, r.ord, r.fabb, r.fp, r.fa,
    CASE WHEN r.fa > 0 THEN round((r.esp + r.ord) / r.fa, 4) END,
    r.reg,
    (r.primo_mese IS NOT NULL AND r.primo_mese >= (r.m0 - interval '2 months')::date),
    CASE r.reg
      WHEN 'sede_esclusa' THEN 'Sede esclusa dal calcolo: mantiene il fido attuale.'
      WHEN 'esclusa_gruppo' THEN 'Società del gruppo esclusa dal calcolo: mantiene il fido attuale.'
      WHEN 'cliente_bloccato' THEN 'Cliente bloccato: nessun fido proposto.'
      WHEN 'gestione_legale' THEN 'Cliente in gestione legale: nessun fido proposto.'
      WHEN 'condizione_mancante' THEN 'Condizione di pagamento non riconosciuta: impossibile calcolare il fido.'
      WHEN 'pagamento_immediato' THEN 'Pagamento immediato: non serve un fido.'
      ELSE
        CASE WHEN r.prof = 'dormiente'
          THEN 'Non ha comprato negli ultimi 12 mesi: la base è il fido minimo di '
               || replace(to_char(r.base_v, 'FM999,999,999'), ',', '.') || ' €. '
          ELSE 'Compra in media ' || replace(to_char(round(r.acq), 'FM999,999,999'), ',', '.')
               || ' € al mese e paga in circa '
               || CASE WHEN r.mesi_mezzi < 1 THEN round(r.ciclo)::int || ' giorni'
                       WHEN r.mesi_mezzi = floor(r.mesi_mezzi) THEN floor(r.mesi_mezzi)::int || CASE WHEN r.mesi_mezzi = 1 THEN ' mese' ELSE ' mesi' END
                       ELSE floor(r.mesi_mezzi)::int || CASE WHEN floor(r.mesi_mezzi) = 1 THEN ' mese' ELSE ' mesi' END || ' e mezzo' END
               || ': la base è ' || replace(to_char(r.base_v, 'FM999,999,999'), ',', '.') || ' €. '
        END
        || 'Oggi ci deve ' || replace(to_char(round(r.esp), 'FM999,999,999'), ',', '.') || ' €'
        || CASE WHEN r.patol THEN '' WHEN r.ord > 0
             THEN ' e ha ordini aperti per ' || replace(to_char(round(r.ord), 'FM999,999,999'), ',', '.') || ' €' ELSE '' END
        || ': per servirlo servono ' || replace(to_char(r.fp, 'FM999,999,999'), ',', '.') || ' €.'
        || CASE r.prof
             WHEN 'patologico_scaduto_fermo' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' per scaduto fermo oltre 60 giorni; gli ordini aperti non sono considerati.'
             WHEN 'patologico_insoluti_ripetuti' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' per insoluti ripetuti; gli ordini aperti non sono considerati.'
             WHEN 'patologico_insoluto_pesante' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' per un insoluto con scaduto rilevante; gli ordini aperti non sono considerati.'
             WHEN 'insoluto_isolato' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' per un insoluto in corso.'
             WHEN 'ritardo_abituale' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' perché paga spesso in ritardo.'
             WHEN 'ritardo_abituale_grave' THEN ' Coefficiente ' || replace(r.coef::text, '.', ',') || ' perché paga spesso con ritardi lunghi.'
             ELSE '' END
    END
  FROM b5 r;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) TO authenticated, service_role;