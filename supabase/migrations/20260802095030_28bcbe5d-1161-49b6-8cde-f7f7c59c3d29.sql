CREATE TYPE public.lead_stato AS ENUM ('nuovo','assegnato','in_lavorazione','qualificato','convertito','perso');
CREATE TYPE public.lead_tipo AS ENUM ('potenziale_cliente','richiesta_specifica');
CREATE TYPE public.lead_fonte AS ENUM ('web','hubspot','manuale','fiera','evento','altro');
CREATE TYPE public.lead_priorita AS ENUM ('alta','media','bassa');
CREATE TYPE public.lead_richiesta_tipo AS ENUM ('preventivo','ristrutturazione','info_tecnica','info_commerciale');
CREATE TYPE public.lead_richiesta_stato AS ENUM ('aperta','in_lavorazione','evasa','respinta');

CREATE OR REPLACE FUNCTION public.can_access_lead(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('amministratore','amministrazione','direzione','marketing')
  )
$$;

CREATE TABLE public.lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ragione_sociale text,
  nome text,
  cognome text,
  tipo_soggetto text,
  partita_iva text,
  codice_fiscale text,
  email text,
  telefono text,
  cellulare text,
  indirizzo text,
  citta text,
  cap text,
  provincia text,
  fonte public.lead_fonte NOT NULL DEFAULT 'manuale',
  fonte_dettaglio text,
  hubspot_id text,
  stato public.lead_stato NOT NULL DEFAULT 'nuovo',
  tipo_lead public.lead_tipo NOT NULL DEFAULT 'potenziale_cliente',
  priorita public.lead_priorita NOT NULL DEFAULT 'media',
  store_id uuid REFERENCES public.stores(id),
  agente_codice text,
  assegnato_a uuid,
  assegnato_il timestamptz,
  prossima_azione_il date,
  prossima_azione_nota text,
  prossima_azione_tipo text,
  cliente_id uuid REFERENCES public.clienti(id),
  convertito_il timestamptz,
  convertito_da uuid,
  motivo_perdita text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead TO authenticated;
GRANT ALL ON public.lead TO service_role;
ALTER TABLE public.lead ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_select" ON public.lead FOR SELECT TO authenticated USING (public.can_access_lead(auth.uid()));
CREATE POLICY "lead_insert" ON public.lead FOR INSERT TO authenticated WITH CHECK (public.can_access_lead(auth.uid()));
CREATE POLICY "lead_update" ON public.lead FOR UPDATE TO authenticated USING (public.can_access_lead(auth.uid())) WITH CHECK (public.can_access_lead(auth.uid()));
CREATE POLICY "lead_delete" ON public.lead FOR DELETE TO authenticated USING (public.can_access_lead(auth.uid()));

CREATE INDEX idx_lead_stato ON public.lead(stato);
CREATE INDEX idx_lead_fonte ON public.lead(fonte);
CREATE INDEX idx_lead_assegnato_a ON public.lead(assegnato_a);
CREATE INDEX idx_lead_cliente_id ON public.lead(cliente_id);
CREATE UNIQUE INDEX idx_lead_hubspot_id ON public.lead(hubspot_id) WHERE hubspot_id IS NOT NULL;

CREATE TRIGGER trg_lead_updated_at BEFORE UPDATE ON public.lead
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.lead_richieste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.lead(id) ON DELETE CASCADE,
  tipo public.lead_richiesta_tipo NOT NULL,
  oggetto text,
  descrizione text,
  stato public.lead_richiesta_stato NOT NULL DEFAULT 'aperta',
  assegnato_a uuid,
  importo_stimato numeric,
  esito text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_richieste TO authenticated;
GRANT ALL ON public.lead_richieste TO service_role;
ALTER TABLE public.lead_richieste ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_richieste_select" ON public.lead_richieste FOR SELECT TO authenticated USING (public.can_access_lead(auth.uid()));
CREATE POLICY "lead_richieste_insert" ON public.lead_richieste FOR INSERT TO authenticated WITH CHECK (public.can_access_lead(auth.uid()));
CREATE POLICY "lead_richieste_update" ON public.lead_richieste FOR UPDATE TO authenticated USING (public.can_access_lead(auth.uid())) WITH CHECK (public.can_access_lead(auth.uid()));
CREATE POLICY "lead_richieste_delete" ON public.lead_richieste FOR DELETE TO authenticated USING (public.can_access_lead(auth.uid()));

CREATE INDEX idx_lead_richieste_lead_id ON public.lead_richieste(lead_id);

CREATE TRIGGER trg_lead_richieste_updated_at BEFORE UPDATE ON public.lead_richieste
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.lead_storico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.lead(id) ON DELETE CASCADE,
  stato_da text,
  stato_a text,
  operatore_id uuid,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.lead_storico TO authenticated;
GRANT ALL ON public.lead_storico TO service_role;
ALTER TABLE public.lead_storico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_storico_select" ON public.lead_storico FOR SELECT TO authenticated USING (public.can_access_lead(auth.uid()));
CREATE POLICY "lead_storico_insert" ON public.lead_storico FOR INSERT TO authenticated WITH CHECK (public.can_access_lead(auth.uid()));

CREATE INDEX idx_lead_storico_lead_id ON public.lead_storico(lead_id);

ALTER TABLE public.contatti ADD COLUMN lead_id uuid REFERENCES public.lead(id) ON DELETE SET NULL;
ALTER TABLE public.cantieri ADD COLUMN lead_id uuid REFERENCES public.lead(id) ON DELETE SET NULL;
CREATE INDEX idx_contatti_lead_id ON public.contatti(lead_id);
CREATE INDEX idx_cantieri_lead_id ON public.cantieri(lead_id);