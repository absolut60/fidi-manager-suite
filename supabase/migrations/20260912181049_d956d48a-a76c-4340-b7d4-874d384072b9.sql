REVOKE ALL ON FUNCTION public.registra_adesione_evento_whatsapp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registra_adesione_evento_whatsapp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registra_adesione_evento_whatsapp(text) TO service_role;