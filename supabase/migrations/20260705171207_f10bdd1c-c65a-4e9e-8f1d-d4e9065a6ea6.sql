
-- Allarga il CHECK su template_email.tipo per includere il nuovo template
ALTER TABLE public.template_email DROP CONSTRAINT IF EXISTS template_email_tipo_check;
ALTER TABLE public.template_email ADD CONSTRAINT template_email_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'sollecito_1'::text, 'sollecito_2'::text, 'messa_in_mora'::text,
    'libero'::text, 'promemoria_scadenza'::text, 'reminder_rata_piano'::text
  ]));

-- ---------- 1. piani_rientro ----------
CREATE TABLE public.piani_rientro (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  livello SMALLINT NOT NULL CHECK (livello IN (1, 2)),
  stato TEXT NOT NULL DEFAULT 'attivo'
    CHECK (stato IN ('attivo', 'completato', 'non_rispettato', 'annullato')),
  note TEXT,
  creato_da UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_piani_rientro_cliente ON public.piani_rientro(cliente_id);
CREATE INDEX idx_piani_rientro_stato ON public.piani_rientro(stato);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.piani_rientro TO authenticated;
GRANT ALL ON public.piani_rientro TO service_role;

ALTER TABLE public.piani_rientro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "piani_rientro_select"
  ON public.piani_rientro FOR SELECT TO authenticated
  USING (public.user_can_access_cliente(cliente_id));

CREATE POLICY "piani_rientro_write"
  ON public.piani_rientro FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
  );

CREATE TRIGGER trg_piani_rientro_updated
  BEFORE UPDATE ON public.piani_rientro
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------- 2. piani_rientro_documenti ----------
CREATE TABLE public.piani_rientro_documenti (
  piano_id UUID NOT NULL REFERENCES public.piani_rientro(id) ON DELETE CASCADE,
  scadenza_id UUID NOT NULL REFERENCES public.scadenze(id) ON DELETE CASCADE,
  importo_alla_selezione NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (piano_id, scadenza_id)
);
CREATE INDEX idx_prd_scadenza ON public.piani_rientro_documenti(scadenza_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.piani_rientro_documenti TO authenticated;
GRANT ALL ON public.piani_rientro_documenti TO service_role;

ALTER TABLE public.piani_rientro_documenti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prd_select"
  ON public.piani_rientro_documenti FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.piani_rientro p
    WHERE p.id = piano_id AND public.user_can_access_cliente(p.cliente_id)
  ));

CREATE POLICY "prd_write"
  ON public.piani_rientro_documenti FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
  );

-- ---------- 3. piani_rientro_rate ----------
CREATE TABLE public.piani_rientro_rate (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  piano_id UUID NOT NULL REFERENCES public.piani_rientro(id) ON DELETE CASCADE,
  numero_rata SMALLINT NOT NULL,
  data_rata DATE NOT NULL,
  importo NUMERIC NOT NULL,
  stato TEXT NOT NULL DEFAULT 'da_pagare'
    CHECK (stato IN ('da_pagare', 'pagata', 'saltata')),
  data_pagamento_confermata DATE,
  note TEXT,
  reminder_inviato_il TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (piano_id, numero_rata)
);
CREATE INDEX idx_prr_piano ON public.piani_rientro_rate(piano_id);
CREATE INDEX idx_prr_data ON public.piani_rientro_rate(data_rata) WHERE stato = 'da_pagare';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.piani_rientro_rate TO authenticated;
GRANT ALL ON public.piani_rientro_rate TO service_role;

ALTER TABLE public.piani_rientro_rate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prr_select"
  ON public.piani_rientro_rate FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.piani_rientro p
    WHERE p.id = piano_id AND public.user_can_access_cliente(p.cliente_id)
  ));

CREATE POLICY "prr_write"
  ON public.piani_rientro_rate FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
  );

CREATE TRIGGER trg_piani_rientro_rate_updated
  BEFORE UPDATE ON public.piani_rientro_rate
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------- 4. Config ----------
INSERT INTO public.configurazioni (chiave, valore, descrizione) VALUES
  ('piano_rientro_giorni_anticipo_reminder', '3', 'Giorni di anticipo per invio email reminder rata piano di rientro'),
  ('piano_rientro_email_amministrazione', '', 'Email amministrazione destinataria dei reminder rata piano di rientro')
ON CONFLICT (chiave) DO NOTHING;

-- ---------- 5. Template email ----------
INSERT INTO public.template_email (nome, tipo, oggetto, corpo, attivo)
SELECT
  'Reminder rata piano di rientro',
  'reminder_rata_piano',
  'Reminder rata piano di rientro — {{ragione_sociale}} — rata {{numero_rata}}',
  '<p>Buongiorno,</p>
<p>segnaliamo che il cliente <strong>{{ragione_sociale}}</strong> ha in scadenza la rata <strong>n. {{numero_rata}}</strong> del piano di rientro:</p>
<ul>
  <li>Data rata: <strong>{{data_rata}}</strong></li>
  <li>Importo: <strong>{{importo_rata}}</strong></li>
  <li>Livello piano: {{livello_piano}}</li>
</ul>
<p>Riferimento piano: {{piano_id}}</p>
<p>Cordiali saluti,<br/>Sistema FidiManager</p>',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.template_email WHERE tipo = 'reminder_rata_piano');

-- ---------- 6. Estensione RPC scadenziario ----------
DROP FUNCTION IF EXISTS public.get_scadenziario_lista_paginata(
  text, uuid, text, text, text, boolean, boolean, text, numeric, boolean,
  integer, integer, text, text, integer, integer
);

CREATE OR REPLACE FUNCTION public.get_scadenziario_lista_paginata(
  p_search text DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_fascia text DEFAULT 'tutte',
  p_stato_blocco text DEFAULT 'tutti',
  p_stato_legale text DEFAULT 'tutti',
  p_escludi_bonifici boolean DEFAULT true,
  p_escludi_legale boolean DEFAULT true,
  p_avvisato text DEFAULT 'tutti',
  p_importo_min numeric DEFAULT 0,
  p_mostra_a_credito boolean DEFAULT false,
  p_anno_corrente integer DEFAULT NULL,
  p_anno_prec integer DEFAULT NULL,
  p_sort_by text DEFAULT 'tot_scaduto',
  p_sort_dir text DEFAULT 'desc',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS TABLE(
  cliente_id uuid, ragione_sociale text, codice_gestionale text,
  store_id uuid, store_nome text, bloccato boolean, ind_blocco integer,
  in_gestione_legale boolean, n_scadute integer, tot_scaduto numeric,
  n_a_scadere integer, tot_a_scadere numeric, prossima_scadenza date,
  max_gg_ritardo integer, scadute_ids uuid[], fascia text,
  fatturato_cur numeric, fatturato_prec numeric,
  avvisato_n integer, avvisato_ha_email boolean,
  avvisato_ultima_tipo text, avvisato_ultima_data timestamptz,
  ha_promessa boolean, data_promessa date,
  ha_piano_rientro boolean, piano_rientro_id uuid,
  piano_rate_pagate integer, piano_rate_totali integer,
  piano_prossima_rata_data date, piano_prossima_rata_importo numeric,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := CURRENT_DATE;
  v_offset int := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,25));
  v_limit int := GREATEST(1, COALESCE(p_page_size,25));
BEGIN
  RETURN QUERY
  WITH cls AS (
    SELECT s.id, s.cliente_id AS cli_id, s.importo_scadenza,
      public.is_anticipo(s.numero_documento) AS is_anticipo,
      s.data_scadenza, s.giorni_ritardo,
      CASE
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < v_today THEN 'scaduto'
        WHEN s.data_pagamento_effettiva IS NOT NULL THEN 'pagato'
        WHEN s.data_scadenza IS NOT NULL AND s.data_scadenza >= v_today THEN 'a_scadere'
        WHEN s.stato_contabile = 'Aperta' AND s.data_scadenza IS NULL THEN
          CASE WHEN COALESCE(s.giorni_ritardo, 0) > 0 THEN 'scaduto' ELSE 'a_scadere' END
        ELSE 'pagato'
      END AS cat
    FROM public.scadenze s
    WHERE (s.stato_contabile = 'Aperta' OR s.data_pagamento_effettiva IS NULL)
      AND (NOT p_escludi_bonifici OR upper(COALESCE(s.codice_pagamento, '')) <> 'BOS')
  ),
  agg AS (
    SELECT c.cli_id,
      COUNT(*) FILTER (WHERE c.cat = 'scaduto')::int AS n_scadute,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat='scaduto' AND NOT c.is_anticipo), 0) AS ssa,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat='scaduto' AND c.is_anticipo), 0) AS ant,
      COUNT(*) FILTER (WHERE c.cat = 'a_scadere')::int AS n_a_scadere,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat = 'a_scadere'), 0)::numeric AS tot_a_scadere,
      MIN(c.data_scadenza) FILTER (WHERE c.cat = 'a_scadere') AS prossima_scadenza,
      COALESCE(MAX(c.giorni_ritardo) FILTER (WHERE c.cat = 'scaduto'), 0)::int AS max_gg,
      COALESCE(ARRAY_AGG(c.id) FILTER (WHERE c.cat = 'scaduto'), ARRAY[]::uuid[]) AS scadute_ids
    FROM cls c GROUP BY c.cli_id
    HAVING COUNT(*) FILTER (WHERE c.cat = 'scaduto') > 0
  ),
  agg2 AS (
    SELECT a.cli_id, a.n_scadute, public.calcola_scaduto(a.ssa, a.ant) AS tot_scaduto,
      a.n_a_scadere, a.tot_a_scadere, a.prossima_scadenza, a.max_gg, a.scadute_ids FROM agg a
  ),
  avv AS (
    SELECT al.cli_id, COUNT(*)::int AS n_az,
      bool_or(al.tipo = 'email') AS ha_email,
      (ARRAY_AGG(al.tipo ORDER BY al.data_azione DESC))[1] AS ultima_tipo,
      MAX(al.data_azione) AS ultima_data
    FROM (
      SELECT DISTINCT a.id, a.cliente_id AS cli_id, a.tipo::text AS tipo, a.data_azione
      FROM public.azioni_recupero a
      JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
      JOIN public.scadenze s2 ON s2.id = ars.scadenza_id AND s2.stato_contabile = 'Aperta' AND s2.cliente_id = a.cliente_id
      WHERE a.tipo <> 'promemoria_scadenza'
    ) al GROUP BY al.cli_id
  ),
  prom AS (
    SELECT a.cliente_id AS cli_id, MAX(a.data_promessa_pagamento) AS data_promessa
    FROM public.azioni_recupero a
    WHERE a.esito = 'promessa_pagamento'
      AND a.data_promessa_pagamento IS NOT NULL
      AND a.data_promessa_pagamento >= v_today
    GROUP BY a.cliente_id
  ),
  piano_att AS (
    SELECT DISTINCT ON (p.cliente_id)
      p.cliente_id AS cli_id, p.id AS piano_id
    FROM public.piani_rientro p
    WHERE p.stato = 'attivo'
    ORDER BY p.cliente_id, p.created_at DESC
  ),
  piano_stats AS (
    SELECT pa.cli_id, pa.piano_id,
      (SELECT COUNT(*)::int FROM public.piani_rientro_rate r WHERE r.piano_id = pa.piano_id AND r.stato = 'pagata') AS rate_pagate,
      (SELECT COUNT(*)::int FROM public.piani_rientro_rate r WHERE r.piano_id = pa.piano_id) AS rate_totali,
      (SELECT r.data_rata FROM public.piani_rientro_rate r
        WHERE r.piano_id = pa.piano_id AND r.stato = 'da_pagare'
        ORDER BY r.data_rata ASC LIMIT 1) AS prossima_data,
      (SELECT r.importo FROM public.piani_rientro_rate r
        WHERE r.piano_id = pa.piano_id AND r.stato = 'da_pagare'
        ORDER BY r.data_rata ASC LIMIT 1) AS prossima_importo
    FROM piano_att pa
  ),
  fat AS (
    SELECT f.cliente_id AS cli_id,
      COALESCE(SUM(f.fatturato) FILTER (WHERE f.anno = p_anno_corrente), 0)::numeric AS cur,
      COALESCE(SUM(f.fatturato) FILTER (WHERE f.anno = p_anno_prec), 0)::numeric AS prev
    FROM public.fatturato_clienti f
    WHERE p_anno_corrente IS NOT NULL
      AND f.anno IN (p_anno_corrente, COALESCE(p_anno_prec, p_anno_corrente - 1))
    GROUP BY f.cliente_id
  ),
  joined AS (
    SELECT
      cl.id AS cli_id, cl.ragione_sociale, cl.codice_gestionale, cl.store_id, st.nome AS store_nome,
      COALESCE(cl.bloccato, false) AS bloccato, COALESCE(cl.ind_blocco, 0)::int AS ind_blocco,
      COALESCE(cl.in_gestione_legale,false) AS in_gestione_legale,
      ag2.n_scadute, ag2.tot_scaduto, ag2.n_a_scadere, ag2.tot_a_scadere,
      ag2.prossima_scadenza, ag2.max_gg AS max_gg_ritardo, ag2.scadute_ids,
      CASE WHEN ag2.max_gg <= 0 THEN NULL WHEN ag2.max_gg <= 30 THEN '0_30' WHEN ag2.max_gg <= 60 THEN '31_60' ELSE 'oltre_60' END AS fascia,
      COALESCE(fat.cur, 0) AS fatturato_cur, COALESCE(fat.prev, 0) AS fatturato_prec,
      COALESCE(avv.n_az, 0) AS avvisato_n, COALESCE(avv.ha_email, false) AS avvisato_ha_email,
      avv.ultima_tipo AS avvisato_ultima_tipo, avv.ultima_data AS avvisato_ultima_data,
      (prom.data_promessa IS NOT NULL) AS ha_promessa,
      prom.data_promessa AS data_promessa,
      (ps.piano_id IS NOT NULL) AS ha_piano_rientro,
      ps.piano_id AS piano_rientro_id,
      COALESCE(ps.rate_pagate, 0) AS piano_rate_pagate,
      COALESCE(ps.rate_totali, 0) AS piano_rate_totali,
      ps.prossima_data AS piano_prossima_rata_data,
      ps.prossima_importo AS piano_prossima_rata_importo
    FROM agg2 ag2
    JOIN public.clienti cl ON cl.id = ag2.cli_id
    LEFT JOIN public.stores st ON st.id = cl.store_id
    LEFT JOIN fat ON fat.cli_id = cl.id
    LEFT JOIN avv ON avv.cli_id = cl.id
    LEFT JOIN prom ON prom.cli_id = cl.id
    LEFT JOIN piano_stats ps ON ps.cli_id = cl.id
    WHERE public.user_can_access_cliente(cl.id)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_stato_blocco = 'tutti' OR (p_stato_blocco = 'bloccati' AND COALESCE(cl.bloccato,false) = true) OR (p_stato_blocco = 'non_bloccati' AND COALESCE(cl.bloccato,false) = false))
      AND (p_stato_legale = 'tutti' OR (p_stato_legale = 'in_legale' AND COALESCE(cl.in_gestione_legale,false) = true) OR (p_stato_legale = 'non_in_legale' AND COALESCE(cl.in_gestione_legale,false) = false))
      AND (NOT p_escludi_legale OR COALESCE(cl.in_gestione_legale,false) = false)
      AND (p_search IS NULL OR p_search = '' OR cl.ragione_sociale ILIKE '%' || p_search || '%' OR cl.codice_gestionale ILIKE '%' || p_search || '%')
  ),
  filtered AS (
    SELECT * FROM joined j
    WHERE (CASE WHEN j.tot_scaduto >= 0 THEN j.tot_scaduto >= COALESCE(p_importo_min, 0)
                WHEN p_mostra_a_credito THEN abs(j.tot_scaduto) >= COALESCE(p_importo_min, 0)
                ELSE false END)
      AND (p_fascia = 'tutte' OR (j.n_scadute > 0 AND j.fascia = p_fascia))
      AND (p_avvisato = 'tutti' OR (p_avvisato = 'con_azioni' AND j.avvisato_n > 0) OR (p_avvisato = 'senza_azioni' AND j.avvisato_n = 0))
  ),
  cnt AS (SELECT COUNT(*)::bigint AS total FROM filtered)
  SELECT
    f.cli_id, f.ragione_sociale, f.codice_gestionale, f.store_id, f.store_nome,
    f.bloccato, f.ind_blocco, f.in_gestione_legale,
    f.n_scadute, f.tot_scaduto, f.n_a_scadere, f.tot_a_scadere,
    f.prossima_scadenza, f.max_gg_ritardo, f.scadute_ids, f.fascia,
    f.fatturato_cur, f.fatturato_prec,
    f.avvisato_n, f.avvisato_ha_email, f.avvisato_ultima_tipo, f.avvisato_ultima_data,
    f.ha_promessa, f.data_promessa,
    f.ha_piano_rientro, f.piano_rientro_id,
    f.piano_rate_pagate, f.piano_rate_totali,
    f.piano_prossima_rata_data, f.piano_prossima_rata_importo,
    (SELECT total FROM cnt) AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN f.tot_scaduto >= 0 THEN 0 ELSE 1 END,
    CASE WHEN p_sort_by = 'tot_scaduto' AND p_sort_dir = 'asc'  THEN f.tot_scaduto END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'tot_scaduto' AND p_sort_dir = 'desc' THEN f.tot_scaduto END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'tot_a_scadere' AND p_sort_dir = 'asc'  THEN f.tot_a_scadere END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'tot_a_scadere' AND p_sort_dir = 'desc' THEN f.tot_a_scadere END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'max_gg' AND p_sort_dir = 'asc'  THEN f.max_gg_ritardo END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'max_gg' AND p_sort_dir = 'desc' THEN f.max_gg_ritardo END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'ragione_sociale' AND p_sort_dir = 'asc'  THEN f.ragione_sociale END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'ragione_sociale' AND p_sort_dir = 'desc' THEN f.ragione_sociale END DESC NULLS LAST,
    f.ragione_sociale ASC
  OFFSET v_offset LIMIT v_limit;
END;
$function$;
