CREATE OR REPLACE FUNCTION public.get_clienti_scadenziario_mappa(_cliente_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- FM47: stessa fonte di get_clienti_scadenziario (che applica già la visibilità), in UNA sola risposta.
  -- Formato: { cliente_id: [totale_scaduto, totale_a_scadere, ha_scaduto, ha_a_scadere] }
  SELECT COALESCE(
    jsonb_object_agg(s.cliente_id, jsonb_build_array(s.totale_scaduto, s.totale_a_scadere, s.ha_scaduto, s.ha_a_scadere)),
    '{}'::jsonb)
  FROM public.get_clienti_scadenziario(_cliente_ids) s
$function$;

REVOKE EXECUTE ON FUNCTION public.get_clienti_scadenziario_mappa(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clienti_scadenziario_mappa(uuid[]) TO authenticated;