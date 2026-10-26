-- FM48 Gestione legale, fetta 2: policy storage del bucket pratiche-legali.
DROP POLICY IF EXISTS "Pratiche legali storage: insert admin/approvatori" ON storage.objects;
DROP POLICY IF EXISTS "Pratiche legali storage: update admin/approvatori" ON storage.objects;
DROP POLICY IF EXISTS "Pratiche legali storage: delete admin" ON storage.objects;
DROP POLICY IF EXISTS "Pratiche legali storage: read admin/approvatori" ON storage.objects;

CREATE POLICY "Pratiche legali storage: insert gestione legale" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pratiche-legali' AND (SELECT public.auth_puo_gestire_legale()));

CREATE POLICY "Pratiche legali storage: update gestione legale" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'pratiche-legali' AND (SELECT public.auth_puo_gestire_legale()))
  WITH CHECK (bucket_id = 'pratiche-legali' AND (SELECT public.auth_puo_gestire_legale()));

CREATE POLICY "Pratiche legali storage: delete admin/gestione legale" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'pratiche-legali' AND (
    public.has_role(auth.uid(), 'amministratore'::public.app_role)
    OR (SELECT public.auth_puo_gestire_legale())
  ));

CREATE POLICY "Pratiche legali storage: read admin/approvatori/gestione legale" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pratiche-legali' AND (
    public.has_role(auth.uid(), 'amministratore'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv1'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv2'::public.app_role)
    OR public.has_role(auth.uid(), 'approvatore_liv3'::public.app_role)
    OR (SELECT public.auth_puo_gestire_legale())
  ));
