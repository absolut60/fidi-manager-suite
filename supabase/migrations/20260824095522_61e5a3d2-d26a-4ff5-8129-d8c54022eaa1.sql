-- 1) Revoke execute from anon/public on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.crea_canale_task() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notifica_assegnazione_task() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notifica_nuovo_messaggio() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crea_o_apri_diretto(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.elimina_canale(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.elimina_task(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_canali_non_letti() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.segna_canale_letto(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_puo_accedere_messaggio(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_puo_accedere_task(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.crea_o_apri_diretto(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.elimina_canale(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.elimina_task(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_canali_non_letti() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.segna_canale_letto(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_puo_accedere_messaggio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_puo_accedere_task(uuid, uuid) TO authenticated, service_role;

-- 2) campagne_email_clic: remove marketing role from IP/user-agent visibility
DROP POLICY IF EXISTS "Clic visibili ai ruoli direzionali" ON public.campagne_email_clic;
CREATE POLICY "Clic visibili ai ruoli direzionali"
ON public.campagne_email_clic FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
);

-- 3) clienti insert: strict consistency with own profile
DROP POLICY IF EXISTS "Autenticati creano clienti" ON public.clienti;
CREATE POLICY "Autenticati creano clienti"
ON public.clienti FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (
    has_role(auth.uid(), 'agente'::app_role)
    AND codice_agente IS NOT NULL
    AND codice_agente = (SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid())
    AND (
      store_id IS NULL
      OR store_id = (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
    )
  )
  OR (
    NOT has_role(auth.uid(), 'agente'::app_role)
    AND store_id IS NOT NULL
    AND store_id = (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
    AND (
      codice_agente IS NULL
      OR codice_agente = (SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid())
    )
  )
);

-- 4) profili: allow self email change, keep store/agente/attivo admin-only
DROP POLICY IF EXISTS "Utenti aggiornano il proprio profilo" ON public.profili;
CREATE POLICY "Utenti aggiornano il proprio profilo"
ON public.profili FOR UPDATE TO authenticated
USING (auth.uid() = id OR has_role(auth.uid(), 'amministratore'::app_role))
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (
    auth.uid() = id
    AND NOT EXISTS (
      SELECT 1 FROM public.profili p
      WHERE p.id = auth.uid()
        AND (
          p.store_id IS DISTINCT FROM profili.store_id
          OR p.codice_agente IS DISTINCT FROM profili.codice_agente
          OR p.attivo IS DISTINCT FROM profili.attivo
        )
    )
  )
);

-- 5) realtime: topic-scoped access for chat channels
DROP POLICY IF EXISTS "Realtime: canali solo membri" ON realtime.messages;
CREATE POLICY "Realtime: canali solo membri"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE 'canale:%'
  AND public.is_canale_membro(
    NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid,
    auth.uid()
  )
);