
-- Allow entita_tipo='piano_rientro' on allegati
ALTER TABLE public.allegati DROP CONSTRAINT IF EXISTS allegati_entita_tipo_check;
ALTER TABLE public.allegati ADD CONSTRAINT allegati_entita_tipo_check
  CHECK (entita_tipo = ANY (ARRAY[
    'cliente'::text, 'assicurazione'::text, 'pratica_legale'::text,
    'azione_recupero'::text, 'richiesta_fido'::text, 'piano_rientro'::text
  ]));

-- Extend insert policy to allow piano_rientro attachments for users who can write on the cliente
DROP POLICY IF EXISTS "allegati_insert" ON public.allegati;
CREATE POLICY "allegati_insert" ON public.allegati
  FOR INSERT TO authenticated
  WITH CHECK (
    (cliente_id IS NOT NULL) AND (caricato_da = auth.uid()) AND (
      has_role(auth.uid(), 'amministratore'::app_role)
      OR (entita_tipo = 'assicurazione' AND user_can_access_cliente(cliente_id) AND (
        has_role(auth.uid(), 'amministrazione'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
      ))
      OR (entita_tipo = 'pratica_legale' AND user_can_access_cliente(cliente_id) AND (
        has_role(auth.uid(), 'approvatore_liv1'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
      ))
      OR (entita_tipo IN ('cliente', 'azione_recupero', 'piano_rientro') AND user_can_write_cliente(cliente_id))
      OR (entita_tipo = 'richiesta_fido' AND user_can_access_richiesta_fido(entita_id))
    )
  );
