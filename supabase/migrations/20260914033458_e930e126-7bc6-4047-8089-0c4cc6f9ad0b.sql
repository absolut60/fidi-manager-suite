CREATE OR REPLACE FUNCTION public.has_eventi_module_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('amministratore','amministrazione','direzione','marketing','marketing_eventi')
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_eventi_module_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_eventi_module_access(uuid) TO service_role;

-- eventi
DROP POLICY IF EXISTS "eventi_select" ON public.eventi;
CREATE POLICY "eventi_select" ON public.eventi
  FOR SELECT TO authenticated
  USING (public.has_eventi_module_access(auth.uid()));

DROP POLICY IF EXISTS "eventi_insert" ON public.eventi;
CREATE POLICY "eventi_insert" ON public.eventi
  FOR INSERT TO authenticated
  WITH CHECK (public.has_eventi_module_access(auth.uid()));

DROP POLICY IF EXISTS "eventi_update" ON public.eventi;
CREATE POLICY "eventi_update" ON public.eventi
  FOR UPDATE TO authenticated
  USING (public.has_eventi_module_access(auth.uid()))
  WITH CHECK (public.has_eventi_module_access(auth.uid()));

DROP POLICY IF EXISTS "eventi_delete" ON public.eventi;
CREATE POLICY "eventi_delete" ON public.eventi
  FOR DELETE TO authenticated
  USING (public.has_eventi_module_access(auth.uid()));

-- eventi_partecipanti
DROP POLICY IF EXISTS "eventi_partecipanti_select" ON public.eventi_partecipanti;
CREATE POLICY "eventi_partecipanti_select" ON public.eventi_partecipanti
  FOR SELECT TO authenticated
  USING (public.has_eventi_module_access(auth.uid()));

DROP POLICY IF EXISTS "eventi_partecipanti_insert" ON public.eventi_partecipanti;
CREATE POLICY "eventi_partecipanti_insert" ON public.eventi_partecipanti
  FOR INSERT TO authenticated
  WITH CHECK (public.has_eventi_module_access(auth.uid()));

DROP POLICY IF EXISTS "eventi_partecipanti_update" ON public.eventi_partecipanti;
CREATE POLICY "eventi_partecipanti_update" ON public.eventi_partecipanti
  FOR UPDATE TO authenticated
  USING (public.has_eventi_module_access(auth.uid()))
  WITH CHECK (public.has_eventi_module_access(auth.uid()));

DROP POLICY IF EXISTS "eventi_partecipanti_delete" ON public.eventi_partecipanti;
CREATE POLICY "eventi_partecipanti_delete" ON public.eventi_partecipanti
  FOR DELETE TO authenticated
  USING (public.has_eventi_module_access(auth.uid()));