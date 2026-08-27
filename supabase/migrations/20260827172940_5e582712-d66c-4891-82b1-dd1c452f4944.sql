DROP POLICY "Scadenze: select come il cliente" ON public.scadenze;

CREATE POLICY "Scadenze: select come il cliente" ON public.scadenze
FOR SELECT TO authenticated
USING ( public.user_can_access_cliente(cliente_id) );