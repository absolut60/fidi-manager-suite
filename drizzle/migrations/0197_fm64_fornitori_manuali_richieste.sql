CREATE OR REPLACE FUNCTION public.fornitori_manuali_suggeriti()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.id, f.nome
  FROM public.fornitori f
  WHERE f.origine = 'manuale'
    AND (public.has_role(auth.uid(),'richiedente') OR public.has_role(auth.uid(),'amministratore') OR public.auth_ha_accesso_fornitori())
  ORDER BY f.nome;
$$;
COMMENT ON FUNCTION public.fornitori_manuali_suggeriti() IS 'FM64: suggerimenti fornitori manuali (solo id e nome) per le richieste interne; gate richiedente/amministratore/auth_ha_accesso_fornitori.';

CREATE OR REPLACE FUNCTION public.assicura_fornitore_manuale(_nome text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  n text := btrim(coalesce(_nome, ''));
  v_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'richiedente') OR public.has_role(auth.uid(),'amministratore') OR public.auth_ha_accesso_fornitori()) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;
  IF n = '' THEN RETURN NULL; END IF;
  IF length(n) > 200 THEN
    RAISE EXCEPTION 'Nome fornitore troppo lungo (massimo 200 caratteri)' USING ERRCODE = '22001';
  END IF;
  SELECT f.id INTO v_id FROM public.fornitori f
   WHERE f.origine = 'manuale' AND lower(btrim(f.nome)) = lower(n) LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.fornitori (nome, origine) VALUES (n, 'manuale')
  ON CONFLICT DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT f.id INTO v_id FROM public.fornitori f
     WHERE f.origine = 'manuale' AND lower(btrim(f.nome)) = lower(n) LIMIT 1;
  END IF;
  RETURN v_id;
END;
$$;
COMMENT ON FUNCTION public.assicura_fornitore_manuale(text) IS 'FM64: cerca o crea un fornitore manuale per nome (chiave lower(trim(nome))) per le richieste interne; stesso gate di fornitori_manuali_suggeriti.';

REVOKE ALL ON FUNCTION public.fornitori_manuali_suggeriti() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assicura_fornitore_manuale(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fornitori_manuali_suggeriti() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assicura_fornitore_manuale(text) TO authenticated, service_role;

DROP POLICY IF EXISTS fornitori_select ON public.fornitori;
CREATE POLICY fornitori_select ON public.fornitori FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_accesso_fornitori()));
COMMENT ON POLICY fornitori_select ON public.fornitori IS 'FM64: lettura solo per chi vede il menu Fornitori (auth_ha_accesso_fornitori); i richiedenti usano fornitori_manuali_suggeriti / assicura_fornitore_manuale';

DROP POLICY IF EXISTS fornitore_cliente_select ON public.fornitore_cliente;
CREATE POLICY fornitore_cliente_select ON public.fornitore_cliente FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_accesso_fornitori()));
COMMENT ON POLICY fornitore_cliente_select ON public.fornitore_cliente IS 'FM64: lettura solo per chi vede il menu Fornitori (auth_ha_accesso_fornitori); i richiedenti usano fornitori_manuali_suggeriti / assicura_fornitore_manuale';