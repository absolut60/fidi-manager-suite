CREATE TABLE public.attivita_fornitore (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornitore_id uuid NOT NULL REFERENCES public.fornitori(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('email','lettera','telefonata','incontro','nota','altro')),
  origine text NOT NULL DEFAULT 'manuale' CHECK (origine IN ('manuale','invio')),
  data_attivita timestamptz NOT NULL DEFAULT now(),
  oggetto text,
  corpo text,
  esito text,
  contatto_id uuid REFERENCES public.contatti(id) ON DELETE SET NULL,
  destinatari text[],
  cc text[],
  ccn text[],
  message_id text,
  stato text NOT NULL DEFAULT 'registrata' CHECK (stato IN ('registrata','in_invio','inviata','errore')),
  errore text,
  chiave_invio uuid UNIQUE,
  creato_da uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attivita_fornitore_fornitore_data_idx ON public.attivita_fornitore (fornitore_id, data_attivita DESC);
CREATE TRIGGER attivita_fornitore_updated_at BEFORE UPDATE ON public.attivita_fornitore
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attivita_fornitore TO authenticated;
GRANT ALL ON public.attivita_fornitore TO service_role;
ALTER TABLE public.attivita_fornitore ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Secondo fattore (FM44)" ON public.attivita_fornitore AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY attivita_fornitore_select ON public.attivita_fornitore FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_accesso_fornitori()));
CREATE POLICY attivita_fornitore_insert ON public.attivita_fornitore FOR INSERT TO authenticated
  WITH CHECK (origine = 'manuale' AND stato = 'registrata' AND chiave_invio IS NULL
    AND creato_da = (SELECT auth.uid()) AND (SELECT public.auth_puo_gestire_fornitori()));
CREATE POLICY attivita_fornitore_update ON public.attivita_fornitore FOR UPDATE TO authenticated
  USING (origine = 'manuale' AND (SELECT public.auth_puo_gestire_fornitori()))
  WITH CHECK (origine = 'manuale' AND stato = 'registrata' AND chiave_invio IS NULL AND (SELECT public.auth_puo_gestire_fornitori()));
CREATE POLICY attivita_fornitore_delete ON public.attivita_fornitore FOR DELETE TO authenticated
  USING (origine = 'manuale' AND (SELECT public.auth_puo_gestire_fornitori()));

COMMENT ON TABLE public.attivita_fornitore IS 'FM62 G2: storico invii (origine=invio, scritti solo dal server) e attivita manuali del fornitore; separata da azioni_recupero e attivita_commerciale.';