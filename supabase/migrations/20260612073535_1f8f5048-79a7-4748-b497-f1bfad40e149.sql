
-- 1) campagne_sollecito
CREATE TABLE public.campagne_sollecito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operatore_id uuid REFERENCES auth.users(id),
  template_id uuid REFERENCES public.template_email(id),
  stato text NOT NULL DEFAULT 'in_coda'
    CHECK (stato IN ('in_coda','in_corso','completata','completata_con_errori','annullata')),
  totale_destinatari int NOT NULL DEFAULT 0,
  inviati int NOT NULL DEFAULT 0,
  saltati int NOT NULL DEFAULT 0,
  falliti int NOT NULL DEFAULT 0,
  preferenza_indirizzo text NOT NULL DEFAULT 'email'
    CHECK (preferenza_indirizzo IN ('email','pec')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completata_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campagne_sollecito TO authenticated;
GRANT ALL ON public.campagne_sollecito TO service_role;

ALTER TABLE public.campagne_sollecito ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Direzione/Amm gestiscono campagne"
  ON public.campagne_sollecito FOR ALL
  TO authenticated
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

CREATE POLICY "Store manager vede sue campagne"
  ON public.campagne_sollecito FOR SELECT
  TO authenticated
  USING (operatore_id = auth.uid());

CREATE POLICY "Store manager crea sue campagne"
  ON public.campagne_sollecito FOR INSERT
  TO authenticated
  WITH CHECK (operatore_id = auth.uid());

CREATE POLICY "Store manager aggiorna sue campagne"
  ON public.campagne_sollecito FOR UPDATE
  TO authenticated
  USING (operatore_id = auth.uid())
  WITH CHECK (operatore_id = auth.uid());

CREATE POLICY "Store manager elimina sue campagne"
  ON public.campagne_sollecito FOR DELETE
  TO authenticated
  USING (operatore_id = auth.uid());

CREATE TRIGGER trg_campagne_sollecito_updated_at
  BEFORE UPDATE ON public.campagne_sollecito
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2) campagne_sollecito_destinatari
CREATE TABLE public.campagne_sollecito_destinatari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campagna_id uuid NOT NULL REFERENCES public.campagne_sollecito(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  indirizzo_usato text,
  stato text NOT NULL DEFAULT 'da_inviare'
    CHECK (stato IN ('da_inviare','inviato','saltato_no_indirizzo','fallito')),
  errore text,
  azione_id uuid REFERENCES public.azioni_recupero(id),
  importo_riferimento numeric,
  inviato_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campagne_sollecito_destinatari TO authenticated;
GRANT ALL ON public.campagne_sollecito_destinatari TO service_role;

ALTER TABLE public.campagne_sollecito_destinatari ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Direzione/Amm gestiscono destinatari"
  ON public.campagne_sollecito_destinatari FOR ALL
  TO authenticated
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

CREATE POLICY "Store manager vede destinatari suoi clienti"
  ON public.campagne_sollecito_destinatari FOR SELECT
  TO authenticated
  USING (public.user_can_access_cliente(cliente_id));

CREATE POLICY "Store manager inserisce destinatari suoi clienti"
  ON public.campagne_sollecito_destinatari FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_cliente(cliente_id));

CREATE POLICY "Store manager aggiorna destinatari suoi clienti"
  ON public.campagne_sollecito_destinatari FOR UPDATE
  TO authenticated
  USING (public.user_can_access_cliente(cliente_id))
  WITH CHECK (public.user_can_access_cliente(cliente_id));

CREATE POLICY "Store manager elimina destinatari suoi clienti"
  ON public.campagne_sollecito_destinatari FOR DELETE
  TO authenticated
  USING (public.user_can_access_cliente(cliente_id));

-- 3) Indici
CREATE INDEX idx_camp_dest_campagna ON public.campagne_sollecito_destinatari (campagna_id);
CREATE INDEX idx_camp_dest_stato ON public.campagne_sollecito_destinatari (campagna_id, stato);
CREATE INDEX idx_camp_dest_cliente ON public.campagne_sollecito_destinatari (cliente_id);
CREATE INDEX idx_campagne_operatore ON public.campagne_sollecito (operatore_id);
