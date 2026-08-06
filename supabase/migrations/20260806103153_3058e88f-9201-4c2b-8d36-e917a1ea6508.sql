ALTER VIEW public.fatturato_rolling_cliente SET (security_invoker = true);

DROP POLICY IF EXISTS campagne_email_marketing_all ON public.campagne_email_marketing;

CREATE POLICY campagne_email_marketing_select ON public.campagne_email_marketing
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'marketing'::app_role)
);

CREATE POLICY campagne_email_marketing_insert ON public.campagne_email_marketing
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'marketing'::app_role)
);

CREATE POLICY campagne_email_marketing_update ON public.campagne_email_marketing
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'marketing'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'marketing'::app_role)
);

CREATE POLICY campagne_email_marketing_delete ON public.campagne_email_marketing
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR (
    (has_role(auth.uid(), 'marketing'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role))
    AND created_by = auth.uid()
    AND inviata_at IS NULL
    AND coalesce(stato, 'bozza') NOT IN ('in_corso', 'inviata')
  )
);