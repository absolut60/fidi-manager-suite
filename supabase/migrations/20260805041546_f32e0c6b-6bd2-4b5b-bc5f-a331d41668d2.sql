-- 1) Rinomina il role-gate del modulo Lead per evitare che venga scambiato
--    per un controllo di proprietà per-riga.
ALTER FUNCTION public.can_access_lead(uuid) RENAME TO has_lead_module_access;

COMMENT ON FUNCTION public.has_lead_module_access(uuid) IS
  'ROLE GATE: restituisce true se _user_id (sempre auth.uid()) ha uno dei ruoli abilitati al modulo Lead (amministratore, amministrazione, direzione, marketing). NON e'' un controllo di accesso per-riga: non passare mai un lead_id o altro id di entita''.';

-- 2) consensi_log: la policy passava lead_id (id entita'') alla funzione che
--    si aspetta un user id. Correzione al role-gate corretto.
DROP POLICY IF EXISTS "consensi_log_select_accesso_soggetto" ON public.consensi_log;
CREATE POLICY "consensi_log_select_accesso_soggetto"
ON public.consensi_log
FOR SELECT
TO authenticated
USING (
  ((cliente_id IS NOT NULL) AND public.user_can_access_cliente(cliente_id))
  OR ((lead_id IS NOT NULL) AND public.has_lead_module_access(auth.uid()))
  OR ((contatto_id IS NOT NULL) AND EXISTS (
        SELECT 1 FROM public.contatti c
        WHERE c.id = consensi_log.contatto_id
          AND (
            ((c.cliente_id IS NOT NULL) AND public.user_can_access_cliente(c.cliente_id))
            OR ((c.lead_id IS NOT NULL) AND public.has_lead_module_access(auth.uid()))
          )
      ))
);

-- 3) campagne_email_clic: nessuna scrittura diretta dai client applicativi.
--    I clic sono registrati solo da public.registra_clic_campagna (SECURITY DEFINER).
ALTER TABLE public.campagne_email_clic ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.campagne_email_clic FROM authenticated;
REVOKE ALL ON public.campagne_email_clic FROM anon;
GRANT ALL ON public.campagne_email_clic TO service_role;

CREATE POLICY "campagne_email_clic_no_client_insert"
ON public.campagne_email_clic
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "campagne_email_clic_no_client_update"
ON public.campagne_email_clic
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "campagne_email_clic_no_client_delete"
ON public.campagne_email_clic
FOR DELETE
TO authenticated
USING (false);
