-- 1) MATERIALIZED VIEW fatturato mensile per cliente
DROP MATERIALIZED VIEW IF EXISTS public.fatturato_mensile_cliente CASCADE;

CREATE MATERIALIZED VIEW public.fatturato_mensile_cliente AS
WITH docs AS (
  SELECT DISTINCT ON (s.cliente_id, COALESCE(s.key_documento, s.numero_documento))
    s.cliente_id, s.data_documento, s.importo_documento
  FROM public.scadenze s
  WHERE s.data_documento IS NOT NULL AND s.numero_documento IS NOT NULL
)
SELECT
  d.cliente_id,
  date_trunc('month', d.data_documento)::date AS mese,
  COALESCE(sum(d.importo_documento), 0)::numeric AS importo_lordo,
  count(*)::int AS n_documenti
FROM docs d
WHERE d.cliente_id IS NOT NULL
GROUP BY d.cliente_id, date_trunc('month', d.data_documento)::date;

CREATE UNIQUE INDEX fatturato_mensile_cliente_pk
  ON public.fatturato_mensile_cliente (cliente_id, mese);
CREATE INDEX fatturato_mensile_cliente_mese_idx
  ON public.fatturato_mensile_cliente (mese);

REVOKE ALL ON public.fatturato_mensile_cliente FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fatturato_mensile_cliente TO service_role;

-- 2) vista rolling: legge dalla materialized view
CREATE OR REPLACE VIEW public.fatturato_rolling_cliente
WITH (security_invoker = true) AS
SELECT
  m.cliente_id,
  COALESCE(sum(m.importo_lordo) FILTER (
    WHERE m.mese >= (date_trunc('month', CURRENT_DATE) - INTERVAL '12 months')::date
  ), 0::numeric) AS rolling_12m,
  COALESCE(sum(m.importo_lordo) FILTER (
    WHERE EXTRACT(year FROM m.mese) = EXTRACT(year FROM CURRENT_DATE)
  ), 0::numeric) AS anno_corrente,
  COALESCE(sum(m.importo_lordo) FILTER (
    WHERE EXTRACT(year FROM m.mese) = EXTRACT(year FROM CURRENT_DATE) - 1
  ), 0::numeric) AS anno_precedente
FROM public.fatturato_mensile_cliente m
GROUP BY m.cliente_id;

-- 3) RPC fido teorico: cfg letta una volta, filtro clienti PRIMA dell'aggregazione
CREATE OR REPLACE FUNCTION public.get_fido_teorico(
  _cliente_ids uuid[] DEFAULT NULL::uuid[],
  _solo_condizione_mancante boolean DEFAULT false
)
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
        WHERE m.mese >= (date_trunc('month', CURRENT_DATE) - make_interval(months => (SELECT mesi FROM cfg)))::date
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

REVOKE ALL ON FUNCTION public.get_fido_teorico(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico(uuid[], boolean) TO authenticated, service_role;

-- 4) refresh del precalcolo + traccia ultimo aggiornamento
CREATE OR REPLACE FUNCTION public.refresh_fatturato_mensile()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'amministratore')
     AND NOT public.has_role(auth.uid(), 'direzione') THEN
    RAISE EXCEPTION 'Operazione non consentita';
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.fatturato_mensile_cliente;

  INSERT INTO public.configurazioni (chiave, valore, descrizione)
  VALUES ('fatturato_mensile_ultimo_refresh', v_now::text, 'Ultimo aggiornamento del precalcolo fatturato mensile (fido teorico)')
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;

  RETURN v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_fatturato_mensile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_fatturato_mensile() TO authenticated, service_role;

INSERT INTO public.configurazioni (chiave, valore, descrizione)
VALUES ('fatturato_mensile_ultimo_refresh', now()::text, 'Ultimo aggiornamento del precalcolo fatturato mensile (fido teorico)')
ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;