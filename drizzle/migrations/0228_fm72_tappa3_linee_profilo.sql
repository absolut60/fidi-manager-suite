-- FM72 tappa 3a: linee abilitate sul profilo e visibilità preventivi per sede/linea.
ALTER TABLE public.profili
  ADD COLUMN IF NOT EXISTS linee_abilitate public.linea_preventivo[] NOT NULL DEFAULT '{sistema_made}',
  ADD COLUMN IF NOT EXISTS linea_predefinita public.linea_preventivo NOT NULL DEFAULT 'sistema_made';

CREATE OR REPLACE FUNCTION public.auth_linee_abilitate()
 RETURNS public.linea_preventivo[]
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce((SELECT linee_abilitate FROM public.profili WHERE id = auth.uid()), '{}'::public.linea_preventivo[]);
$$;
REVOKE EXECUTE ON FUNCTION public.auth_linee_abilitate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_linee_abilitate() TO authenticated, service_role;

DROP POLICY IF EXISTS preventivi_select ON public.preventivi;
DROP POLICY IF EXISTS preventivi_insert ON public.preventivi;
DROP POLICY IF EXISTS preventivi_update ON public.preventivi;
DROP POLICY IF EXISTS preventivi_delete ON public.preventivi;
DROP FUNCTION public.auth_vede_preventivo(text, uuid, uuid, uuid);
DROP FUNCTION public.auth_puo_scrivere_preventivo(text);

CREATE FUNCTION public.auth_vede_preventivo(_agente_codice text, _cliente_id uuid, _cantiere_id uuid, _lead_id uuid, _linea public.linea_preventivo, _store_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (
       has_role(auth.uid(),'amministratore'::app_role)
    OR ( (has_role(auth.uid(),'preventivi_manage'::app_role) OR has_role(auth.uid(),'preventivi_write'::app_role) OR has_role(auth.uid(),'preventivi_read'::app_role))
         AND _linea = ANY(public.auth_linee_abilitate()) )
    OR ( has_role(auth.uid(),'store_manager'::app_role)
         AND _store_id IS NOT NULL
         AND _store_id = (SELECT store_id FROM public.profili WHERE id = auth.uid()) )
    OR ( has_role(auth.uid(),'showroom'::app_role)
         AND _store_id IS NOT NULL
         AND _store_id = (SELECT store_id FROM public.profili WHERE id = auth.uid())
         AND _linea = ANY(public.auth_linee_abilitate()) )
  )
  AND ( NOT ( has_role(auth.uid(),'agente'::app_role)
              AND NOT has_role(auth.uid(),'amministratore'::app_role)
              AND NOT has_role(auth.uid(),'preventivi_manage'::app_role) )
        OR public.agente_vede_record(_agente_codice, NULL, _cliente_id, _lead_id, _cantiere_id) );
$$;
REVOKE EXECUTE ON FUNCTION public.auth_vede_preventivo(text, uuid, uuid, uuid, public.linea_preventivo, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_vede_preventivo(text, uuid, uuid, uuid, public.linea_preventivo, uuid) TO authenticated, service_role;

CREATE FUNCTION public.auth_puo_scrivere_preventivo(_agente_codice text, _linea public.linea_preventivo)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    has_role(auth.uid(),'amministratore')
    OR (has_role(auth.uid(),'preventivi_manage') AND _linea = ANY(public.auth_linee_abilitate()))
    OR (
      has_role(auth.uid(),'preventivi_write')
      AND _linea = ANY(public.auth_linee_abilitate())
      AND _agente_codice IS NOT NULL
      AND _agente_codice = (SELECT codice_agente FROM public.profili WHERE id = auth.uid())
    );
$$;
REVOKE EXECUTE ON FUNCTION public.auth_puo_scrivere_preventivo(text, public.linea_preventivo) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_scrivere_preventivo(text, public.linea_preventivo) TO authenticated, service_role;

CREATE POLICY preventivi_select ON public.preventivi FOR SELECT TO authenticated
  USING (auth_vede_preventivo(agente_codice, cliente_id, cantiere_id, lead_id, linea, store_id));
CREATE POLICY preventivi_insert ON public.preventivi FOR INSERT TO authenticated
  WITH CHECK (auth_puo_scrivere_preventivo(agente_codice, linea));
CREATE POLICY preventivi_update ON public.preventivi FOR UPDATE TO authenticated
  USING (auth_puo_scrivere_preventivo(agente_codice, linea))
  WITH CHECK (auth_puo_scrivere_preventivo(agente_codice, linea));
CREATE POLICY preventivi_delete ON public.preventivi FOR DELETE TO authenticated
  USING (auth_puo_scrivere_preventivo(agente_codice, linea));

CREATE OR REPLACE FUNCTION public.auth_vede_preventivo_id(_preventivo_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.preventivi p
    WHERE p.id = _preventivo_id
      AND public.auth_vede_preventivo(p.agente_codice, p.cliente_id, p.cantiere_id, p.lead_id, p.linea, p.store_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.auth_puo_scrivere_preventivo_id(_preventivo_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.preventivi p
    WHERE p.id = _preventivo_id
      AND public.auth_puo_scrivere_preventivo(p.agente_codice, p.linea)
  );
$function$;

CREATE OR REPLACE FUNCTION public.auth_puo_scrivere_blocco(_blocco_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.blocchi_preventivo b
    JOIN public.preventivi p ON p.id = b.preventivo_id
    WHERE b.id = _blocco_id
      AND public.auth_puo_scrivere_preventivo(p.agente_codice, p.linea)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_clienti_lite_by_ids(_ids uuid[])
 RETURNS TABLE(id uuid, ragione_sociale text, partita_iva text, indirizzo text, cap text, citta text, provincia text, fascia_listino_default text, codice_agente text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.id, c.ragione_sociale, c.partita_iva, c.indirizzo, c.cap, c.citta, c.provincia,
         c.fascia_listino_default::text, c.codice_agente
  FROM public.clienti c
  WHERE c.id = ANY(_ids)
    AND (public.auth_ha_accesso_preventivi()
         OR public.user_can_access_cliente(c.id, c.store_id, c.codice_agente)
         OR EXISTS (SELECT 1 FROM public.preventivi p WHERE p.cliente_id = c.id
                    AND public.auth_vede_preventivo(p.agente_codice, p.cliente_id, p.cantiere_id, p.lead_id, p.linea, p.store_id)));
$function$;

CREATE OR REPLACE FUNCTION public.get_clienti_elenco_preventivi(_ids uuid[])
 RETURNS TABLE(id uuid, ragione_sociale text, codice_gestionale text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.id, c.ragione_sociale, c.codice_gestionale
  FROM public.clienti c
  WHERE c.id = ANY(_ids)
    AND (public.auth_ha_accesso_preventivi()
         OR public.user_can_access_cliente(c.id, c.store_id, c.codice_agente)
         OR EXISTS (SELECT 1 FROM public.preventivi p WHERE p.cliente_id = c.id
                    AND public.auth_vede_preventivo(p.agente_codice, p.cliente_id, p.cantiere_id, p.lead_id, p.linea, p.store_id)));
$function$;

CREATE OR REPLACE FUNCTION public.indicatore_cliente_preventivo(_cliente_id uuid)
 RETURNS TABLE(stadio text, bloccato boolean, in_legale boolean, scaduto_presente boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    OR EXISTS (SELECT 1 FROM public.preventivi p WHERE p.cliente_id=c.id AND public.auth_vede_preventivo(p.agente_codice,p.cliente_id,p.cantiere_id,p.lead_id,p.linea,p.store_id)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.dati_cliente_preventivo(_id uuid)
 RETURNS TABLE(id uuid, codice_gestionale text, ragione_sociale text, partita_iva text, codice_fiscale text, tipo_soggetto text, indirizzo text, cap text, citta text, provincia text, telefono text, cellulare text, email text, pec text, condizione_pagamento_cod text, condizione_pagamento_desc text, codice_agente text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.auth_consulta_preventivi() THEN
    RAISE EXCEPTION 'Non autorizzato a consultare il cliente per il preventivo' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT c.id,c.codice_gestionale,c.ragione_sociale,c.partita_iva,c.codice_fiscale,c.tipo_soggetto,c.indirizzo,c.cap,c.citta,c.provincia,c.telefono,c.cellulare,c.email,c.pec,c.condizione_pagamento_cod,coalesce(cp.descrizione,c.condizione_pagamento_desc),c.codice_agente
  FROM public.clienti c LEFT JOIN public.codici_pagamento cp ON cp.cod=c.condizione_pagamento_cod
  WHERE c.id=_id AND ((SELECT public.auth_ha_accesso_preventivi()) OR public.user_can_access_cliente(c.id,c.store_id,c.codice_agente)
    OR EXISTS (SELECT 1 FROM public.preventivi p WHERE p.cliente_id=c.id AND public.auth_vede_preventivo(p.agente_codice,p.cliente_id,p.cantiere_id,p.lead_id,p.linea,p.store_id)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_cliente_lite(_id uuid)
 RETURNS TABLE(id uuid, ragione_sociale text, partita_iva text, indirizzo text, cap text, citta text, provincia text, fascia_listino_default text, codice_agente text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.id, c.ragione_sociale, c.partita_iva, c.indirizzo, c.cap, c.citta, c.provincia,
         c.fascia_listino_default::text, c.codice_agente
  FROM public.clienti c
  WHERE c.id = _id
    AND (public.auth_ha_accesso_preventivi()
         OR public.user_can_access_cliente(c.id, c.store_id, c.codice_agente)
         OR EXISTS (SELECT 1 FROM public.preventivi p WHERE p.cliente_id = c.id
                    AND public.auth_vede_preventivo(p.agente_codice, p.cliente_id, p.cantiere_id, p.lead_id, p.linea, p.store_id)));
$function$;

DO $verifica$
DECLARE residue text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO residue
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND ( p.prosrc ~ 'auth_vede_preventivo\s*\(\s*[a-z_.]+\s*,\s*[a-z_.]+\s*,\s*[a-z_.]+\s*,\s*[a-z_.]+\s*\)'
       OR p.prosrc ~ 'auth_puo_scrivere_preventivo\s*\(\s*[a-z_.]+\s*\)' );
  IF residue IS NOT NULL THEN
    RAISE EXCEPTION 'Funzioni che citano ancora le firme vecchie: %', residue;
  END IF;
END;
$verifica$;