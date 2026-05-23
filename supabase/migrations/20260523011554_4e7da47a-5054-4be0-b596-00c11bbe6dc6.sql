-- Revoca accesso PUBLIC/anon dove non necessario
REVOKE EXECUTE ON FUNCTION public.calcola_livello_fido(numeric) FROM PUBLIC, anon;

-- Le funzioni trigger-only non devono essere chiamabili direttamente
REVOKE EXECUTE ON FUNCTION public.aggiorna_blocco_cliente() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_clienti() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_richieste_fido() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crea_richiesta_fido_da_cliente() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notifica_richiesta() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Mantieni accesso per: has_role, get_user_role (necessarie per RLS),
-- calcola_livello_fido per authenticated (necessaria per il trigger su INSERT richieste_fido)