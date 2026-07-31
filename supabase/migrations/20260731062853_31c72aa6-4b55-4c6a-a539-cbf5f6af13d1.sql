CREATE TABLE public.campagne_email_marketing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  oggetto text NOT NULL,
  corpo_html text NOT NULL DEFAULT '',
  stato text NOT NULL DEFAULT 'bozza',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campagne_email_marketing_stato_chk CHECK (stato IN ('bozza','pronta'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campagne_email_marketing TO authenticated;
GRANT ALL ON public.campagne_email_marketing TO service_role;

ALTER TABLE public.campagne_email_marketing ENABLE ROW LEVEL SECURITY;

CREATE POLICY campagne_email_marketing_all ON public.campagne_email_marketing
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

CREATE TRIGGER update_campagne_email_marketing_updated_at
BEFORE UPDATE ON public.campagne_email_marketing
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allegati: ramo campagna_email (nessun cliente collegato)
DROP POLICY IF EXISTS allegati_insert ON public.allegati;
CREATE POLICY allegati_insert ON public.allegati
FOR INSERT TO authenticated
WITH CHECK (
  (caricato_da = auth.uid())
  AND (
    (
      entita_tipo = 'campagna_email'
      AND cliente_id IS NULL
      AND (
        public.has_role(auth.uid(), 'amministratore'::app_role)
        OR public.has_role(auth.uid(), 'amministrazione'::app_role)
        OR public.has_role(auth.uid(), 'direzione'::app_role)
      )
      AND EXISTS (SELECT 1 FROM public.campagne_email_marketing c WHERE c.id = entita_id)
    )
    OR (
      cliente_id IS NOT NULL AND (
        public.has_role(auth.uid(), 'amministratore'::app_role)
        OR ((entita_tipo = 'assicurazione') AND public.user_can_access_cliente(cliente_id) AND (public.has_role(auth.uid(), 'amministrazione'::app_role) OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role) OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role) OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)))
        OR ((entita_tipo = 'pratica_legale') AND public.user_can_access_cliente(cliente_id) AND (public.has_role(auth.uid(), 'approvatore_liv1'::app_role) OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role) OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)))
        OR ((entita_tipo = ANY (ARRAY['cliente','azione_recupero','piano_rientro'])) AND public.user_can_access_cliente(cliente_id))
        OR ((entita_tipo = 'richiesta_fido') AND public.user_can_access_richiesta_fido(entita_id))
      )
    )
  )
);

DROP POLICY IF EXISTS allegati_select ON public.allegati;
CREATE POLICY allegati_select ON public.allegati
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'amministratore'::app_role)
  OR (cliente_id IS NOT NULL AND public.user_can_access_cliente(cliente_id))
  OR (
    entita_tipo = 'campagna_email'
    AND (
      public.has_role(auth.uid(), 'amministrazione'::app_role)
      OR public.has_role(auth.uid(), 'direzione'::app_role)
    )
  )
);

DROP POLICY IF EXISTS allegati_storage_select ON storage.objects;
CREATE POLICY allegati_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'allegati'
  AND EXISTS (
    SELECT 1 FROM public.allegati a
    WHERE a.storage_path = objects.name
      AND (
        public.has_role(auth.uid(), 'amministratore'::app_role)
        OR (a.cliente_id IS NOT NULL AND public.user_can_access_cliente(a.cliente_id))
        OR (a.entita_tipo = 'campagna_email' AND (public.has_role(auth.uid(), 'amministrazione'::app_role) OR public.has_role(auth.uid(), 'direzione'::app_role)))
      )
  )
);