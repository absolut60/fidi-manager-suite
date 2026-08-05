CREATE POLICY "consensi_log_select_accesso_soggetto"
ON public.consensi_log
FOR SELECT
TO authenticated
USING (
  (cliente_id IS NOT NULL AND public.user_can_access_cliente(cliente_id))
  OR (lead_id IS NOT NULL AND public.can_access_lead(lead_id))
  OR (
    contatto_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.contatti c
      WHERE c.id = consensi_log.contatto_id
        AND (
          (c.cliente_id IS NOT NULL AND public.user_can_access_cliente(c.cliente_id))
          OR (c.lead_id IS NOT NULL AND public.can_access_lead(c.lead_id))
        )
    )
  )
);