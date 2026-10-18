CREATE OR REPLACE FUNCTION public.export_iscritti_whatsapp(_stato text DEFAULT 'tutti'::text, _origine text DEFAULT 'tutti'::text, _q text DEFAULT NULL::text)
 RETURNS TABLE(numero text, nome text, cognome text, azienda text, email text, origine text, stato text, collegato_a text, data_iscrizione timestamp with time zone, consenso_data timestamp with time zone, consenso_origine text, informativa_versione text, informativa_hash text, ip_address text, user_agent text, secondi_permanenza integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.auth_ha_ruolo_globale_clienti() THEN
    RAISE EXCEPTION 'non_autorizzato';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(i.numero_raw, i.numero_norm) AS numero,
    i.nome, i.cognome, i.azienda, i.email, i.origine, i.stato,
    CASE WHEN i.cliente_id IS NOT NULL THEN 'Cliente'
         WHEN i.lead_id   IS NOT NULL THEN 'Lead'
         ELSE '' END AS collegato_a,
    i.created_at AS data_iscrizione,
    cl.created_at AS consenso_data,
    cl.origine AS consenso_origine,
    cl.informativa_versione, cl.informativa_hash,
    cl.ip_address, cl.user_agent, cl.secondi_permanenza
  FROM public.iscritti_whatsapp i
  LEFT JOIN public.consensi_log cl ON cl.id = i.consenso_log_id
  WHERE (_stato = 'tutti'
         OR (_stato = 'nuovo'    AND i.stato = 'nuovo')
         OR (_stato = 'ignorato' AND i.stato = 'ignorato')
         OR (_stato = 'collegato' AND i.stato LIKE 'collegato%'))
    AND (_origine = 'tutti' OR i.origine = _origine)
    AND (_q IS NULL OR _q = '' OR
         i.numero_raw ILIKE '%'||_q||'%' OR
         i.numero_norm ILIKE '%'||_q||'%' OR
         i.nome       ILIKE '%'||_q||'%' OR
         i.cognome    ILIKE '%'||_q||'%' OR
         i.azienda    ILIKE '%'||_q||'%')
  ORDER BY i.created_at DESC;
END;
$function$;

COMMENT ON FUNCTION public.export_iscritti_whatsapp(text, text, text) IS 'FM45: _q cerca anche su numero_norm (q=numero_norm dalla notifica). Identica alla versione precedente piu la condizione su numero_norm.';