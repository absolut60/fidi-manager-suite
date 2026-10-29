-- FM52: Dashboard commerciale (Agente) e Iscritti WhatsApp (Stato, Origine) a scelta multipla.
-- Sostituisce 0087 (applicata vuota per errore: contiene solo un commento, nessun effetto).
-- Corpi da pg_get_functiondef; cambiano solo firma e condizioni. NULL o elenco vuoto = tutti.
DO $mig$
DECLARE
  v_def text;
  v_new text;
BEGIN
  -- A. get_dashboard_commerciale
  v_def := pg_get_functiondef('public.get_dashboard_commerciale(text,date,date)'::regprocedure);
  IF md5(v_def) <> 'a7b80383d9773d5f4c0e4d508afe9391' THEN
    RAISE EXCEPTION 'FM52: corpo inatteso get_dashboard_commerciale';
  END IF;
  v_new := replace(v_def, '_agente_codice text DEFAULT NULL::text', '_agenti_codici text[] DEFAULT NULL::text[]');
  v_new := replace(v_new, 'v_filtro_agente text;', 'v_filtro_agente text[];');
  v_new := replace(v_new, 'v_filtro_agente := NULLIF(_agente_codice, '''');',
    'v_filtro_agente := NULLIF(array_remove(_agenti_codici, ''''), ''{}''::text[]);');
  v_new := replace(v_new, 'op.agente_codice = v_filtro_agente', 'op.agente_codice = ANY(v_filtro_agente)');
  v_new := replace(v_new, 'ac.agente_codice = v_filtro_agente', 'ac.agente_codice = ANY(v_filtro_agente)');
  IF position('_agente_codice' in v_new) > 0 OR v_new ~ '= v_filtro_agente\M' THEN
    RAISE EXCEPTION 'FM52: riferimenti residui get_dashboard_commerciale';
  END IF;
  DROP FUNCTION public.get_dashboard_commerciale(text, date, date);
  EXECUTE v_new;

  -- B. export_iscritti_whatsapp
  v_def := pg_get_functiondef('public.export_iscritti_whatsapp(text,text,text)'::regprocedure);
  IF md5(v_def) <> 'afd3b6e73b9c8cb50fded583c1929add' THEN
    RAISE EXCEPTION 'FM52: corpo inatteso export_iscritti_whatsapp';
  END IF;
  v_new := replace(v_def, '_stato text DEFAULT ''tutti''::text, _origine text DEFAULT ''tutti''::text',
    '_stati text[] DEFAULT NULL::text[], _origini text[] DEFAULT NULL::text[]');
  v_new := replace(v_new,
    E'WHERE (_stato = ''tutti''\n         OR (_stato = ''nuovo''    AND i.stato = ''nuovo'')\n         OR (_stato = ''ignorato'' AND i.stato = ''ignorato'')\n         OR (_stato = ''collegato'' AND i.stato LIKE ''collegato%''))\n    AND (_origine = ''tutti'' OR i.origine = _origine)',
    E'WHERE (_stati IS NULL OR cardinality(_stati) = 0 OR ''tutti'' = ANY(_stati)\n         OR (''nuovo'' = ANY(_stati)    AND i.stato = ''nuovo'')\n         OR (''ignorato'' = ANY(_stati) AND i.stato = ''ignorato'')\n         OR (''collegato'' = ANY(_stati) AND i.stato LIKE ''collegato%''))\n    AND (_origini IS NULL OR cardinality(_origini) = 0 OR ''tutti'' = ANY(_origini) OR i.origine = ANY(_origini))');
  IF v_new ~ '\m_stato\M' OR v_new ~ '\m_origine\M' THEN
    RAISE EXCEPTION 'FM52: riferimenti residui export_iscritti_whatsapp';
  END IF;
  DROP FUNCTION public.export_iscritti_whatsapp(text, text, text);
  EXECUTE v_new;
END;
$mig$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_commerciale(text[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_commerciale(text[], date, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.export_iscritti_whatsapp(text[], text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_iscritti_whatsapp(text[], text[], text) TO authenticated, service_role;
DO $g$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_read_only_user') THEN
    GRANT EXECUTE ON FUNCTION public.export_iscritti_whatsapp(text[], text[], text) TO supabase_read_only_user;
  END IF;
END $g$;