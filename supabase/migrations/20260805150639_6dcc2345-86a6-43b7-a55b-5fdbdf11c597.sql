CREATE TABLE public.codici_pagamento_giorni (
  descrizione text PRIMARY KEY,
  giorni_totali integer NOT NULL
);

GRANT SELECT ON public.codici_pagamento_giorni TO authenticated;
GRANT ALL ON public.codici_pagamento_giorni TO service_role;

ALTER TABLE public.codici_pagamento_giorni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "codici_pagamento_giorni_select" ON public.codici_pagamento_giorni
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "codici_pagamento_giorni_admin" ON public.codici_pagamento_giorni
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'amministratore'))
  WITH CHECK (public.has_role(auth.uid(), 'amministratore'));

INSERT INTO public.codici_pagamento_giorni (descrizione, giorni_totali) VALUES
('R.B. 90 gg d.f. f.m. 15ms',135),('R.B. 60/90 gg. d.f. f.m. 10 ms',130),('R.B. 90/120 gg. d.f. f.m.',150),('R.B. 60/90 gg. d.f. f.m.',120),('R.B. 90/120 gg. d.f. f.m. 10 ms',160),('R.B. 90 gg. d.f. f.m.',120),('R.B. 60 gg. d.f. f.m.',90),('Bonifico 60 gg. d.f. f.m.',90),('R.B. 30/60/90 gg. d.f. f.m.',120),('Bonifico 60/90 gg d.f. f.m. al 15 ms',135),('R.B. 60/90 gg d.f. f.m. al 15 ms',135),('R.B. 60 gg d.f. 10 ms',100),('R.B. 60/90/120 gg. d.f. f.m.',150),('R.B. 30/60/90/120 gg. d.f. f.m.',150),('Bonifico 90 gg. d.f. f.m.',120),('R.B. 120 gg. d.f. f.m.',150),('Bonifico 60/90/120 gg. d.f. f.m.',150),('Bonifico 60/90 gg. d.f. f.m.',120),('Bonifico 30/60 gg. d.f.+15',105),('R.B. 60/90 gg. d.f. 10 ms',130),('Rimessa diretta contanti VERCELLI',30),('Bonifico 30 gg. d.f. f.m.',60),('R.B. 30/60 gg. d.f. f.m.',90),('R.B. 90 gg. d.f. f.m. 10 ms',130),('R.B. 60 gg. d.f. f.m. 10 ms',100),('Bonifico 30/60 gg. d.f. f.m.',90),('R.B. 30/60/90 gg. d.f. 10 ms',130),('R.B. 60 gg. d.f. f.m. 15 ms',105),('R.B. 90 gg. d.f. 10 ms',130),('R.B. 30 gg. d.f. f.m.',60),('Rimessa diretta contanti CERIANO',30),('Bonifico 60 gg. d.f. f.m. 10 ms',100),('R.B. 30 gg. d.f. f.m. 10 ms',70),('Rimessa diretta contanti CAMBIAGO',30),('Bonifico 120 gg. d.f. f.m.',150),('R.B. 90/120/150 gg. d.f. f.m.',180),('Rimessa diretta contanti CASOREZZO',30),('Rimessa diretta contanti PIANEZZA',30),('Bonifico 90 gg. d.f. f.m. 10 ms',130),('R.B. 60/90 gg. d.f.',120),('R.B. 90 gg. d.f.',120),('R.B. 60 gg. d.f.',90),('Rimessa diretta contanti LISSONE',30),('Rimessa diretta contanti AFFORI',30),('R.B. 120 gg. d.f. 5 ms',155),('Bonifico bancario vista fattura',30),('Rimessa diretta contanti SAVIGLIANO',30),('Rimessa diretta POS',30),('R.B. 30 gg. d.f. 10 ms',70),('Bonifico bancario vista fattura S',30),('Bonifico 60 gg. d.f. f.m. 15 ms',105),('Bonifico 30 gg. d.f. f.m. 10 ms',70),('R.B. 30 gg. d.f. f.m. 10 ms ***',70),('R.B. 120 gg. d.f. f.m. 10 ms',160),('Bonifico 30/60 gg. d.f.',90),('R.B. 60 gg. d.f. f.m. 5 ms',95),('Rimessa diretta vista fattura contanti',30),('Rimessa diretta assegno CASOREZZO',30),('Bonifico',30),('Bonifico bancario vista fattura***',30),('Rimessa diretta vista fattura assegno',30),('Rimessa diretta assegno SAVIGLIANO',30),('Bonifico 30/60/90 gg. d.f. f.m.',120),('Rimessa diretta assegno VERCELLI',30),('R.B. 90 gg. d.f. 5 ms',125),('Bonifico 150 gg. d.f. f.m.',180),('0',30),('Rimessa diretta vista fattura ***',30),('Rimessa diretta assegno LISSONE',30),('Rimessa diretta da finanziaria',30),('ON-LINE carta di credito',30),('Rimessa diretta assegno CAMBIAGO',30),('R.B. 30/60 gg. d.f. 10ms',100),('Rimessa diretta assegno PIANEZZA',30),('R.B. 60 gg. d.f. f.m. 10 ms ***',100),('Bonifico 90/120 gg. d.f. f.m.',150),('RID vista fattura',30),('RID 60 gg. d.f.',90),('R.B. 90 gg. d.f. 11 ms ***',131),('Rimessa diretta contanti CINISELLO',30);

CREATE INDEX IF NOT EXISTS idx_cpg_desc_lower ON public.codici_pagamento_giorni (lower(trim(descrizione)));

CREATE OR REPLACE VIEW public.fatturato_rolling_cliente
WITH (security_invoker = true) AS
WITH docs AS (
  SELECT DISTINCT ON (cliente_id, COALESCE(key_documento, numero_documento))
    cliente_id, data_documento, importo_documento
  FROM public.scadenze
  WHERE data_documento IS NOT NULL AND numero_documento IS NOT NULL
)
SELECT
  cliente_id,
  COALESCE(SUM(importo_documento) FILTER (WHERE data_documento > CURRENT_DATE - INTERVAL '12 months'), 0) AS rolling_12m,
  COALESCE(SUM(importo_documento) FILTER (WHERE EXTRACT(year FROM data_documento) = EXTRACT(year FROM CURRENT_DATE)), 0) AS anno_corrente,
  COALESCE(SUM(importo_documento) FILTER (WHERE EXTRACT(year FROM data_documento) = EXTRACT(year FROM CURRENT_DATE) - 1), 0) AS anno_precedente
FROM docs
GROUP BY cliente_id;

GRANT SELECT ON public.fatturato_rolling_cliente TO authenticated;

CREATE OR REPLACE FUNCTION public.calcola_fido_base(_fatturato_lordo numeric, _giorni integer)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT GREATEST(0, COALESCE(_fatturato_lordo, 0) / 12.0 * COALESCE(_giorni, 0) / 30.0)
$$;

CREATE OR REPLACE FUNCTION public.arrotonda_fido_proposto(_fido_base numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN COALESCE(_fido_base, 0) <= 0 THEN 0
    WHEN _fido_base <= 5000 THEN CEIL(_fido_base / 1000.0) * 1000
    ELSE ROUND(_fido_base / 5000.0) * 5000
  END
$$;

REVOKE ALL ON FUNCTION public.calcola_fido_base(numeric, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arrotonda_fido_proposto(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcola_fido_base(numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.arrotonda_fido_proposto(numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_fido_teorico(_cliente_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sede AS (SELECT public.store_id_effettivo(NULL) AS sid),
  base AS (
    SELECT
      c.id,
      c.store_id,
      COALESCE(c.fido_gestionale, 0)::numeric AS fa,
      COALESCE(f.rolling_12m, 0)::numeric AS r12,
      COALESCE(f.anno_corrente, 0)::numeric AS ac,
      COALESCE(f.anno_precedente, 0)::numeric AS ap,
      g.giorni_totali AS gg
    FROM public.clienti c
    CROSS JOIN sede s
    LEFT JOIN public.codici_pagamento cp ON cp.cod = c.condizione_pagamento_cod
    LEFT JOIN public.codici_pagamento_giorni g
      ON lower(trim(g.descrizione)) = lower(trim(COALESCE(NULLIF(trim(c.condizione_pagamento_desc), ''), cp.descrizione)))
    LEFT JOIN public.fatturato_rolling_cliente f ON f.cliente_id = c.id
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
        WHEN c.r12 <= 0 THEN 'nessun_fatturato'
        WHEN c.ap > 0 AND c.ac <= 0 THEN 'minimo_500'
        WHEN c.fb <= 5000 THEN 'fascia_1000'
        ELSE 'fascia_5000'
      END AS regola
    FROM calc c
  )
  SELECT
    f.id,
    f.r12,
    f.gg,
    (f.gg IS NULL),
    f.fb,
    CASE f.regola
      WHEN 'sede_esclusa' THEN f.fa
      WHEN 'nessun_fatturato' THEN 0::numeric
      WHEN 'minimo_500' THEN 500::numeric
      ELSE public.arrotonda_fido_proposto(f.fb)
    END,
    f.fa,
    (CASE f.regola
      WHEN 'sede_esclusa' THEN f.fa
      WHEN 'nessun_fatturato' THEN 0::numeric
      WHEN 'minimo_500' THEN 500::numeric
      ELSE public.arrotonda_fido_proposto(f.fb)
    END) - f.fa,
    f.regola
  FROM fin f;
$$;

REVOKE ALL ON FUNCTION public.get_fido_teorico(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico(uuid[]) TO authenticated;