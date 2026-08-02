-- 1) Allegati richieste interne: nessuna attribuzione a terzi
DROP POLICY IF EXISTS richieste_interne_allegati_insert ON public.richieste_interne_allegati;
CREATE POLICY richieste_interne_allegati_insert
ON public.richieste_interne_allegati
FOR INSERT TO authenticated
WITH CHECK (
  public.user_can_access_richiesta_interna(request_id)
  AND caricato_da = auth.uid()
);

-- 2) Bucket email-assets/campagne: scrittura riservata ai ruoli marketing/admin
CREATE OR REPLACE FUNCTION public.can_manage_email_assets()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'marketing'::app_role)
      OR public.has_role(auth.uid(), 'amministratore'::app_role)
      OR public.has_role(auth.uid(), 'amministrazione'::app_role)
      OR public.has_role(auth.uid(), 'direzione'::app_role)
$$;

DROP POLICY IF EXISTS email_assets_campagne_insert ON storage.objects;
CREATE POLICY email_assets_campagne_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] = 'campagne'
  AND public.can_manage_email_assets()
);

DROP POLICY IF EXISTS email_assets_campagne_update ON storage.objects;
CREATE POLICY email_assets_campagne_update
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] = 'campagne'
  AND public.can_manage_email_assets()
)
WITH CHECK (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] = 'campagne'
  AND public.can_manage_email_assets()
);

DROP POLICY IF EXISTS email_assets_campagne_delete ON storage.objects;
CREATE POLICY email_assets_campagne_delete
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] = 'campagne'
  AND public.can_manage_email_assets()
);