-- Configurazioni
INSERT INTO public.configurazioni (chiave, valore, descrizione) VALUES
  ('fido_teorico_ponderazione', 'pesata', 'Piatta = media semplice dei mesi. Pesata = più peso ai mesi recenti (3× gli ultimi 3, 2× i 3 precedenti, 1× i più vecchi)'),
  ('fido_teorico_coefficienti', 'true', 'Riduce il fido proposto ai clienti che pagano oltre i termini concordati')
ON CONFLICT (chiave) DO NOTHING;

-- Peso di un mese in base all'età (0 = mese corrente)
CREATE OR REPLACE FUNCTION public.peso_mese_fido(_eta integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN COALESCE(_eta, 0) <= 2 THEN 3 WHEN _eta <= 5 THEN 2 ELSE 1 END
$$;

-- Coefficiente di comportamento
CREATE OR REPLACE FUNCTION public.coefficiente_comportamento(_giorni_oltre integer, _patologico boolean, _num_insoluti integer)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN COALESCE(_num_insoluti, 0) > 0 THEN 0::numeric
    WHEN COALESCE(_patologico, false) THEN
      CASE WHEN COALESCE(_giorni_oltre,0) <= 0 THEN 0.60
           WHEN _giorni_oltre <= 15 THEN 0.50
           WHEN _giorni_oltre <= 45 THEN 0.35
           ELSE 0.20 END
    ELSE
      CASE WHEN COALESCE(_giorni_oltre,0) <= 0 THEN 1.00
           WHEN _giorni_oltre <= 15 THEN 0.95
           WHEN _giorni_oltre <= 45 THEN 0.80
           ELSE 0.60 END
  END
$$;

DROP FUNCTION IF EXISTS public.get_fido_teorico(uuid[], boolean);

CREATE FUNCTION public.get_fido_teorico(_cliente_ids uuid[] DEFAULT NULL::uuid[], _solo_condizione_mancante boolean DEFAULT false)
 RETURNS TABLE(cliente_id uuid, fatturato_rolling numeric, ritmo_mensile numeric, giorni integer, giorni_mancanti boolean,
   fido_base numeric, fido_base_lordo numeric, giorni_oltre_accordo integer, profilo_pagamento text,
   coefficiente numeric, fido_proposto numeric, fido_proposto_senza_coefficiente numeric,
   fido_attuale numeric, scostamento numeric, regola_applicata text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cfg AS MATERIALIZED (
    SELECT
      public.store_id_effettivo(NULL) AS sid,
      GREATEST(1, LEAST(36, COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_mesi_rolling')), '')::int, 12))) AS mesi,
      (lower(COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_ponderazione')), ''), 'pesata')) = 'pesata') AS pesata,
      (lower(COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_coefficienti')), ''), 'true')) IN ('true','t','1','si','sì')) AS usa_coef,
      COALESCE(
        (SELECT array_agg(v) FROM (
           SELECT regexp_replace(x, '\D', '', 'g') AS v
           FROM unnest(string_to_array(COALESCE((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_piva_escluse'), ''), ',')) AS x
         ) q WHERE q.v <> ''),
        ARRAY[]::text[]
      ) AS pive
  ),
  pesi AS MATERIALIZED (
    SELECT COALESCE(sum(public.peso_mese_fido(i)), 0)::numeric AS somma_pesi
    FROM cfg, generate_series(0, (SELECT mesi FROM cfg) - 1) AS i
  ),
  cli AS MATERIALIZED (
    SELECT
      c.id,
      c.store_id,
      regexp_replace(COALESCE(c.partita_iva, ''), '\D', '', 'g') AS piva,
      COALESCE(c.fido_gestionale, 0)::numeric AS fa,
      g.giorni_totali AS gg,
      COALESCE(g.pagamento_immediato, false) AS immediato,
      COALESCE(c.num_insoluti, 0)::int AS insoluti,
      CASE WHEN c.dilazione_effettiva IS NULL OR c.dilazione_concordata IS NULL THEN 0
           ELSE (c.dilazione_effettiva - c.dilazione_concordata)::int END AS gg_oltre
    FROM public.clienti c
    CROSS JOIN cfg
    LEFT JOIN public.codici_pagamento cp ON cp.cod = c.condizione_pagamento_cod
    LEFT JOIN public.codici_pagamento_giorni g
      ON lower(trim(g.descrizione)) = lower(trim(COALESCE(NULLIF(trim(c.condizione_pagamento_desc), ''), cp.descrizione)))
    WHERE (cfg.sid IS NULL OR c.store_id = cfg.sid)
      AND (_cliente_ids IS NULL OR c.id = ANY(_cliente_ids))
  ),
  fatt AS (
    SELECT
      m.cliente_id,
      COALESCE(sum(m.importo_lordo) FILTER (
        WHERE m.mese >= (date_trunc('month', CURRENT_DATE) - make_interval(months => ((SELECT mesi FROM cfg) - 1)))::date
      ), 0::numeric) AS rolling,
      COALESCE(sum(m.importo_lordo * public.peso_mese_fido(
        ((EXTRACT(year FROM age(date_trunc('month', CURRENT_DATE), m.mese)) * 12)
          + EXTRACT(month FROM age(date_trunc('month', CURRENT_DATE), m.mese)))::int
      )) FILTER (
        WHERE m.mese >= (date_trunc('month', CURRENT_DATE) - make_interval(months => ((SELECT mesi FROM cfg) - 1)))::date
      ), 0::numeric) AS rolling_pesato,
      COALESCE(sum(m.importo_lordo) FILTER (
        WHERE EXTRACT(year FROM m.mese) = EXTRACT(year FROM CURRENT_DATE)
      ), 0::numeric) AS anno_corrente,
      COALESCE(sum(m.importo_lordo) FILTER (
        WHERE EXTRACT(year FROM m.mese) = EXTRACT(year FROM CURRENT_DATE) - 1
      ), 0::numeric) AS anno_precedente
    FROM public.fatturato_mensile_cliente m
    WHERE m.cliente_id IN (SELECT id FROM cli)
    GROUP BY m.cliente_id
  ),
  patol AS (
    SELECT s.cliente_id, true AS patologico
    FROM public.scadenze s
    WHERE s.cliente_id IN (SELECT id FROM cli)
      AND s.stato_contabile = 'Aperta'
      AND COALESCE(s.importo_scadenza, 0) > 0
      AND NOT public.is_anticipo(s.numero_documento)
      AND s.tempi_scadenza ILIKE 'Scaduto%'
      AND (s.tempi_scadenza ILIKE '%60-90%' OR s.tempi_scadenza ILIKE '%90-120%' OR s.tempi_scadenza ILIKE '%oltre 120%')
    GROUP BY s.cliente_id
  ),
  base AS (
    SELECT
      b.id, b.store_id, b.piva, cfg.pive AS pive, b.fa, b.gg, b.immediato,
      b.insoluti, b.gg_oltre, cfg.usa_coef,
      COALESCE(f.rolling, 0)::numeric AS r12,
      CASE WHEN cfg.pesata
        THEN COALESCE(f.rolling_pesato, 0)::numeric / NULLIF((SELECT somma_pesi FROM pesi), 0)
        ELSE COALESCE(f.rolling, 0)::numeric / cfg.mesi::numeric
      END AS ritmo,
      COALESCE(f.anno_corrente, 0)::numeric AS ac,
      COALESCE(f.anno_precedente, 0)::numeric AS ap,
      COALESCE(p.patologico, false) OR b.insoluti > 0 AS patologico
    FROM cli b
    CROSS JOIN cfg
    LEFT JOIN fatt f ON f.cliente_id = b.id
    LEFT JOIN patol p ON p.cliente_id = b.id
  ),
  calc AS (
    SELECT b.*,
      GREATEST(0, COALESCE(b.ritmo, 0) * COALESCE(b.gg, 0) / 30.0) AS fb,
      public.coefficiente_comportamento(b.gg_oltre, b.patologico, b.insoluti) AS coef
    FROM base b
  ),
  fin AS (
    SELECT c.*,
      CASE
        WHEN c.store_id = '3c57ae39-1f3a-4085-96ef-2f2d2c4c8221'::uuid THEN 'sede_esclusa'
        WHEN c.piva <> '' AND c.piva = ANY(c.pive) THEN 'esclusa_gruppo'
        WHEN c.gg IS NULL THEN 'condizione_mancante'
        WHEN c.immediato THEN 'pagamento_immediato'
        WHEN c.r12 <= 0 AND c.ap > 0 AND c.ac <= 0 THEN 'minimo_500'
        WHEN c.r12 <= 0 THEN 'nessun_fatturato'
        WHEN c.fb <= 5000 THEN 'fascia_500'
        ELSE 'fascia_5000'
      END AS regola
    FROM calc c
  ),
  ris AS (
    SELECT f.*,
      CASE WHEN f.regola IN ('fascia_500','fascia_5000') AND f.usa_coef THEN f.coef ELSE 1::numeric END AS coef_eff,
      CASE f.regola
        WHEN 'sede_esclusa' THEN f.fa
        WHEN 'esclusa_gruppo' THEN f.fa
        WHEN 'condizione_mancante' THEN 0::numeric
        WHEN 'pagamento_immediato' THEN 0::numeric
        WHEN 'nessun_fatturato' THEN 0::numeric
        WHEN 'minimo_500' THEN 500::numeric
        ELSE public.arrotonda_fido_proposto(f.fb)
      END AS fp_senza
    FROM fin f
  ),
  fine AS (
    SELECT r.*,
      CASE WHEN r.regola IN ('fascia_500','fascia_5000') AND r.usa_coef
        THEN public.arrotonda_fido_proposto(r.fb * r.coef)
        ELSE r.fp_senza
      END AS fp
    FROM ris r
  )
  SELECT r.id, r.r12, r.ritmo, r.gg, (r.gg IS NULL), r.fb, r.fb,
    r.gg_oltre,
    CASE WHEN r.patologico THEN 'patologico' ELSE 'sano' END,
    r.coef_eff, r.fp, r.fp_senza, r.fa, r.fp - r.fa, r.regola
  FROM fine r
  WHERE (NOT _solo_condizione_mancante) OR r.regola = 'condizione_mancante';
$function$;

REVOKE ALL ON FUNCTION public.get_fido_teorico(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico(uuid[], boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.peso_mese_fido(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.peso_mese_fido(integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.coefficiente_comportamento(integer, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coefficiente_comportamento(integer, boolean, integer) TO authenticated, service_role;