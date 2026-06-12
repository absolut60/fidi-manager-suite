DROP POLICY IF EXISTS "Solleciti: insert admin/approvatori" ON public.solleciti;

CREATE POLICY "Solleciti: insert scoped"
ON public.solleciti
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_can_access_cliente(cliente_id)
);