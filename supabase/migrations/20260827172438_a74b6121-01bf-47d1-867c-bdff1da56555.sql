DROP POLICY "Visibilità clienti per ruolo" ON public.clienti;

CREATE POLICY "Visibilità clienti per ruolo" ON public.clienti
FOR SELECT TO authenticated
USING (
  public.auth_ha_ruolo_globale_clienti()
  OR public.has_role(auth.uid(), 'marketing'::app_role)
  OR public.user_can_access_cliente(id, store_id, codice_agente)
);