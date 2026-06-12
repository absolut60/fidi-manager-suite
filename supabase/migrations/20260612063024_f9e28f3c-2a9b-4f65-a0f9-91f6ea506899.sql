
-- 1. azioni_recupero
CREATE TABLE public.azioni_recupero (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  operatore_id uuid REFERENCES auth.users(id),
  tipo text NOT NULL CHECK (tipo IN ('email','telefonata','promemoria','nota','lettera')),
  esito text NOT NULL DEFAULT 'da_fare' CHECK (esito IN ('da_fare','fatto','nessuna_risposta','promessa_pagamento','contestazione','pagato')),
  data_azione timestamptz NOT NULL DEFAULT now(),
  data_promessa_pagamento date,
  importo_riferimento numeric,
  note text,
  email_log_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.azioni_recupero TO authenticated;
GRANT ALL ON public.azioni_recupero TO service_role;

ALTER TABLE public.azioni_recupero ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Direzione/Amm gestiscono azioni"
  ON public.azioni_recupero FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  );

CREATE POLICY "Store manager vede azioni dei suoi clienti"
  ON public.azioni_recupero FOR SELECT TO authenticated
  USING (public.user_can_access_cliente(cliente_id));

CREATE POLICY "Store manager inserisce azioni per suoi clienti"
  ON public.azioni_recupero FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_cliente(cliente_id));

CREATE POLICY "Store manager aggiorna azioni dei suoi clienti"
  ON public.azioni_recupero FOR UPDATE TO authenticated
  USING (public.user_can_access_cliente(cliente_id))
  WITH CHECK (public.user_can_access_cliente(cliente_id));

CREATE POLICY "Store manager elimina azioni dei suoi clienti"
  ON public.azioni_recupero FOR DELETE TO authenticated
  USING (public.user_can_access_cliente(cliente_id));

-- 2. azioni_recupero_scadenze
CREATE TABLE public.azioni_recupero_scadenze (
  azione_id uuid NOT NULL REFERENCES public.azioni_recupero(id) ON DELETE CASCADE,
  scadenza_id uuid NOT NULL REFERENCES public.scadenze(id) ON DELETE CASCADE,
  PRIMARY KEY (azione_id, scadenza_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.azioni_recupero_scadenze TO authenticated;
GRANT ALL ON public.azioni_recupero_scadenze TO service_role;

ALTER TABLE public.azioni_recupero_scadenze ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ponte azione-scadenza eredita visibilità"
  ON public.azioni_recupero_scadenze FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.azioni_recupero a WHERE a.id = azione_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.azioni_recupero a WHERE a.id = azione_id)
  );

-- 3. template_email
CREATE TABLE public.template_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  oggetto text NOT NULL,
  corpo text NOT NULL,
  tipo text NOT NULL DEFAULT 'libero' CHECK (tipo IN ('sollecito_1','sollecito_2','messa_in_mora','libero')),
  attivo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_email TO authenticated;
GRANT ALL ON public.template_email TO service_role;

ALTER TABLE public.template_email ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura template a tutti gli autenticati"
  ON public.template_email FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Solo Admin/Direzione/Amm modificano template"
  ON public.template_email FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  );

CREATE POLICY "Solo Admin/Direzione/Amm aggiornano template"
  ON public.template_email FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  );

CREATE POLICY "Solo Admin/Direzione/Amm eliminano template"
  ON public.template_email FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  );

-- 4. Indici
CREATE INDEX idx_azioni_cliente ON public.azioni_recupero (cliente_id);
CREATE INDEX idx_azioni_da_fare ON public.azioni_recupero (data_azione) WHERE esito = 'da_fare';
CREATE INDEX idx_azioni_esito ON public.azioni_recupero (esito);
CREATE INDEX idx_azioni_operatore ON public.azioni_recupero (operatore_id);

-- 5. Trigger updated_at (riusa public.update_updated_at esistente)
CREATE TRIGGER trg_azioni_recupero_updated_at
  BEFORE UPDATE ON public.azioni_recupero
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_template_email_updated_at
  BEFORE UPDATE ON public.template_email
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
