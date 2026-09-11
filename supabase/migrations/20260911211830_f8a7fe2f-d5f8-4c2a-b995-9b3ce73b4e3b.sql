DROP POLICY IF EXISTS "Autenticati creano clienti" ON public.clienti;
CREATE POLICY "Autenticati creano clienti" ON public.clienti
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR (has_role(auth.uid(), 'agente'::app_role) AND (codice_agente IS NOT NULL) AND (codice_agente = (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid())) AND ((store_id IS NULL) OR (store_id = (SELECT p.store_id FROM profili p WHERE p.id = auth.uid()))))
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id = (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())) AND ((codice_agente IS NULL) OR (codice_agente = (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid()))))
  );

DROP POLICY IF EXISTS "Admin o store manager aggiornano clienti" ON public.clienti;
CREATE POLICY "Admin o store manager aggiornano clienti" ON public.clienti
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'marketing'::app_role)
    OR (has_role(auth.uid(), 'responsabile_agenti'::app_role) AND created_by = auth.uid())
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
    OR (has_role(auth.uid(), 'agente'::app_role) AND (codice_agente IS NOT NULL) AND (codice_agente IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  )
  WITH CHECK (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'marketing'::app_role)
    OR (has_role(auth.uid(), 'responsabile_agenti'::app_role) AND created_by = auth.uid())
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
    OR (has_role(auth.uid(), 'agente'::app_role) AND (codice_agente IS NOT NULL) AND (codice_agente IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  );

DROP POLICY IF EXISTS "Cantieri: insert come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: insert come il cliente" ON public.cantieri
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (user_can_write_cliente(cliente_id) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))))
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  );

DROP POLICY IF EXISTS "Cantieri: update come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: update come il cliente" ON public.cantieri
  FOR UPDATE TO authenticated
  USING (
    (has_role(auth.uid(), 'responsabile_agenti'::app_role) AND created_by = auth.uid())
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (user_can_write_cliente(cliente_id) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))))
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  )
  WITH CHECK (
    (has_role(auth.uid(), 'responsabile_agenti'::app_role) AND created_by = auth.uid())
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (user_can_write_cliente(cliente_id) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))))
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  );

DROP POLICY IF EXISTS "Contatti: insert come il cliente" ON public.contatti;
CREATE POLICY "Contatti: insert come il cliente" ON public.contatti
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR user_can_write_cliente(cliente_id)
    OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
    OR (has_role(auth.uid(), 'marketing'::app_role) AND (cliente_id IS NOT NULL))
    OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))
  );

DROP POLICY IF EXISTS "Contatti: update come il cliente" ON public.contatti;
CREATE POLICY "Contatti: update come il cliente" ON public.contatti
  FOR UPDATE TO authenticated
  USING (
    (has_role(auth.uid(), 'responsabile_agenti'::app_role) AND created_by = auth.uid())
    OR user_can_write_cliente(cliente_id)
    OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
    OR has_role(auth.uid(), 'marketing'::app_role)
    OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))
  )
  WITH CHECK (
    (has_role(auth.uid(), 'responsabile_agenti'::app_role) AND created_by = auth.uid())
    OR user_can_write_cliente(cliente_id)
    OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
    OR (has_role(auth.uid(), 'marketing'::app_role) AND (cliente_id IS NOT NULL))
    OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))
  );

DROP POLICY IF EXISTS "campagne_email_marketing_select" ON public.campagne_email_marketing;
CREATE POLICY "campagne_email_marketing_select" ON public.campagne_email_marketing
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'marketing'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
  );

DROP POLICY IF EXISTS "Opportunita: select per ruolo" ON public.opportunita;
CREATE POLICY "Opportunita: select per ruolo" ON public.opportunita
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  );

DROP POLICY IF EXISTS "Attivita commerciale: select per ruolo" ON public.attivita_commerciale;
CREATE POLICY "Attivita commerciale: select per ruolo" ON public.attivita_commerciale
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR has_role(auth.uid(), 'responsabile_agenti'::app_role)
    OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())))
    OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)))
  );