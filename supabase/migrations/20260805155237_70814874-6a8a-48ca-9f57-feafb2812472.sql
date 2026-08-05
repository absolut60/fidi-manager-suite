CREATE OR REPLACE VIEW public.fatturato_rolling_cliente AS
SELECT cliente_id,
    COALESCE(sum(importo_lordo) FILTER (WHERE mese >= (date_trunc('month', CURRENT_DATE) - make_interval(months => 11))::date), 0::numeric) AS rolling_12m,
    COALESCE(sum(importo_lordo) FILTER (WHERE EXTRACT(year FROM mese) = EXTRACT(year FROM CURRENT_DATE)), 0::numeric) AS anno_corrente,
    COALESCE(sum(importo_lordo) FILTER (WHERE EXTRACT(year FROM mese) = (EXTRACT(year FROM CURRENT_DATE) - 1::numeric)), 0::numeric) AS anno_precedente
   FROM public.fatturato_mensile_cliente m
  GROUP BY cliente_id;

CREATE OR REPLACE FUNCTION public.get_fido_teorico(_cliente_ids uuid[] DEFAULT NULL::uuid[], _solo_condizione_mancante boolean DEFAULT false)
 RETURNS TABLE(cliente_id uuid, fatturato_rolling numeric, giorni integer, giorni_mancanti boolean, fido_base numeric, fido_proposto numeric, fido_attuale numeric, scostamento numeric, regola_applicata text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cfg AS MATERIALIZED (
    SELECT
      public.store_id_effettivo(NULL) AS sid,
      GREATEST(1, LEAST(36, COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_mesi_rolling')), '')::int, 12))) AS mesi,
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
      c.id,
      c.store_id,
      regexp_replace(COALESCE(c.partita_iva, ''), '\D', '', 'g') AS piva,
      COALESCE(c.fido_gestionale, 0)::numeric AS fa,
      g.giorni_totali AS gg
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
  base AS (
    SELECT
      b.id, b.store_id, b.piva, cfg.pive AS pive, b.fa, b.gg,
      COALESCE(f.rolling, 0)::numeric AS r12,
      COALESCE(f.anno_corrente, 0)::numeric AS ac,
      COALESCE(f.anno_precedente, 0)::numeric AS ap
    FROM cli b
    CROSS JOIN cfg
    LEFT JOIN fatt f ON f.cliente_id = b.id
  ),
  calc AS (
    SELECT b.*, public.calcola_fido_base(b.r12, b.gg) AS fb FROM base b
  ),
  fin AS (
    SELECT c.*,
      CASE
        WHEN c.store_id = '3c57ae39-1f3a-4085-96ef-2f2d2c4c8221'::uuid THEN 'sede_esclusa'
        WHEN c.piva <> '' AND c.piva = ANY(c.pive) THEN 'esclusa_gruppo'
        WHEN c.gg IS NULL THEN 'condizione_mancante'
        WHEN c.r12 <= 0 AND c.ap > 0 AND c.ac <= 0 THEN 'minimo_500'
        WHEN c.r12 <= 0 THEN 'nessun_fatturato'
        WHEN c.fb <= 5000 THEN 'fascia_1000'
        ELSE 'fascia_5000'
      END AS regola
    FROM calc c
  ),
  ris AS (
    SELECT f.*,
      CASE f.regola
        WHEN 'sede_esclusa' THEN f.fa
        WHEN 'esclusa_gruppo' THEN f.fa
        WHEN 'condizione_mancante' THEN 0::numeric
        WHEN 'nessun_fatturato' THEN 0::numeric
        WHEN 'minimo_500' THEN 500::numeric
        ELSE public.arrotonda_fido_proposto(f.fb)
      END AS fp
    FROM fin f
  )
  SELECT r.id, r.r12, r.gg, (r.gg IS NULL), r.fb, r.fp, r.fa, r.fp - r.fa, r.regola
  FROM ris r
  WHERE (NOT _solo_condizione_mancante) OR r.regola = 'condizione_mancante';
$function$;