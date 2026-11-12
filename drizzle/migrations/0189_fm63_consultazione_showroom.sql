-- FM63 fetta 2 bis: anche showroom consulta (sola lettura) preventivi, ordini, articoli e fornitori come lo store manager.
CREATE OR REPLACE FUNCTION public.auth_consulta_preventivi()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.auth_ha_accesso_preventivi()
      OR coalesce(public.has_role(auth.uid(), 'store_manager'::app_role), false)
      OR coalesce(public.has_role(auth.uid(), 'showroom'::app_role), false);
$$;
COMMENT ON FUNCTION public.auth_consulta_preventivi() IS 'FM63: lettura di preventivi/ordini/catalogo/fornitori (+ store_manager, showroom). Gemello TS puoConsultarePreventivi (src/lib/permessi-preventivi.ts). Solo lettura.';
REVOKE EXECUTE ON FUNCTION public.auth_consulta_preventivi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_consulta_preventivi() TO authenticated, service_role;