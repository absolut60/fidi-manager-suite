
-- 1) Helper: accesso a una richiesta fido (stessa regola SELECT richieste_fido)
CREATE OR REPLACE FUNCTION public.user_can_access_richiesta_fido(_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.richieste_fido rf
    WHERE rf.id = _id
      AND (
        public.has_role(auth.uid(), 'amministratore'::app_role)
        OR public.has_role(auth.uid(), 'amministrazione'::app_role)
        OR public.has_role(auth.uid(), 'direzione'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
        OR rf.created_by = auth.uid()
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.user_can_access_richiesta_fido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_richiesta_fido(uuid) TO authenticated;

-- 2) Policy INSERT su public.allegati: aggiungi ramo richiesta_fido
DROP POLICY IF EXISTS allegati_insert ON public.allegati;
CREATE POLICY allegati_insert ON public.allegati
FOR INSERT TO authenticated
WITH CHECK (
  cliente_id IS NOT NULL
  AND caricato_da = auth.uid()
  AND (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR (
      entita_tipo = 'assicurazione'
      AND public.user_can_access_cliente(cliente_id)
      AND (
        public.has_role(auth.uid(), 'amministrazione'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
      )
    )
    OR (
      entita_tipo = 'pratica_legale'
      AND public.user_can_access_cliente(cliente_id)
      AND (
        public.has_role(auth.uid(), 'approvatore_liv1'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv2'::app_role)
        OR public.has_role(auth.uid(), 'approvatore_liv3'::app_role)
      )
    )
    OR (
      entita_tipo IN ('cliente','azione_recupero')
      AND public.user_can_write_cliente(cliente_id)
    )
    OR (
      entita_tipo = 'richiesta_fido'
      AND public.user_can_access_richiesta_fido(entita_id)
    )
  )
);

-- 3) Policy INSERT su storage.objects (bucket "allegati")
DROP POLICY IF EXISTS allegati_storage_insert ON storage.objects;
CREATE POLICY allegati_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'allegati'
  AND owner = auth.uid()
  AND (
    -- richiesta_fido: regola di visibilità della richiesta
    (
      split_part(name, '/', 1) = 'richiesta_fido'
      AND public.user_can_access_richiesta_fido(
        NULLIF(split_part(name, '/', 2), '')::uuid
      )
    )
    -- Altri entita_tipo: accesso al cliente
    OR public.user_can_access_cliente(public.allegato_storage_path_cliente_id(name))
    -- Ruoli trasversali (Amministrazione e Direzione non sono in user_can_access_cliente)
    OR public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
  )
);
