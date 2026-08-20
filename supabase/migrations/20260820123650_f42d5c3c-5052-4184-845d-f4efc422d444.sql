DROP POLICY IF EXISTS "Opportunita: delete solo direzionali" ON public.opportunita;
CREATE POLICY "Opportunita: delete direzionali o agente proprie"
ON public.opportunita FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR (
    has_role(auth.uid(), 'agente'::app_role)
    AND agente_codice IS NOT NULL
    AND agente_codice IN (
      SELECT p.codice_agente FROM profili p
      WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL
    )
  )
);

DROP POLICY IF EXISTS "Cantieri: delete admin" ON public.cantieri;
CREATE POLICY "Cantieri: delete admin o agente propri"
ON public.cantieri FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND has_lead_module_access(auth.uid()))
  OR (
    has_role(auth.uid(), 'agente'::app_role)
    AND (
      (agente_codice IS NOT NULL AND agente_codice IN (
        SELECT p.codice_agente FROM profili p
        WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
      OR cliente_id IN (
        SELECT c.id FROM clienti c
        WHERE c.codice_agente IS NOT NULL AND c.codice_agente IN (
          SELECT p.codice_agente FROM profili p
          WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
      OR lead_id IN (
        SELECT l.id FROM lead l
        WHERE l.agente_codice IS NOT NULL AND l.agente_codice IN (
          SELECT p.codice_agente FROM profili p
          WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
    )
  )
);