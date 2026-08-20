-- 1) articoli
CREATE TABLE public.articoli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_gamma text,
  cod_fornitore text,
  fornitore_id uuid REFERENCES public.fornitori(id),
  descrizione text NOT NULL,
  um text,
  categoria text,
  tipologia text,
  componente text,
  peso_unit numeric,
  qta_cliente numeric,
  qta_fornitore numeric,
  stato public.stato_articolo NOT NULL DEFAULT 'potenziale',
  note text,
  note_acquisto text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_articoli_fornitore ON public.articoli(fornitore_id);
CREATE INDEX idx_articoli_categoria ON public.articoli(categoria);
CREATE UNIQUE INDEX uq_articoli_fornitore_cod ON public.articoli(fornitore_id, cod_fornitore)
  WHERE cod_fornitore IS NOT NULL AND fornitore_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articoli TO authenticated;
GRANT ALL ON public.articoli TO service_role;
ALTER TABLE public.articoli ENABLE ROW LEVEL SECURITY;
CREATE POLICY "articoli amministratore all" ON public.articoli
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role));
CREATE TRIGGER trg_articoli_updated_at BEFORE UPDATE ON public.articoli
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2) listini_acquisto
CREATE TABLE public.listini_acquisto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  articolo_id uuid NOT NULL REFERENCES public.articoli(id) ON DELETE CASCADE,
  listino_for text,
  sc1 numeric, sc2 numeric, sc3 numeric, sc4 numeric, sc5 numeric,
  trasporto_eur numeric,
  trasporto_perc numeric,
  prezzo_scontato numeric,
  costo_netto numeric,
  data_validita date,
  condizioni text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_listini_acquisto_articolo ON public.listini_acquisto(articolo_id);
CREATE INDEX idx_listini_acquisto_articolo_data ON public.listini_acquisto(articolo_id, data_validita);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listini_acquisto TO authenticated;
GRANT ALL ON public.listini_acquisto TO service_role;
ALTER TABLE public.listini_acquisto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listini_acquisto amministratore all" ON public.listini_acquisto
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role));
CREATE TRIGGER trg_listini_acquisto_updated_at BEFORE UPDATE ON public.listini_acquisto
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3) listini_vendita
CREATE TABLE public.listini_vendita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  articolo_id uuid NOT NULL REFERENCES public.articoli(id) ON DELETE CASCADE,
  fascia public.fascia_listino NOT NULL,
  ricarico numeric,
  prezzo numeric,
  margine numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (articolo_id, fascia)
);
CREATE INDEX idx_listini_vendita_articolo ON public.listini_vendita(articolo_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listini_vendita TO authenticated;
GRANT ALL ON public.listini_vendita TO service_role;
ALTER TABLE public.listini_vendita ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listini_vendita amministratore all" ON public.listini_vendita
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role));
CREATE TRIGGER trg_listini_vendita_updated_at BEFORE UPDATE ON public.listini_vendita
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4) matrice_ricarichi
CREATE TABLE public.matrice_ricarichi (
  categoria text PRIMARY KEY,
  descrizione_categoria text,
  macro_gruppo text,
  ricarico_a numeric,
  ricarico_b numeric,
  ricarico_c numeric,
  ricarico_soci numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matrice_ricarichi TO authenticated;
GRANT ALL ON public.matrice_ricarichi TO service_role;
ALTER TABLE public.matrice_ricarichi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matrice_ricarichi amministratore all" ON public.matrice_ricarichi
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role));
CREATE TRIGGER trg_matrice_ricarichi_updated_at BEFORE UPDATE ON public.matrice_ricarichi
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5) allegati_articolo
CREATE TABLE public.allegati_articolo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  articolo_id uuid NOT NULL REFERENCES public.articoli(id) ON DELETE CASCADE,
  categoria public.categoria_allegato_articolo NOT NULL DEFAULT 'altro',
  nome_file text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  dimensione_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_allegati_articolo_articolo ON public.allegati_articolo(articolo_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allegati_articolo TO authenticated;
GRANT ALL ON public.allegati_articolo TO service_role;
ALTER TABLE public.allegati_articolo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allegati_articolo amministratore all" ON public.allegati_articolo
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role));