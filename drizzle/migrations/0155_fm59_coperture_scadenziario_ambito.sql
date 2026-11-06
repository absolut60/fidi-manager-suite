CREATE OR REPLACE FUNCTION public.coperture_scadenziario(_today date DEFAULT CURRENT_DATE)
 RETURNS TABLE(scadenza_id uuid, cliente_id uuid, origine text, piano_id uuid, promessa_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH piano AS (
    SELECT DISTINCT ON (d.scadenza_id) d.scadenza_id, p.cliente_id, p.id AS piano_id
    FROM public.piani_rientro_documenti d
    JOIN public.piani_rientro p ON p.id = d.piano_id AND p.stato = 'attivo'
    ORDER BY d.scadenza_id, p.created_at DESC
  ),
  prom AS (
    SELECT DISTINCT ON (ars.scadenza_id) ars.scadenza_id, a.cliente_id, a.id AS promessa_id
    FROM public.azioni_recupero_scadenze ars
    JOIN public.azioni_recupero a ON a.id = ars.azione_id
     AND public.is_promessa_pagamento(a.tipo, a.esito) AND a.stato_promessa = 'attiva'
    WHERE NOT EXISTS (SELECT 1 FROM piano pp WHERE pp.scadenza_id = ars.scadenza_id)
    ORDER BY ars.scadenza_id, a.data_promessa_pagamento NULLS LAST, a.created_at
  ),
  tutte AS (
    SELECT scadenza_id, cliente_id, 'piano'::text AS origine, piano_id, NULL::uuid AS promessa_id FROM piano
    UNION ALL
    SELECT scadenza_id, cliente_id, 'promessa'::text, NULL::uuid, promessa_id FROM prom
  ),
  globale AS MATERIALIZED (SELECT public.auth_ha_ruolo_globale_clienti() AS g)
  SELECT t.scadenza_id, t.cliente_id, t.origine, t.piano_id, t.promessa_id
  FROM tutte t, globale
  WHERE globale.g OR t.cliente_id IN (SELECT public.clienti_ambito_utente_ids())
$function$;

COMMENT ON FUNCTION public.coperture_scadenziario(date) IS 'Coperture (piani di rientro attivi, promesse attive) delle scadenze. FM59: SECURITY DEFINER, quindi applica l''ambito: righe solo se l''utente ha un ruolo globale clienti o il cliente è in clienti_ambito_utente_ids().';

REVOKE EXECUTE ON FUNCTION public.coperture_scadenziario(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coperture_scadenziario(date) TO authenticated, service_role;