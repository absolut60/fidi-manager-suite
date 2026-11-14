CREATE FUNCTION public.indicatore_cliente_preventivo(_cliente_id uuid)
RETURNS TABLE(stadio text, bloccato boolean, in_legale boolean, scaduto_presente boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.auth_consulta_preventivi() THEN
    RAISE EXCEPTION 'Non autorizzato a consultare il cliente per il preventivo' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT sem.stadio, coalesce(c.bloccato,false), coalesce(c.in_gestione_legale,false), coalesce(sc.eur_scaduto,0) > 0
  FROM public.clienti c
  LEFT JOIN public.calcola_semaforo_affidabilita_batch(ARRAY[_cliente_id]) sem ON sem.cliente_id=c.id
  LEFT JOIN public.scaduto_semaforo_batch(ARRAY[_cliente_id]) sc ON sc.cliente_id=c.id
  WHERE c.id=_cliente_id AND ((SELECT public.auth_ha_accesso_preventivi()) OR public.user_can_access_cliente(c.id,c.store_id,c.codice_agente)
    OR EXISTS (SELECT 1 FROM public.preventivi p WHERE p.cliente_id=c.id AND public.auth_vede_preventivo(p.agente_codice,p.cliente_id,p.cantiere_id)));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.indicatore_cliente_preventivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.indicatore_cliente_preventivo(uuid) TO authenticated, service_role;