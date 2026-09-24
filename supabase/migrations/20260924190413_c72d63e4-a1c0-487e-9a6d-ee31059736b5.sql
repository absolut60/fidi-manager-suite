CREATE OR REPLACE FUNCTION public.agente_codice_corrente()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.codice_agente FROM public.profili p
  WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL
    AND public.has_role(auth.uid(), 'agente'::app_role)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.agente_vede_record(_agente_codice text, _created_by uuid, _cliente_id uuid, _lead_id uuid, _cantiere_id uuid, _opportunita_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cod text := public.agente_codice_corrente();
  v_uid uuid := auth.uid();
BEGIN
  IF v_cod IS NULL THEN RETURN false; END IF;
  IF _agente_codice IS NOT NULL AND _agente_codice = v_cod THEN RETURN true; END IF;
  IF _created_by IS NOT NULL AND _created_by = v_uid THEN RETURN true; END IF;
  IF _cliente_id IS NOT NULL AND EXISTS (SELECT 1 FROM clienti c WHERE c.id = _cliente_id AND c.codice_agente = v_cod) THEN RETURN true; END IF;
  IF _lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM lead l WHERE l.id = _lead_id AND (l.agente_codice = v_cod OR l.created_by = v_uid)) THEN RETURN true; END IF;
  IF _cantiere_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM cantieri k
    WHERE k.id = _cantiere_id AND (
      k.agente_codice = v_cod OR k.created_by = v_uid
      OR EXISTS (SELECT 1 FROM clienti c WHERE c.id = k.cliente_id AND c.codice_agente = v_cod)
      OR EXISTS (SELECT 1 FROM lead l WHERE l.id = k.lead_id AND (l.agente_codice = v_cod OR l.created_by = v_uid))
    )) THEN RETURN true; END IF;
  IF _opportunita_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM opportunita o
    WHERE o.id = _opportunita_id AND (
      o.agente_codice = v_cod OR o.created_by = v_uid
      OR EXISTS (SELECT 1 FROM clienti c WHERE c.id = o.cliente_id AND c.codice_agente = v_cod)
      OR EXISTS (SELECT 1 FROM lead l WHERE l.id = o.lead_id AND (l.agente_codice = v_cod OR l.created_by = v_uid))
      OR EXISTS (SELECT 1 FROM cantieri k WHERE k.id = o.cantiere_id AND (
           k.agente_codice = v_cod OR k.created_by = v_uid
           OR EXISTS (SELECT 1 FROM clienti c WHERE c.id = k.cliente_id AND c.codice_agente = v_cod)
           OR EXISTS (SELECT 1 FROM lead l WHERE l.id = k.lead_id AND (l.agente_codice = v_cod OR l.created_by = v_uid))))
    )) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.agente_codice_corrente() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agente_vede_record(text, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agente_codice_corrente() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agente_vede_record(text, uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.lead ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.cantieri ALTER COLUMN created_by SET DEFAULT auth.uid();

DROP POLICY "Attivita commerciale: insert per ruolo" ON public.attivita_commerciale;
CREATE POLICY "Attivita commerciale: insert per ruolo" ON public.attivita_commerciale AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN ( SELECT p.store_id
   FROM profili p
  WHERE (p.id = auth.uid())))) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, operatore_id, cliente_id, lead_id, NULL, opportunita_id))));

DROP POLICY "Attivita commerciale: select per ruolo" ON public.attivita_commerciale;
CREATE POLICY "Attivita commerciale: select per ruolo" ON public.attivita_commerciale AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN ( SELECT p.store_id
   FROM profili p
  WHERE (p.id = auth.uid())))) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, operatore_id, cliente_id, lead_id, NULL, opportunita_id))));

DROP POLICY "Attivita commerciale: update per ruolo" ON public.attivita_commerciale;
CREATE POLICY "Attivita commerciale: update per ruolo" ON public.attivita_commerciale AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN ( SELECT p.store_id
   FROM profili p
  WHERE (p.id = auth.uid())))) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, operatore_id, cliente_id, lead_id, NULL, opportunita_id))))
  WITH CHECK ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN ( SELECT p.store_id
   FROM profili p
  WHERE (p.id = auth.uid())))) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, operatore_id, cliente_id, lead_id, NULL, opportunita_id))));

DROP POLICY "Cantieri: delete admin o agente propri" ON public.cantieri;
CREATE POLICY "Cantieri: delete admin o agente propri" ON public.cantieri AS PERMISSIVE FOR DELETE TO authenticated
  USING ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, created_by, cliente_id, lead_id, NULL))));

DROP POLICY "Cantieri: insert come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: insert come il cliente" ON public.cantieri AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (user_can_write_cliente(cliente_id) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())))) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, created_by, cliente_id, lead_id, NULL))));

DROP POLICY "Cantieri: select come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: select come il cliente" ON public.cantieri AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((NOT has_role(auth.uid(), 'agente'::app_role)) AND ((cliente_id IN ( SELECT c.id
   FROM clienti c
  WHERE (has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role) OR (c.store_id IN ( SELECT p.store_id
           FROM profili p
          WHERE (p.id = auth.uid())))))) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())))) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, created_by, cliente_id, lead_id, NULL))));

DROP POLICY "Cantieri: update come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: update come il cliente" ON public.cantieri AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (user_can_write_cliente(cliente_id) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())))) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, created_by, cliente_id, lead_id, NULL))))
  WITH CHECK ((has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (user_can_write_cliente(cliente_id) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())))) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, created_by, cliente_id, lead_id, NULL))));

DROP POLICY "Categoria storico: insert per modulo" ON public.categoria_storico;
CREATE POLICY "Categoria storico: insert per modulo" ON public.categoria_storico AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((((lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())) OR ((cliente_id IS NOT NULL) AND (auth_ha_ruolo_globale_clienti() OR has_role(auth.uid(), 'marketing'::app_role) OR has_role(auth.uid(), 'marketing_eventi'::app_role) OR (EXISTS ( SELECT 1
   FROM clienti c
  WHERE ((c.id = categoria_storico.cliente_id) AND user_can_access_cliente(c.id, c.store_id, c.codice_agente)))))) OR ((lead_id IS NOT NULL) AND agente_vede_record(NULL, NULL, NULL, lead_id, NULL))));

DROP POLICY "Categoria storico: select per modulo" ON public.categoria_storico;
CREATE POLICY "Categoria storico: select per modulo" ON public.categoria_storico AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())) OR ((cliente_id IS NOT NULL) AND (auth_ha_ruolo_globale_clienti() OR has_role(auth.uid(), 'marketing'::app_role) OR has_role(auth.uid(), 'marketing_eventi'::app_role) OR (EXISTS ( SELECT 1
   FROM clienti c
  WHERE ((c.id = categoria_storico.cliente_id) AND user_can_access_cliente(c.id, c.store_id, c.codice_agente)))))) OR ((lead_id IS NOT NULL) AND agente_vede_record(NULL, NULL, NULL, lead_id, NULL))));

DROP POLICY "Contatti: insert come il cliente" ON public.contatti;
CREATE POLICY "Contatti: insert come il cliente" ON public.contatti AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'responsabile_agenti'::app_role) OR user_can_write_cliente(cliente_id) OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id)) OR (has_role(auth.uid(), 'marketing'::app_role) AND (cliente_id IS NOT NULL)) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND agente_vede_record(NULL, NULL, NULL, lead_id, NULL))));

DROP POLICY "Contatti: visibili come il cliente" ON public.contatti;
CREATE POLICY "Contatti: visibili come il cliente" ON public.contatti AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_can_access_cliente(cliente_id) OR has_role(auth.uid(), 'marketing'::app_role) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND (has_lead_module_access(auth.uid()) OR has_eventi_flusso_access(auth.uid()))) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND agente_vede_record(NULL, NULL, NULL, lead_id, NULL))));

DROP POLICY "Contatti: update come il cliente" ON public.contatti;
CREATE POLICY "Contatti: update come il cliente" ON public.contatti AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((has_role(auth.uid(), 'responsabile_agenti'::app_role) AND (created_by = auth.uid())) OR user_can_write_cliente(cliente_id) OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id)) OR has_role(auth.uid(), 'marketing'::app_role) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND agente_vede_record(NULL, NULL, NULL, lead_id, NULL))))
  WITH CHECK (((has_role(auth.uid(), 'responsabile_agenti'::app_role) AND (created_by = auth.uid())) OR user_can_write_cliente(cliente_id) OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id)) OR (has_role(auth.uid(), 'marketing'::app_role) AND (cliente_id IS NOT NULL)) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND has_lead_module_access(auth.uid())) OR ((cliente_id IS NULL) AND (lead_id IS NOT NULL) AND agente_vede_record(NULL, NULL, NULL, lead_id, NULL))));

DROP POLICY "lead_insert" ON public.lead;
CREATE POLICY "lead_insert" ON public.lead AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_lead_module_access(auth.uid()) OR (has_role(auth.uid(), 'agente'::app_role) AND (agente_codice IS NOT NULL) AND (agente_codice = agente_codice_corrente()))));

DROP POLICY "lead_select" ON public.lead;
CREATE POLICY "lead_select" ON public.lead AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_lead_module_access(auth.uid()) OR has_eventi_flusso_access(auth.uid()) OR agente_vede_record(agente_codice, created_by, cliente_id, NULL, NULL)));

DROP POLICY "lead_update" ON public.lead;
CREATE POLICY "lead_update" ON public.lead AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_lead_module_access(auth.uid()) OR agente_vede_record(agente_codice, created_by, cliente_id, NULL, NULL)))
  WITH CHECK ((has_lead_module_access(auth.uid()) OR agente_vede_record(agente_codice, created_by, cliente_id, NULL, NULL)));

DROP POLICY "lead_storico_insert" ON public.lead_storico;
CREATE POLICY "lead_storico_insert" ON public.lead_storico AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_lead_module_access(auth.uid()) OR agente_vede_record(NULL, NULL, NULL, lead_id, NULL)));

DROP POLICY "lead_storico_select" ON public.lead_storico;
CREATE POLICY "lead_storico_select" ON public.lead_storico AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_lead_module_access(auth.uid()) OR agente_vede_record(NULL, NULL, NULL, lead_id, NULL)));

DROP POLICY "Opportunita: insert per ruolo" ON public.opportunita;
CREATE POLICY "Opportunita: insert per ruolo" ON public.opportunita AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN ( SELECT p.store_id
   FROM profili p
  WHERE (p.id = auth.uid())))) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, created_by, cliente_id, lead_id, cantiere_id))));

DROP POLICY "Opportunita: select per ruolo" ON public.opportunita;
CREATE POLICY "Opportunita: select per ruolo" ON public.opportunita AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN ( SELECT p.store_id
   FROM profili p
  WHERE (p.id = auth.uid())))) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, created_by, cliente_id, lead_id, cantiere_id))));

DROP POLICY "Opportunita: update per ruolo" ON public.opportunita;
CREATE POLICY "Opportunita: update per ruolo" ON public.opportunita AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN ( SELECT p.store_id
   FROM profili p
  WHERE (p.id = auth.uid())))) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, created_by, cliente_id, lead_id, cantiere_id))))
  WITH CHECK ((has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'responsabile_agenti'::app_role) OR ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (store_id IS NOT NULL) AND (store_id IN ( SELECT p.store_id
   FROM profili p
  WHERE (p.id = auth.uid())))) OR (has_role(auth.uid(), 'agente'::app_role) AND agente_vede_record(agente_codice, created_by, cliente_id, lead_id, cantiere_id))));