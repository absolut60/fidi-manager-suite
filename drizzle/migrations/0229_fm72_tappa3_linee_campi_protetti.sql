CREATE OR REPLACE FUNCTION public.profili_blocca_campi_protetti()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'amministratore'::public.app_role)
     AND (NEW.store_id IS DISTINCT FROM OLD.store_id
          OR NEW.codice_agente IS DISTINCT FROM OLD.codice_agente
          OR NEW.attivo IS DISTINCT FROM OLD.attivo
          OR NEW.linee_abilitate IS DISTINCT FROM OLD.linee_abilitate
          OR NEW.linea_predefinita IS DISTINCT FROM OLD.linea_predefinita) THEN
    RAISE EXCEPTION 'Non puoi modificare negozio, codice agente, stato attivo o linee del preventivatore del profilo';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.profili_blocca_campi_protetti() FROM PUBLIC, anon;