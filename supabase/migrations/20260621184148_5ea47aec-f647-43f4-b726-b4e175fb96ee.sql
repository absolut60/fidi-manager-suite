
-- ====================================================================
-- HARDENING SECURITY DEFINER FUNCTIONS
-- Revoca EXECUTE da PUBLIC/anon, concede solo a chi serve.
-- ====================================================================

-- 1) Revoca BLANKET: nessuna funzione pubblica/anon di default
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
  END LOOP;
END $$;

-- 2) Funzioni RLS helper / RPC usate dal frontend autenticato
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_write_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.livello_approvatore(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcola_livello_fido(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_path_cliente_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allegato_storage_path_cliente_id(text) TO authenticated;

-- 3) RPC chiamate da componenti autenticati
GRANT EXECUTE ON FUNCTION public.processa_richiesta_fido(uuid, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invia_comunicazione_richiesta(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marca_comunicazioni_lette(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clienti_scadenziario() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clienti_avvisati() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clienti_senza_email_con_scadenze() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_promemoria_clienti_aggregato(text[], uuid, text, numeric, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recupero_clienti_aggregato(uuid, uuid, text, timestamptz, timestamptz, text[], text[], integer[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dso_aggregato(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dso_serie_mensile(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fatturato_clienti_scadenziario(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coerenza_escalation(uuid[], smallint) TO authenticated;

-- 4) Funzioni admin/server-only: solo service_role
GRANT EXECUTE ON FUNCTION public.genera_snapshot(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_update_clienti_bfa(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_importazione_counters(uuid, integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_importazione_counters(uuid, integer, integer, integer, integer, integer) TO service_role;

-- 5) Trigger functions: nessun GRANT necessario (vengono invocate dal trigger system).
--    handle_new_user, update_updated_at, richieste_fido_prepare, aggiorna_blocco_cliente,
--    notifica_admin_fido_approvato, crea_richiesta_fido_da_cliente, audit_richieste_fido,
--    audit_clienti, richieste_fido_export_init, notifica_richiesta, ricalcola_privacy_cliente
--    => restano senza EXECUTE pubblico (corretto).
