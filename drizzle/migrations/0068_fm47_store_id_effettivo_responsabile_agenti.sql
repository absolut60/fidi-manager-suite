CREATE OR REPLACE FUNCTION public.store_id_effettivo(_store_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_store uuid;
BEGIN
  v_uid := auth.uid();

  -- service_role / job interni: nessun utente => comportamento invariato
  IF v_uid IS NULL THEN
    RETURN _store_id;
  END IF;

  -- ruoli con visibilita' globale: parametro rispettato (anche NULL = tutti)
  -- FM47: aggiunto responsabile_agenti (visibilità globale in lettura, decisione FM44)
  IF public.has_role(v_uid, 'amministratore'::app_role)
     OR public.has_role(v_uid, 'direzione'::app_role)
     OR public.has_role(v_uid, 'amministrazione'::app_role)
     OR public.has_role(v_uid, 'approvatore_liv1'::app_role)
     OR public.has_role(v_uid, 'approvatore_liv2'::app_role)
     OR public.has_role(v_uid, 'approvatore_liv3'::app_role)
     OR public.has_role(v_uid, 'responsabile_agenti'::app_role)
  THEN
    RETURN _store_id;
  END IF;

  SELECT p.store_id INTO v_store FROM public.profili p WHERE p.id = v_uid;
  IF v_store IS NOT NULL THEN
    RETURN v_store;
  END IF;

  RAISE EXCEPTION 'Non autorizzato';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.store_id_effettivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_id_effettivo(uuid) TO authenticated;