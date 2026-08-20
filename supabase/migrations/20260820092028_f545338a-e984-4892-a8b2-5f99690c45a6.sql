DO $$ BEGIN
  CREATE TYPE public.stato_opportunita AS ENUM ('aperta','in_lavorazione','preventivo','vinta','persa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tipo_opportunita AS ENUM ('vendita','fornitura','preventivo','altro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.opportunita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titolo text NOT NULL,
  descrizione text,
  tipo public.tipo_opportunita NOT NULL DEFAULT 'vendita',
  stato public.stato_opportunita NOT NULL DEFAULT 'aperta',
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.lead(id) ON DELETE SET NULL,
  cantiere_id uuid REFERENCES public.cantieri(id) ON DELETE SET NULL,
  agente_codice text,
  assegnato_a uuid,
  store_id uuid REFERENCES public.stores(id),
  valore_stimato numeric,
  probabilita int,
  data_prevista_chiusura date,
  data_chiusura date,
  motivo_perdita text,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opportunita_soggetto_check CHECK (cliente_id IS NOT NULL OR lead_id IS NOT NULL),
  CONSTRAINT opportunita_probabilita_check CHECK (probabilita IS NULL OR (probabilita >= 0 AND probabilita <= 100))
);

CREATE INDEX idx_opportunita_cliente ON public.opportunita(cliente_id);
CREATE INDEX idx_opportunita_lead ON public.opportunita(lead_id);
CREATE INDEX idx_opportunita_cantiere ON public.opportunita(cantiere_id);
CREATE INDEX idx_opportunita_agente ON public.opportunita(agente_codice);
CREATE INDEX idx_opportunita_stato ON public.opportunita(stato);
CREATE INDEX idx_opportunita_store ON public.opportunita(store_id);

CREATE TRIGGER trg_opportunita_updated_at
BEFORE UPDATE ON public.opportunita
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunita TO authenticated;
GRANT ALL ON public.opportunita TO service_role;

ALTER TABLE public.opportunita ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Opportunita: select per ruolo" ON public.opportunita
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND store_id IS NOT NULL AND store_id IN (
        SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND agente_codice IS NOT NULL AND agente_codice IN (
        SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
);

CREATE POLICY "Opportunita: insert per ruolo" ON public.opportunita
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND store_id IS NOT NULL AND store_id IN (
        SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND agente_codice IS NOT NULL AND agente_codice IN (
        SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
);

CREATE POLICY "Opportunita: update per ruolo" ON public.opportunita
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND store_id IS NOT NULL AND store_id IN (
        SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND agente_codice IS NOT NULL AND agente_codice IN (
        SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND store_id IS NOT NULL AND store_id IN (
        SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND agente_codice IS NOT NULL AND agente_codice IN (
        SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
);

CREATE POLICY "Opportunita: delete solo direzionali" ON public.opportunita
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
);