COMMENT ON COLUMN public.cantiere_listini_speciali.prezzo_vendita_speciale IS 'Prezzo LORDO speciale unitario, gestito manualmente dall operatore; sconti in cascata e maggiorazione sono separati. Nessuna data di validita.';
COMMENT ON COLUMN public.cantiere_listini_speciali.costo_netto_speciale IS 'Costo UNITARIO speciale facoltativo, gestito manualmente: se valorizzato sostituira il costo ultimo nel preventivo.';
ALTER TABLE public.cantiere_listini_speciali
 ADD COLUMN descrizione text,
 ADD COLUMN sconti numeric[] NOT NULL DEFAULT '{}',
 ADD COLUMN maggiorazione_perc numeric NOT NULL DEFAULT 0,
 ADD COLUMN um_scelta text,
 ADD COLUMN created_by uuid DEFAULT auth.uid(),
 ADD COLUMN updated_by uuid,
 ADD CONSTRAINT cantiere_listini_speciali_sconti_max6 CHECK (cardinality(sconti) <= 6);
-- cod_gamma is already NOT NULL; cantiere_listini_speciali_uniq already enforces UNIQUE(cantiere_id,cod_gamma).
-- Existing update_cantiere_listini_speciali_updated_at trigger already calls update_updated_at().
CREATE FUNCTION public.cantiere_listini_speciali_autore_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO public AS $$
BEGIN
 NEW.updated_by = auth.uid();
 RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cantiere_listini_speciali_autore_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cantiere_listini_speciali_autore_update() TO authenticated, service_role;
CREATE TRIGGER cantiere_listini_speciali_updated_by BEFORE UPDATE ON public.cantiere_listini_speciali
FOR EACH ROW EXECUTE FUNCTION public.cantiere_listini_speciali_autore_update();

-- Exact OR of the two former permissive UPDATE predicates read from pg_policies;
-- only the row-column names are replaced by function arguments.
CREATE FUNCTION public.auth_puo_modificare_cantiere(_cliente_id uuid, _lead_id uuid, _agente_codice text, _created_by uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO public AS $$
SELECT
 (( SELECT has_role(( SELECT auth.uid() AS uid), 'responsabile_agenti'::app_role) AS has_role)
 OR ((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'agente'::app_role) AS has_role))
 AND (user_can_write_cliente(_cliente_id) OR ((_cliente_id IS NULL) AND (_lead_id IS NOT NULL) AND has_lead_module_access(auth.uid()))))
 OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'amministrazione'::app_role) AS has_role)
 OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'direzione'::app_role) AS has_role)
 OR (( SELECT has_role(( SELECT auth.uid() AS uid), 'agente'::app_role) AS has_role)
 AND agente_vede_record(_agente_codice, _created_by, _cliente_id, _lead_id, NULL::uuid)))
 OR (( SELECT auth_preventivista() AS auth_preventivista) AND (_created_by = auth.uid()));
$$;
REVOKE EXECUTE ON FUNCTION public.auth_puo_modificare_cantiere(uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_modificare_cantiere(uuid,uuid,text,uuid) TO authenticated, service_role;

DROP POLICY "Cantieri: update come il cliente" ON public.cantieri;
DROP POLICY "Preventivisti: cantieri UPDATE propri" ON public.cantieri;
CREATE POLICY "Cantieri: update (fonte unica)" ON public.cantieri AS PERMISSIVE FOR UPDATE TO authenticated
USING (public.auth_puo_modificare_cantiere(cliente_id,lead_id,agente_codice,created_by))
WITH CHECK (public.auth_puo_modificare_cantiere(cliente_id,lead_id,agente_codice,created_by));

DROP POLICY "cantiere_listini_speciali_prev_select" ON public.cantiere_listini_speciali;
DROP POLICY "cantiere_listini_speciali_prev_write" ON public.cantiere_listini_speciali;
CREATE POLICY "Prezzi cantiere: SELECT chi vede il cantiere" ON public.cantiere_listini_speciali AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.cantieri c WHERE c.id = cantiere_id));
CREATE POLICY "Prezzi cantiere: INSERT chi modifica il cantiere" ON public.cantiere_listini_speciali AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.cantieri c WHERE c.id = cantiere_id AND public.auth_puo_modificare_cantiere(c.cliente_id,c.lead_id,c.agente_codice,c.created_by)));
CREATE POLICY "Prezzi cantiere: UPDATE chi modifica il cantiere" ON public.cantiere_listini_speciali AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.cantieri c WHERE c.id = cantiere_id AND public.auth_puo_modificare_cantiere(c.cliente_id,c.lead_id,c.agente_codice,c.created_by)))
WITH CHECK (EXISTS (SELECT 1 FROM public.cantieri c WHERE c.id = cantiere_id AND public.auth_puo_modificare_cantiere(c.cliente_id,c.lead_id,c.agente_codice,c.created_by)));
CREATE POLICY "Prezzi cantiere: DELETE chi modifica il cantiere" ON public.cantiere_listini_speciali AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.cantieri c WHERE c.id = cantiere_id AND public.auth_puo_modificare_cantiere(c.cliente_id,c.lead_id,c.agente_codice,c.created_by)));