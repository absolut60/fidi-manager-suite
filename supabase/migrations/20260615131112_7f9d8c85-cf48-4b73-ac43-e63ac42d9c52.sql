DROP POLICY IF EXISTS allegati_insert ON public.allegati;

CREATE POLICY allegati_insert ON public.allegati
FOR INSERT TO authenticated
WITH CHECK (
  cliente_id IS NOT NULL
  AND caricato_da = auth.uid()
  AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR (
      entita_tipo = 'assicurazione'
      AND (
        has_role(auth.uid(), 'amministrazione'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
      )
    )
    OR (
      entita_tipo = 'pratica_legale'
      AND (
        has_role(auth.uid(), 'approvatore_liv1'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
      )
    )
    OR (
      entita_tipo IN ('cliente', 'azione_recupero')
      AND user_can_write_cliente(cliente_id)
    )
  )
);
