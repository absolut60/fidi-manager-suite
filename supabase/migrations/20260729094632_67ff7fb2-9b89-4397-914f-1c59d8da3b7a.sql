
-- 1) clienti: INSERT/UPDATE — se l'utente è agente deve poter scrivere solo clienti del proprio codice agente
DROP POLICY IF EXISTS "Autenticati creano clienti" ON public.clienti;
CREATE POLICY "Autenticati creano clienti"
ON public.clienti
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (
    NOT has_role(auth.uid(), 'agente'::app_role)
    AND store_id IS NOT NULL
    AND store_id = (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())
  )
  OR (
    has_role(auth.uid(), 'agente'::app_role)
    AND codice_agente IS NOT NULL
    AND codice_agente = (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)
  )
);

DROP POLICY IF EXISTS "Admin o store manager aggiornano clienti" ON public.clienti;
CREATE POLICY "Admin o store manager aggiornano clienti"
ON public.clienti
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (
    NOT has_role(auth.uid(), 'agente'::app_role)
    AND store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())
  )
  OR (
    has_role(auth.uid(), 'agente'::app_role)
    AND codice_agente IS NOT NULL
    AND codice_agente IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (
    NOT has_role(auth.uid(), 'agente'::app_role)
    AND store_id IN (SELECT p.store_id FROM profili p WHERE p.id = auth.uid())
    AND store_id = (SELECT c.store_id FROM public.clienti c WHERE c.id = clienti.id)
  )
  OR (
    has_role(auth.uid(), 'agente'::app_role)
    AND codice_agente IS NOT NULL
    AND codice_agente IN (SELECT p.codice_agente FROM profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)
  )
);

-- 2) comunicazioni_richiesta: UPDATE deve rivalidare l'accesso alla richiesta
DROP POLICY IF EXISTS "Comunicazioni: update solo autore" ON public.comunicazioni_richiesta;
CREATE POLICY "Comunicazioni: update solo autore"
ON public.comunicazioni_richiesta
FOR UPDATE
TO authenticated
USING (
  autore_id = auth.uid()
  AND (
    richiesta_id IN (SELECT r.id FROM public.richieste_fido r WHERE r.created_by = auth.uid())
    OR auth.uid() IN (SELECT a.approvatore_id FROM public.approvazioni a WHERE a.richiesta_id = comunicazioni_richiesta.richiesta_id)
    OR has_role(auth.uid(), 'amministratore'::app_role)
  )
)
WITH CHECK (
  autore_id = auth.uid()
  AND (
    richiesta_id IN (SELECT r.id FROM public.richieste_fido r WHERE r.created_by = auth.uid())
    OR auth.uid() IN (SELECT a.approvatore_id FROM public.approvazioni a WHERE a.richiesta_id = comunicazioni_richiesta.richiesta_id)
    OR has_role(auth.uid(), 'amministratore'::app_role)
  )
);

-- 3) storage.objects: uniforma la SELECT policy per richieste-allegati a split_part come le altre
DROP POLICY IF EXISTS "richieste_allegati_select" ON storage.objects;
CREATE POLICY "richieste_allegati_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'richieste-allegati'
  AND user_can_access_richiesta_interna((split_part(name, '/', 1))::uuid)
);
