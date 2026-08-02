-- ============ CLIENTI ============
DROP POLICY IF EXISTS "Visibilità clienti per ruolo" ON public.clienti;
CREATE POLICY "Visibilità clienti per ruolo" ON public.clienti
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR has_role(auth.uid(), 'marketing'::app_role)
  OR (store_id IN (SELECT profili.store_id FROM profili WHERE profili.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND codice_agente IS NOT NULL
      AND codice_agente IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
);

DROP POLICY IF EXISTS "Admin o store manager aggiornano clienti" ON public.clienti;
CREATE POLICY "Admin o store manager aggiornano clienti" ON public.clienti
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'marketing'::app_role)
  OR ((NOT has_role(auth.uid(), 'agente'::app_role))
      AND store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid()))
  OR (has_role(auth.uid(), 'agente'::app_role) AND codice_agente IS NOT NULL
      AND codice_agente IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (has_role(auth.uid(), 'marketing'::app_role)
      AND store_id IS NOT DISTINCT FROM (SELECT c.store_id FROM clienti c WHERE c.id = clienti.id))
  OR ((NOT has_role(auth.uid(), 'agente'::app_role))
      AND store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())
      AND store_id = (SELECT c.store_id FROM clienti c WHERE c.id = clienti.id))
  OR (has_role(auth.uid(), 'agente'::app_role) AND codice_agente IS NOT NULL
      AND codice_agente IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
);

-- ============ CONTATTI ============
DROP POLICY IF EXISTS "Contatti: visibili come il cliente" ON public.contatti;
CREATE POLICY "Contatti: visibili come il cliente" ON public.contatti
FOR SELECT TO authenticated
USING (user_can_access_cliente(cliente_id) OR has_role(auth.uid(), 'marketing'::app_role));

DROP POLICY IF EXISTS "Contatti: insert come il cliente" ON public.contatti;
CREATE POLICY "Contatti: insert come il cliente" ON public.contatti
FOR INSERT TO authenticated
WITH CHECK (
  user_can_write_cliente(cliente_id)
  OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
  OR (has_role(auth.uid(), 'marketing'::app_role) AND cliente_id IS NOT NULL)
);

DROP POLICY IF EXISTS "Contatti: update come il cliente" ON public.contatti;
CREATE POLICY "Contatti: update come il cliente" ON public.contatti
FOR UPDATE TO authenticated
USING (
  user_can_write_cliente(cliente_id)
  OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
  OR has_role(auth.uid(), 'marketing'::app_role)
)
WITH CHECK (
  user_can_write_cliente(cliente_id)
  OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
  OR (has_role(auth.uid(), 'marketing'::app_role) AND cliente_id IS NOT NULL)
);

-- ============ TABELLE MARKETING ============
DROP POLICY IF EXISTS "segmenti_marketing_all_marketing_roles" ON public.segmenti_marketing;
CREATE POLICY "segmenti_marketing_all_marketing_roles" ON public.segmenti_marketing
FOR ALL TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'marketing'::app_role))
WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'marketing'::app_role));

DROP POLICY IF EXISTS "segmenti_marketing_select_marketing_roles" ON public.segmenti_marketing;
CREATE POLICY "segmenti_marketing_select_marketing_roles" ON public.segmenti_marketing
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'marketing'::app_role));

DROP POLICY IF EXISTS "segmenti_clienti_all" ON public.segmenti_marketing_clienti;
CREATE POLICY "segmenti_clienti_all" ON public.segmenti_marketing_clienti
FOR ALL TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'marketing'::app_role))
WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'marketing'::app_role));

DROP POLICY IF EXISTS "segmenti_clienti_select" ON public.segmenti_marketing_clienti;
CREATE POLICY "segmenti_clienti_select" ON public.segmenti_marketing_clienti
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'marketing'::app_role));

DROP POLICY IF EXISTS "campagne_email_marketing_all" ON public.campagne_email_marketing;
CREATE POLICY "campagne_email_marketing_all" ON public.campagne_email_marketing
FOR ALL TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'marketing'::app_role))
WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'marketing'::app_role));

DROP POLICY IF EXISTS "campagne_email_destinatari_all" ON public.campagne_email_destinatari;
CREATE POLICY "campagne_email_destinatari_all" ON public.campagne_email_destinatari
FOR ALL TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'marketing'::app_role))
WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'marketing'::app_role));

DROP POLICY IF EXISTS "Clic visibili ai ruoli direzionali" ON public.campagne_email_clic;
CREATE POLICY "Clic visibili ai ruoli direzionali" ON public.campagne_email_clic
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'marketing'::app_role));

DROP POLICY IF EXISTS "consensi_log_select_admin" ON public.consensi_log;
CREATE POLICY "consensi_log_select_admin" ON public.consensi_log
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'marketing'::app_role));

DROP POLICY IF EXISTS "consensi_log_insert_admin" ON public.consensi_log;
CREATE POLICY "consensi_log_insert_admin" ON public.consensi_log
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'marketing'::app_role));

-- ============ ALLEGATI CAMPAGNE (immagini/allegati email) ============
DROP POLICY IF EXISTS allegati_select ON public.allegati;
CREATE POLICY allegati_select ON public.allegati
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'amministratore'::app_role)
  OR (cliente_id IS NOT NULL AND user_can_access_cliente(cliente_id))
  OR (entita_tipo = 'campagna_email' AND (has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'marketing'::app_role)))
);

DROP POLICY IF EXISTS allegati_insert ON public.allegati;
CREATE POLICY allegati_insert ON public.allegati
FOR INSERT TO authenticated
WITH CHECK (
  caricato_da = auth.uid()
  AND (
    (entita_tipo = 'campagna_email' AND cliente_id IS NULL
      AND (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'marketing'::app_role))
      AND EXISTS (SELECT 1 FROM campagne_email_marketing c WHERE c.id = allegati.entita_id))
    OR (cliente_id IS NOT NULL AND (
      has_role(auth.uid(),'amministratore'::app_role)
      OR (entita_tipo = 'assicurazione' AND user_can_access_cliente(cliente_id) AND (has_role(auth.uid(),'amministrazione'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role)))
      OR (entita_tipo = 'pratica_legale' AND user_can_access_cliente(cliente_id) AND (has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role)))
      OR (entita_tipo = ANY (ARRAY['cliente','azione_recupero','piano_rientro']) AND user_can_access_cliente(cliente_id))
      OR (entita_tipo = 'richiesta_fido' AND user_can_access_richiesta_fido(entita_id))
    ))
  )
);