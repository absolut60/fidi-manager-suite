CREATE OR REPLACE FUNCTION public.auth_puo_modificare_sconti_base_fornitore()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Gemello TS: puoModificareScontiBaseFornitore (src/lib/permessi-preventivi.ts).
  SELECT public.auth_puo_gestire_anagrafiche_prev() OR has_role(auth.uid(),'responsabile_showroom');
$function$;
REVOKE EXECUTE ON FUNCTION public.auth_puo_modificare_sconti_base_fornitore() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_modificare_sconti_base_fornitore() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.aggiorna_sconti_base_fornitore(_id uuid, _sconti numeric[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false)
     OR NOT coalesce(public.auth_puo_modificare_sconti_base_fornitore(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  IF _sconti IS NOT NULL AND cardinality(_sconti) > 10 THEN
    RAISE EXCEPTION 'Scontistica di base: massimo 10 valori' USING ERRCODE = '22023';
  END IF;
  -- Solo sconti_base: nessun altro campo del fornitore è modificabile da questa funzione.
  UPDATE public.fornitori SET sconti_base = nullif(_sconti, '{}'::numeric[]), updated_at = now() WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornitore non trovato' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.aggiorna_sconti_base_fornitore(uuid, numeric[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aggiorna_sconti_base_fornitore(uuid, numeric[]) TO authenticated, service_role;