CREATE TYPE public.eventi_partecipante_stato AS ENUM ('atteso','confermato','presentato','no_show');

CREATE TABLE public.eventi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  data_evento date,
  luogo text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventi TO authenticated;
GRANT ALL ON public.eventi TO service_role;
ALTER TABLE public.eventi ENABLE ROW LEVEL SECURITY;

CREATE POLICY eventi_select ON public.eventi FOR SELECT TO authenticated USING (can_access_lead(auth.uid()));
CREATE POLICY eventi_insert ON public.eventi FOR INSERT TO authenticated WITH CHECK (can_access_lead(auth.uid()));
CREATE POLICY eventi_update ON public.eventi FOR UPDATE TO authenticated USING (can_access_lead(auth.uid())) WITH CHECK (can_access_lead(auth.uid()));
CREATE POLICY eventi_delete ON public.eventi FOR DELETE TO authenticated USING (can_access_lead(auth.uid()));

CREATE TRIGGER trg_eventi_updated_at BEFORE UPDATE ON public.eventi FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.eventi_partecipanti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.eventi(id) ON DELETE CASCADE,
  stato public.eventi_partecipante_stato NOT NULL DEFAULT 'atteso',
  lead_id uuid REFERENCES public.lead(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  contatto_id uuid REFERENCES public.contatti(id) ON DELETE SET NULL,
  nome text,
  cognome text,
  ragione_sociale text,
  partita_iva text,
  codice_fiscale text,
  email text,
  telefono text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventi_partecipanti TO authenticated;
GRANT ALL ON public.eventi_partecipanti TO service_role;
ALTER TABLE public.eventi_partecipanti ENABLE ROW LEVEL SECURITY;

CREATE POLICY eventi_partecipanti_select ON public.eventi_partecipanti FOR SELECT TO authenticated USING (can_access_lead(auth.uid()));
CREATE POLICY eventi_partecipanti_insert ON public.eventi_partecipanti FOR INSERT TO authenticated WITH CHECK (can_access_lead(auth.uid()));
CREATE POLICY eventi_partecipanti_update ON public.eventi_partecipanti FOR UPDATE TO authenticated USING (can_access_lead(auth.uid())) WITH CHECK (can_access_lead(auth.uid()));
CREATE POLICY eventi_partecipanti_delete ON public.eventi_partecipanti FOR DELETE TO authenticated USING (can_access_lead(auth.uid()));

CREATE TRIGGER trg_eventi_partecipanti_updated_at BEFORE UPDATE ON public.eventi_partecipanti FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_eventi_partecipanti_evento ON public.eventi_partecipanti(evento_id);
CREATE INDEX idx_eventi_partecipanti_lead ON public.eventi_partecipanti(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_eventi_partecipanti_cliente ON public.eventi_partecipanti(cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX idx_eventi_partecipanti_contatto ON public.eventi_partecipanti(contatto_id) WHERE contatto_id IS NOT NULL;
CREATE INDEX idx_eventi_partecipanti_piva ON public.eventi_partecipanti(partita_iva) WHERE partita_iva IS NOT NULL;
CREATE INDEX idx_eventi_partecipanti_cf ON public.eventi_partecipanti(codice_fiscale) WHERE codice_fiscale IS NOT NULL;