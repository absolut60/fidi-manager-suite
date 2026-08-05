DROP FUNCTION IF EXISTS public.get_fido_teorico(uuid[]);

CREATE OR REPLACE FUNCTION public.get_fido_teorico(
  _cliente_ids uuid[] DEFAULT NULL::uuid[],
  _solo_condizione_mancante boolean DEFAULT false
)
RETURNS TABLE(
  cliente_id uuid,
  fatturato_rolling numeric,
  giorni integer,
  giorni_mancanti boolean,
  fido_base numeric,
  fido_proposto numeric,
  fido_attuale numeric,
  scostamento numeric,
  regola_applicata text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH sede AS (SELECT public.store_id_effettivo(NULL) AS sid),
  cfg AS (
    SELECT
      GREATEST(1, LEAST(36, COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_mesi_rolling')), '')::int, 12))) AS mesi,
      COALESCE((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_teorico_piva_escluse'), '') AS pive_txt
  ),
  pive AS (
    SELECT COALESCE(array_agg(regexp_replace(x, '\D', '', 'g')) FILTER (WHERE regexp_replace(x, '\D', '', 'g') <> ''), ARRAY[]::text[]) AS lista
    FROM cfg, unnest(string_to_array(cfg.pive_txt, ',')) AS x
  ),
  docs AS (
    SELECT DISTINCT ON (s.cliente_id, COALESCE(s.key_documento, s.numero_documento))
      s.cliente_id, s.data_documento, s.importo_documento
    FROM public.scadenze s
    WHERE s.data_documento IS NOT NULL AND s.numero_documento IS NOT NULL
  ),
  fatt AS (
    SELECT d.cliente_id,
      COALESCE(sum(d.importo_documento) FILTER (WHERE d.data_documento > (CURRENT_DATE - make_interval(months => cfg.mesi))), 0::numeric) AS rolling,
      COALESCE(sum(d.importo_documento) FILTER (WHERE EXTRACT(year FROM d.data_documento) = EXTRACT(year FROM CURRENT_DATE)), 0::numeric) AS anno_corrente,
      COALESCE(sum(d.importo_documento) FILTER (WHERE EXTRACT(year FROM d.data_documento) = EXTRACT(year FROM CURRENT_DATE) - 1), 0::numeric) AS anno_precedente
    FROM docs d CROSS JOIN cfg
    GROUP BY d.cliente_id
  ),
  base AS (
    SELECT
      c.id,
      c.store_id,
      regexp_replace(COALESCE(c.partita_iva, ''), '\D', '', 'g') AS piva,
      COALESCE(c.fido_gestionale, 0)::numeric AS fa,
      COALESCE(f.rolling, 0)::numeric AS r12,
      COALESCE(f.anno_corrente, 0)::numeric AS ac,
      COALESCE(f.anno_precedente, 0)::numeric AS ap,
      g.giorni_totali AS gg
    FROM public.clienti c
    CROSS JOIN sede s
    LEFT JOIN public.codici_pagamento cp ON cp.cod = c.condizione_pagamento_cod
    LEFT JOIN public.codici_pagamento_giorni g
      ON lower(trim(g.descrizione)) = lower(trim(COALESCE(NULLIF(trim(c.condizione_pagamento_desc), ''), cp.descrizione)))
    LEFT JOIN fatt f ON f.cliente_id = c.id
    WHERE (s.sid IS NULL OR c.store_id = s.sid)
      AND (_cliente_ids IS NULL OR c.id = ANY(_cliente_ids))
  ),
  calc AS (
    SELECT b.*, public.calcola_fido_base(b.r12, b.gg) AS fb FROM base b
  ),
  fin AS (
    SELECT c.*,
      CASE
        WHEN c.store_id = '3c57ae39-1f3a-4085-96ef-2f2d2c4c8221'::uuid THEN 'sede_esclusa'
        WHEN c.piva <> '' AND EXISTS (SELECT 1 FROM pive p WHERE c.piva = ANY(p.lista)) THEN 'esclusa_gruppo'
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
  SELECT
    r.id,
    r.r12,
    r.gg,
    (r.gg IS NULL),
    r.fb,
    r.fp,
    r.fa,
    r.fp - r.fa,
    r.regola
  FROM ris r
  WHERE (NOT _solo_condizione_mancante) OR r.regola = 'condizione_mancante';
$function$;

REVOKE ALL ON FUNCTION public.get_fido_teorico(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico(uuid[], boolean) TO authenticated, service_role;