CREATE TABLE public.campagne_email_destinatari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campagna_id uuid NOT NULL REFERENCES public.campagne_email_marketing(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  contatto_id uuid REFERENCES public.contatti(id) ON DELETE SET NULL,
  tipo_destinatario text NOT NULL CHECK (tipo_destinatario IN ('aziendale','contatto')),
  email text NOT NULL,
  nome_riferimento text,
  stato_invio text NOT NULL DEFAULT 'da_inviare' CHECK (stato_invio IN ('da_inviare','inviato','fallito','saltato')),
  aggiunto_da uuid,
  aggiunto_il timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campagne_email_destinatari_uniq UNIQUE (campagna_id, email)
);

CREATE INDEX idx_campagne_email_destinatari_campagna ON public.campagne_email_destinatari(campagna_id);
CREATE INDEX idx_campagne_email_destinatari_email ON public.campagne_email_destinatari(email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campagne_email_destinatari TO authenticated;
GRANT ALL ON public.campagne_email_destinatari TO service_role;

ALTER TABLE public.campagne_email_destinatari ENABLE ROW LEVEL SECURITY;

CREATE POLICY campagne_email_destinatari_all ON public.campagne_email_destinatari
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  OR public.has_role(auth.uid(), 'direzione'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  OR public.has_role(auth.uid(), 'direzione'::app_role)
);