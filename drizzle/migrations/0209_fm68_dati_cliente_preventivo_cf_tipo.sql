DROP FUNCTION public.dati_cliente_preventivo(uuid);
CREATE FUNCTION public.dati_cliente_preventivo(_id uuid)
RETURNS TABLE(id uuid,codice_gestionale text,ragione_sociale text,partita_iva text,codice_fiscale text,tipo_soggetto text,indirizzo text,cap text,citta text,provincia text,telefono text,cellulare text,email text,pec text,condizione_pagamento_cod text,condizione_pagamento_desc text,codice_agente text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.auth_consulta_preventivi() THEN
    RAISE EXCEPTION 'Non autorizzato a consultare il cliente per il preventivo' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT c.id,c.codice_gestionale,c.ragione_sociale,c.partita_iva,c.codice_fiscale,c.tipo_soggetto,c.indirizzo,c.cap,c.citta,c.provincia,c.telefono,c.cellulare,c.email,c.pec,c.condizione_pagamento_cod,coalesce(cp.descrizione,c.condizione_pagamento_desc),c.codice_agente
  FROM public.clienti c LEFT JOIN public.codici_pagamento cp ON cp.cod=c.condizione_pagamento_cod
  WHERE c.id=_id AND ((SELECT public.auth_ha_accesso_preventivi()) OR public.user_can_access_cliente(c.id,c.store_id,c.codice_agente)
    OR EXISTS (SELECT 1 FROM public.preventivi p WHERE p.cliente_id=c.id AND public.auth_vede_preventivo(p.agente_codice,p.cliente_id,p.cantiere_id)));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dati_cliente_preventivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dati_cliente_preventivo(uuid) TO authenticated, service_role;