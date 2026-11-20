CREATE TABLE public.kit_famiglie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linea public.linea_preventivo NOT NULL,
  codice text NOT NULL,
  nome text NOT NULL,
  ordine integer NOT NULL DEFAULT 0,
  attiva boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kit_famiglie_linea_codice_key UNIQUE (linea, codice)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kit_famiglie TO authenticated;
GRANT ALL ON public.kit_famiglie TO service_role;
ALTER TABLE public.kit_famiglie ENABLE ROW LEVEL SECURITY;
CREATE POLICY kit_famiglie_prev_select ON public.kit_famiglie FOR SELECT TO authenticated
  USING ((SELECT public.auth_consulta_preventivi()));
CREATE POLICY kit_famiglie_prev_write ON public.kit_famiglie FOR ALL TO authenticated
  USING ((SELECT public.auth_puo_gestire_anagrafiche_prev()))
  WITH CHECK ((SELECT public.auth_puo_gestire_anagrafiche_prev()));
CREATE POLICY "Secondo fattore (FM44)" ON public.kit_famiglie AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE TRIGGER update_kit_famiglie_updated_at BEFORE UPDATE ON public.kit_famiglie
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Backfill della tassonomia enum esistente nel nuovo livello famiglia per linea.
INSERT INTO public.kit_famiglie (linea, codice, nome, ordine)
SELECT 'sistema_made'::public.linea_preventivo, famiglia::text,
  CASE famiglia::text
    WHEN 'PARETE' THEN 'Parete'
    WHEN 'CONTROPARETE' THEN 'Controparete'
    WHEN 'CTS_CARTONGESSO' THEN 'CTS cartongesso'
    WHEN 'CTS_MODULARE' THEN 'CTS modulare'
    WHEN 'VELETTA' THEN 'Veletta'
    WHEN 'ALTRO' THEN 'Altro'
  END, posizione::integer - 1
FROM unnest(enum_range(NULL::public.kit_famiglia)) WITH ORDINALITY AS f(famiglia, posizione);

ALTER TABLE public.kit
  ADD COLUMN codice text,
  ADD COLUMN linea public.linea_preventivo NOT NULL DEFAULT 'sistema_made',
  ADD COLUMN famiglia_id uuid REFERENCES public.kit_famiglie(id),
  ADD COLUMN specifiche jsonb NOT NULL DEFAULT '{}';

-- Il backfill non modifica le date dei record attuali.
ALTER TABLE public.kit DISABLE TRIGGER update_kit_updated_at;
WITH progressivi AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS numero FROM public.kit
)
UPDATE public.kit k SET
  codice = 'PROVA-' || p.numero::text,
  famiglia_id = f.id,
  specifiche = jsonb_strip_nulls(jsonb_build_object(
    'tipo_struttura', k.tipo_struttura,
    'spessore_mm', k.spessore,
    'h_max_m', k.h_max,
    'passo', k.passo,
    'passo_um', k.passo_um,
    'isolante', k.isolante
  ))
FROM progressivi p, public.kit_famiglie f
WHERE p.id = k.id AND f.linea = 'sistema_made' AND f.codice = k.famiglia::text;
ALTER TABLE public.kit ENABLE TRIGGER update_kit_updated_at;
-- Codice tecnico transitorio per gli INSERT della schermata attuale che omettono codice.
ALTER TABLE public.kit ALTER COLUMN codice SET DEFAULT ('LEGACY-' || gen_random_uuid()::text);
ALTER TABLE public.kit ALTER COLUMN codice SET NOT NULL;
ALTER TABLE public.kit ADD CONSTRAINT kit_codice_key UNIQUE (codice);
CREATE INDEX kit_famiglia_id_idx ON public.kit (famiglia_id);

ALTER TABLE public.kit_componenti
  ADD COLUMN articolo_codice text,
  ADD COLUMN descrizione text,
  ADD COLUMN um text,
  ADD COLUMN codice_articolo_fornitore text,
  ADD COLUMN fornitore_id uuid REFERENCES public.fornitori(id) ON DELETE SET NULL,
  ADD COLUMN marca text,
  ADD COLUMN costo numeric,
  ADD COLUMN listino_fornitore numeric,
  ADD COLUMN note text;
ALTER TABLE public.kit_componenti DISABLE TRIGGER update_kit_componenti_updated_at;
UPDATE public.kit_componenti c SET
  articolo_codice = g.codice,
  codice_articolo_fornitore = CASE WHEN g.codice IS NULL THEN COALESCE(NULLIF(a.cod_gamma, ''), a.cod_fornitore) END,
  descrizione = CASE WHEN g.codice IS NULL THEN a.descrizione END,
  um = CASE WHEN g.codice IS NULL THEN a.um END
FROM public.articoli a LEFT JOIN public.articoli_gamma g ON g.codice = a.cod_gamma
WHERE a.id = c.articolo_id;
ALTER TABLE public.kit_componenti ENABLE TRIGGER update_kit_componenti_updated_at;
CREATE INDEX kit_componenti_articolo_codice_idx ON public.kit_componenti (articolo_codice);
CREATE INDEX kit_componenti_fornitore_id_idx ON public.kit_componenti (fornitore_id);
COMMENT ON COLUMN public.kit_componenti.incidenza IS 'Quantità articolo per una unità base del kit; se esplicita prevale sul driver, anche a zero.';
COMMENT ON COLUMN public.kit_componenti.articolo_codice IS 'Codice del catalogo Gamma reale (articoli_gamma.codice); se assente il componente è manuale.';
COMMENT ON COLUMN public.kit.specifiche IS 'Specifiche tecniche definite dal catalogo linee-preventivo; spessore_mm e h_max_m conservano le unità dei campi storici.';