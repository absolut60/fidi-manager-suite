CREATE OR REPLACE FUNCTION public.user_puo_accedere_messaggio(_messaggio_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    has_role(_user_id, 'amministratore'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.messaggi m
      JOIN public.canale_membri cm ON cm.canale_id = m.canale_id
      WHERE m.id = _messaggio_id
        AND cm.user_id = _user_id
    )
$function$;

GRANT EXECUTE ON FUNCTION public.user_puo_accedere_messaggio(uuid, uuid)
  TO authenticated, service_role, supabase_read_only_user;

ALTER TABLE public.allegati DROP CONSTRAINT allegati_entita_tipo_check;
ALTER TABLE public.allegati
  ADD CONSTRAINT allegati_entita_tipo_check
  CHECK (entita_tipo = ANY (ARRAY[
    'cliente'::text, 'assicurazione'::text, 'pratica_legale'::text,
    'azione_recupero'::text, 'richiesta_fido'::text, 'piano_rientro'::text,
    'campagna_email'::text, 'articolo'::text, 'kit'::text, 'preventivo'::text,
    'task'::text, 'messaggio'::text
  ]));

DROP POLICY IF EXISTS allegati_select ON public.allegati;
CREATE POLICY allegati_select ON public.allegati
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR ((cliente_id IS NOT NULL) AND user_can_access_cliente(cliente_id))
  OR ((entita_tipo = 'campagna_email'::text) AND (has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'marketing'::app_role)))
  OR ((entita_tipo = ANY (ARRAY['articolo'::text, 'kit'::text, 'preventivo'::text])) AND has_role(auth.uid(), 'amministratore'::app_role))
  OR ((entita_tipo = 'task'::text) AND user_puo_accedere_task(entita_id, auth.uid()))
  OR ((entita_tipo = 'messaggio'::text) AND user_puo_accedere_messaggio(entita_id, auth.uid()))
);

DROP POLICY IF EXISTS allegati_insert ON public.allegati;
CREATE POLICY allegati_insert ON public.allegati
FOR INSERT TO authenticated
WITH CHECK (
  (caricato_da = auth.uid())
  AND (
    ((entita_tipo = 'campagna_email'::text) AND (cliente_id IS NULL) AND (has_role(auth.uid(), 'amministratore'::app_role) OR has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role) OR has_role(auth.uid(), 'marketing'::app_role)) AND (EXISTS (SELECT 1 FROM campagne_email_marketing c WHERE c.id = allegati.entita_id)))
    OR ((cliente_id IS NOT NULL) AND (
        has_role(auth.uid(), 'amministratore'::app_role)
        OR ((entita_tipo = 'assicurazione'::text) AND user_can_access_cliente(cliente_id) AND (has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role)))
        OR ((entita_tipo = 'pratica_legale'::text) AND user_can_access_cliente(cliente_id) AND (has_role(auth.uid(), 'approvatore_liv1'::app_role) OR has_role(auth.uid(), 'approvatore_liv2'::app_role) OR has_role(auth.uid(), 'approvatore_liv3'::app_role)))
        OR ((entita_tipo = ANY (ARRAY['cliente'::text, 'azione_recupero'::text, 'piano_rientro'::text])) AND user_can_access_cliente(cliente_id))
        OR ((entita_tipo = 'richiesta_fido'::text) AND user_can_access_richiesta_fido(entita_id))
      ))
    OR ((entita_tipo = ANY (ARRAY['articolo'::text, 'kit'::text, 'preventivo'::text])) AND has_role(auth.uid(), 'amministratore'::app_role))
    OR ((entita_tipo = 'task'::text) AND (cliente_id IS NULL) AND user_puo_accedere_task(entita_id, auth.uid()))
    OR ((entita_tipo = 'messaggio'::text) AND (cliente_id IS NULL) AND user_puo_accedere_messaggio(entita_id, auth.uid()))
  )
);

DROP POLICY IF EXISTS allegati_storage_select ON storage.objects;
CREATE POLICY allegati_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  (bucket_id = 'allegati'::text) AND (
    EXISTS (
      SELECT 1 FROM allegati a
      WHERE a.storage_path = objects.name
        AND (
          has_role(auth.uid(), 'amministratore'::app_role)
          OR ((a.cliente_id IS NOT NULL) AND user_can_access_cliente(a.cliente_id))
          OR ((a.entita_tipo = 'campagna_email'::text) AND (has_role(auth.uid(), 'amministrazione'::app_role) OR has_role(auth.uid(), 'direzione'::app_role)))
          OR ((a.entita_tipo = 'task'::text) AND user_puo_accedere_task(a.entita_id, auth.uid()))
          OR ((a.entita_tipo = 'messaggio'::text) AND user_puo_accedere_messaggio(a.entita_id, auth.uid()))
        )
    )
    OR ((split_part(name, '/', 1) = 'task') AND user_puo_accedere_task(NULLIF(split_part(name, '/', 2), '')::uuid, auth.uid()))
    OR ((split_part(name, '/', 1) = 'messaggio') AND user_puo_accedere_messaggio(NULLIF(split_part(name, '/', 2), '')::uuid, auth.uid()))
  )
);

DROP POLICY IF EXISTS allegati_storage_insert ON storage.objects;
CREATE POLICY allegati_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  (bucket_id = 'allegati'::text) AND (owner = auth.uid()) AND (
    ((split_part(name, '/', 1) = 'richiesta_fido'::text) AND user_can_access_richiesta_fido((NULLIF(split_part(name, '/', 2), ''::text))::uuid))
    OR user_can_access_cliente(allegato_storage_path_cliente_id(name))
    OR has_role(auth.uid(), 'amministratore'::app_role)
    OR has_role(auth.uid(), 'amministrazione'::app_role)
    OR has_role(auth.uid(), 'direzione'::app_role)
    OR ((split_part(name, '/', 1) = 'task') AND user_puo_accedere_task(NULLIF(split_part(name, '/', 2), '')::uuid, auth.uid()))
    OR ((split_part(name, '/', 1) = 'messaggio') AND user_puo_accedere_messaggio(NULLIF(split_part(name, '/', 2), '')::uuid, auth.uid()))
  )
);