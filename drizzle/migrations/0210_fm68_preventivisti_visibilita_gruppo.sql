CREATE FUNCTION public.auth_preventivista()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('preventivi_write', 'preventivi_manage')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.auth_preventivista() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_preventivista() TO authenticated, service_role;

CREATE POLICY "Preventivisti: cantieri SELECT"
ON public.cantieri AS PERMISSIVE FOR SELECT TO authenticated
USING ((SELECT public.auth_preventivista()));

CREATE POLICY "Preventivisti: cantieri INSERT propri"
ON public.cantieri AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK ((SELECT public.auth_preventivista()) AND created_by = auth.uid());

CREATE POLICY "Preventivisti: cantieri UPDATE propri"
ON public.cantieri AS PERMISSIVE FOR UPDATE TO authenticated
USING ((SELECT public.auth_preventivista()) AND created_by = auth.uid())
WITH CHECK ((SELECT public.auth_preventivista()) AND created_by = auth.uid());

CREATE POLICY "Preventivisti: contatti SELECT clienti e lead"
ON public.contatti AS PERMISSIVE FOR SELECT TO authenticated
USING ((SELECT public.auth_preventivista()) AND (cliente_id IS NOT NULL OR lead_id IS NOT NULL));

CREATE POLICY "Preventivisti: contatti INSERT propri clienti e lead"
ON public.contatti AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK ((SELECT public.auth_preventivista()) AND (cliente_id IS NOT NULL OR lead_id IS NOT NULL) AND created_by = auth.uid());

CREATE POLICY "Preventivisti: contatti UPDATE propri clienti e lead"
ON public.contatti AS PERMISSIVE FOR UPDATE TO authenticated
USING ((SELECT public.auth_preventivista()) AND (cliente_id IS NOT NULL OR lead_id IS NOT NULL) AND created_by = auth.uid())
WITH CHECK ((SELECT public.auth_preventivista()) AND (cliente_id IS NOT NULL OR lead_id IS NOT NULL) AND created_by = auth.uid());

CREATE POLICY "Preventivisti: lead SELECT"
ON public.lead AS PERMISSIVE FOR SELECT TO authenticated
USING ((SELECT public.auth_preventivista()));

CREATE POLICY "Preventivisti: lead INSERT propri"
ON public.lead AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK ((SELECT public.auth_preventivista()) AND created_by = auth.uid());

CREATE POLICY "Preventivisti: lead UPDATE propri"
ON public.lead AS PERMISSIVE FOR UPDATE TO authenticated
USING ((SELECT public.auth_preventivista()) AND created_by = auth.uid())
WITH CHECK ((SELECT public.auth_preventivista()) AND created_by = auth.uid());