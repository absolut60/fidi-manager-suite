REVOKE ALL ON FUNCTION public.get_semaforo_affidabilita_cliente(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.ricalcola_fido_teorico_avvia() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid, integer) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.ricalcola_fido_teorico_finalizza() FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_semaforo_affidabilita_cliente(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ricalcola_fido_teorico_avvia() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ricalcola_fido_teorico_finalizza() TO authenticated, service_role;