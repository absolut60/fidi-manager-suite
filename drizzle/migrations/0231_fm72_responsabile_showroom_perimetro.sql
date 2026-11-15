CREATE OR REPLACE FUNCTION public.showroom_sede_ok(_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.has_role(auth.uid(),'responsabile_showroom') OR (_store_id IS NOT NULL AND _store_id = public.profilo_store_id_corrente()) $$;
REVOKE EXECUTE ON FUNCTION public.showroom_sede_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.showroom_sede_ok(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_e_showroom()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('showroom','responsabile_showroom')) $$;
REVOKE EXECUTE ON FUNCTION public.auth_e_showroom() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_e_showroom() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_solo_showroom()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('showroom','responsabile_showroom'))
AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('store_manager','amministratore','amministrazione','direzione','recupero_crediti')) $$;
REVOKE EXECUTE ON FUNCTION public.auth_solo_showroom() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_solo_showroom() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_ha_ruolo_globale_clienti()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('amministratore','direzione','amministrazione','approvatore_liv1','approvatore_liv2','approvatore_liv3','responsabile_agenti','responsabile_showroom')) $$;
REVOKE EXECUTE ON FUNCTION public.auth_ha_ruolo_globale_clienti() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_ha_ruolo_globale_clienti() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.showroom_cliente_della_sede(_cliente_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT _cliente_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.clienti c WHERE c.id=_cliente_id AND public.showroom_sede_ok(c.store_id)) $$;
REVOKE EXECUTE ON FUNCTION public.showroom_cliente_della_sede(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.showroom_cliente_della_sede(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.showroom_lead_della_sede(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT _lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead l WHERE l.id=_lead_id AND public.showroom_sede_ok(l.store_id)) $$;
REVOKE EXECUTE ON FUNCTION public.showroom_lead_della_sede(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.showroom_lead_della_sede(uuid) TO authenticated, service_role;

ALTER POLICY "Showroom: lead della sede (lettura)" ON public.lead USING ((SELECT public.auth_e_showroom()) AND public.showroom_sede_ok(store_id));
ALTER POLICY "Showroom: lead della sede (modifica)" ON public.lead USING ((SELECT public.auth_e_showroom()) AND public.showroom_sede_ok(store_id)) WITH CHECK ((SELECT public.auth_e_showroom()) AND public.showroom_sede_ok(store_id));
ALTER POLICY "Showroom: lead della sede (inserimento)" ON public.lead WITH CHECK ((SELECT public.auth_e_showroom()) AND public.showroom_sede_ok(store_id));
-- Anche la restrittiva INSERT fa parte del perimetro showroom: altrimenti richiederebbe ancora la sede sul profilo.
ALTER POLICY "Showroom: lead solo della sede (ins)" ON public.lead WITH CHECK (NOT (SELECT public.auth_solo_showroom()) OR public.showroom_sede_ok(store_id));
ALTER POLICY "Showroom: lead solo della sede (upd)" ON public.lead USING (NOT (SELECT public.auth_solo_showroom()) OR public.showroom_sede_ok(store_id)) WITH CHECK (NOT (SELECT public.auth_solo_showroom()) OR public.showroom_sede_ok(store_id));

CREATE OR REPLACE FUNCTION public.auth_puo_vedere_lead(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.lead l WHERE l.id=_lead_id AND (public.has_lead_module_access(auth.uid()) OR public.has_eventi_flusso_access(auth.uid()) OR public.agente_vede_record(l.agente_codice,l.created_by,l.cliente_id,NULL::uuid,NULL::uuid) OR (public.auth_e_showroom() AND public.showroom_sede_ok(l.store_id)))) $$;
REVOKE EXECUTE ON FUNCTION public.auth_puo_vedere_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_vedere_lead(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_puo_modificare_lead(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.lead l WHERE l.id=_lead_id AND (((public.has_lead_module_access(auth.uid()) OR public.agente_vede_record(l.agente_codice,l.created_by,l.cliente_id,NULL::uuid,NULL::uuid)) AND (NOT public.auth_solo_showroom() OR public.showroom_sede_ok(l.store_id))) OR (public.auth_e_showroom() AND public.showroom_sede_ok(l.store_id)))) $$;
REVOKE EXECUTE ON FUNCTION public.auth_puo_modificare_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_modificare_lead(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_consulta_preventivi()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.auth_ha_accesso_preventivi() OR coalesce(public.has_role(auth.uid(),'store_manager'::app_role),false) OR coalesce(public.has_role(auth.uid(),'showroom'::app_role),false) OR coalesce(public.has_role(auth.uid(),'responsabile_showroom'::app_role),false) $$;
REVOKE EXECUTE ON FUNCTION public.auth_consulta_preventivi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_consulta_preventivi() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_vede_preventivo(_agente_codice text,_cliente_id uuid,_cantiere_id uuid,_lead_id uuid,_linea public.linea_preventivo,_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT (
 has_role(auth.uid(),'amministratore'::app_role)
 OR ((has_role(auth.uid(),'preventivi_manage'::app_role) OR has_role(auth.uid(),'preventivi_write'::app_role) OR has_role(auth.uid(),'preventivi_read'::app_role)) AND _linea=ANY(public.auth_linee_abilitate()))
 OR (has_role(auth.uid(),'store_manager'::app_role) AND _store_id IS NOT NULL AND _store_id=(SELECT store_id FROM public.profili WHERE id=auth.uid()))
 OR (has_role(auth.uid(),'showroom'::app_role) AND _store_id IS NOT NULL AND _store_id=(SELECT store_id FROM public.profili WHERE id=auth.uid()) AND _linea=ANY(public.auth_linee_abilitate()))
 OR (has_role(auth.uid(),'responsabile_showroom'::app_role) AND _linea=ANY(public.auth_linee_abilitate()))
 ) AND (NOT (has_role(auth.uid(),'agente'::app_role) AND NOT has_role(auth.uid(),'amministratore'::app_role) AND NOT has_role(auth.uid(),'preventivi_manage'::app_role)) OR public.agente_vede_record(_agente_codice,NULL,_cliente_id,_lead_id,_cantiere_id)) $$;
REVOKE EXECUTE ON FUNCTION public.auth_vede_preventivo(text,uuid,uuid,uuid,public.linea_preventivo,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_vede_preventivo(text,uuid,uuid,uuid,public.linea_preventivo,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_puo_scrivere_preventivo(_agente_codice text,_linea public.linea_preventivo)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT has_role(auth.uid(),'amministratore')
 OR (has_role(auth.uid(),'preventivi_manage') AND _linea=ANY(public.auth_linee_abilitate()))
 OR (has_role(auth.uid(),'preventivi_write') AND _linea=ANY(public.auth_linee_abilitate()) AND _agente_codice IS NOT NULL AND _agente_codice=(SELECT codice_agente FROM public.profili WHERE id=auth.uid()))
 OR (has_role(auth.uid(),'responsabile_showroom') AND _linea=ANY(public.auth_linee_abilitate())) $$;
REVOKE EXECUTE ON FUNCTION public.auth_puo_scrivere_preventivo(text,public.linea_preventivo) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_scrivere_preventivo(text,public.linea_preventivo) TO authenticated, service_role;