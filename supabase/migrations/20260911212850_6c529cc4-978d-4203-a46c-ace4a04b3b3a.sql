------- CANTIERI: UPDATE senza vincolo created_by + DELETE con ruolo -------
DROP POLICY IF EXISTS "Cantieri: update come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: update come il cliente" ON public.cantieri
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (user_can_write_cliente(cliente_id) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))))
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  )
  WITH CHECK (
    has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (user_can_write_cliente(cliente_id) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))))
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  );

DROP POLICY IF EXISTS "Cantieri: delete admin o agente propri" ON public.cantieri;
CREATE POLICY "Cantieri: delete admin o agente propri" ON public.cantieri
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))
    OR (has_role(auth.uid(), 'agente'::app_role) AND (((agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))) OR (cliente_id IN (SELECT c.id FROM clienti c WHERE c.codice_agente IS NOT NULL AND c.codice_agente IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))) OR (lead_id IN (SELECT l.id FROM lead l WHERE l.agente_codice IS NOT NULL AND l.agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))))
  );

------- OPPORTUNITA: INSERT/UPDATE/DELETE con ruolo -------
DROP POLICY IF EXISTS "Opportunita: insert per ruolo" ON public.opportunita;
CREATE POLICY "Opportunita: insert per ruolo" ON public.opportunita
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  );

DROP POLICY IF EXISTS "Opportunita: update per ruolo" ON public.opportunita;
CREATE POLICY "Opportunita: update per ruolo" ON public.opportunita
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  )
  WITH CHECK (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  );

DROP POLICY IF EXISTS "Opportunita: delete direzionali o agente proprie" ON public.opportunita;
CREATE POLICY "Opportunita: delete direzionali o agente proprie" ON public.opportunita
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  );

------- ATTIVITA COMMERCIALE: INSERT/UPDATE/DELETE con ruolo -------
DROP POLICY IF EXISTS "Attivita commerciale: insert per ruolo" ON public.attivita_commerciale;
CREATE POLICY "Attivita commerciale: insert per ruolo" ON public.attivita_commerciale
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  );

DROP POLICY IF EXISTS "Attivita commerciale: update per ruolo" ON public.attivita_commerciale;
CREATE POLICY "Attivita commerciale: update per ruolo" ON public.attivita_commerciale
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  )
  WITH CHECK (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  );

DROP POLICY IF EXISTS "Attivita commerciale: delete solo direzionali" ON public.attivita_commerciale;
CREATE POLICY "Attivita commerciale: delete solo direzionali" ON public.attivita_commerciale
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
  );