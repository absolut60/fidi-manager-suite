DO $$ BEGIN
  CREATE TYPE public.tipo_attivita_commerciale AS ENUM ('appuntamento','visita','chiamata','email','preventivo_inviato','nota','altro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.attivita_commerciale (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunita_id uuid REFERENCES public.opportunita(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.lead(id) ON DELETE SET NULL,
  tipo public.tipo_attivita_commerciale NOT NULL DEFAULT 'appuntamento',
  titolo text NOT NULL,
  descrizione text,
  data_pianificata timestamptz,
  data_svolgimento timestamptz,
  completata boolean NOT NULL DEFAULT false,
  esito text,
  agente_codice text,
  operatore_id uuid DEFAULT auth.uid(),
  store_id uuid REFERENCES public.stores(id),
  luogo text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attivita_commerciale_soggetto_check CHECK (opportunita_id IS NOT NULL OR cliente_id IS NOT NULL OR lead_id IS NOT NULL)
);

CREATE INDEX idx_attivita_comm_opportunita ON public.attivita_commerciale(opportunita_id);
CREATE INDEX idx_attivita_comm_cliente ON public.attivita_commerciale(cliente_id);
CREATE INDEX idx_attivita_comm_lead ON public.attivita_commerciale(lead_id);
CREATE INDEX idx_attivita_comm_agente ON public.attivita_commerciale(agente_codice);
CREATE INDEX idx_attivita_comm_data_pianificata ON public.attivita_commerciale(data_pianificata);
CREATE INDEX idx_attivita_comm_completata ON public.attivita_commerciale(completata);

CREATE TRIGGER trg_attivita_commerciale_updated_at
BEFORE UPDATE ON public.attivita_commerciale
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attivita_commerciale TO authenticated;
GRANT ALL ON public.attivita_commerciale TO service_role;

ALTER TABLE public.attivita_commerciale ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attivita commerciale: select per ruolo"
ON public.attivita_commerciale FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND store_id IS NOT NULL AND store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND agente_codice IS NOT NULL AND agente_codice IN (SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
);

CREATE POLICY "Attivita commerciale: insert per ruolo"
ON public.attivita_commerciale FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND store_id IS NOT NULL AND store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND agente_codice IS NOT NULL AND agente_codice IN (SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
);

CREATE POLICY "Attivita commerciale: update per ruolo"
ON public.attivita_commerciale FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND store_id IS NOT NULL AND store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND agente_codice IS NOT NULL AND agente_codice IN (SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND store_id IS NOT NULL AND store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND agente_codice IS NOT NULL AND agente_codice IN (SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
);

CREATE POLICY "Attivita commerciale: delete solo direzionali"
ON public.attivita_commerciale FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role)
);