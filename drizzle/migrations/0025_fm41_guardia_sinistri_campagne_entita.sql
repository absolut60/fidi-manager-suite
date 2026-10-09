CREATE OR REPLACE FUNCTION public.auth_vede_sinistro_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role'
      OR public.has_role(auth.uid(), 'amministratore'::public.app_role)
      OR public.has_role(auth.uid(), 'amministrazione'::public.app_role)
      OR public.has_role(auth.uid(), 'direzione'::public.app_role)
      OR public.has_role(auth.uid(), 'recupero_crediti'::public.app_role)
      OR (
        NOT public.has_role(auth.uid(), 'store_manager'::public.app_role)
        AND EXISTS (
          SELECT 1 FROM public.clienti c
          WHERE c.id = _cliente_id
            AND public.user_can_access_cliente(c.id, c.store_id, c.codice_agente)
        )
      );
$$;
REVOKE EXECUTE ON FUNCTION public.auth_vede_sinistro_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_vede_sinistro_cliente(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.auth_vede_sinistro_cliente(uuid) IS 'FM41 (09/10/2026). Sinistri assicurativi: tutto per amministratore, amministrazione, direzione, recupero_crediti (e service_role); store manager esclusi; gli altri solo per i clienti visibili (user_can_access_cliente).';

CREATE OR REPLACE FUNCTION public.auth_vede_campagne_entita(_cliente_id uuid, _lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.auth_puo_accedere_marketing()
      OR (
        _cliente_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.clienti c
          WHERE c.id = _cliente_id
            AND public.user_can_access_cliente(c.id, c.store_id, c.codice_agente)
        )
      )
      OR (
        _cliente_id IS NULL AND _lead_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.lead l
          WHERE l.id = _lead_id
            AND (
              public.has_lead_module_access(auth.uid())
              OR public.has_eventi_flusso_access(auth.uid())
              OR public.agente_vede_record(l.agente_codice, l.created_by, l.cliente_id, NULL::uuid, NULL::uuid)
            )
        )
      );
$$;
REVOKE EXECUTE ON FUNCTION public.auth_vede_campagne_entita(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_vede_campagne_entita(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.auth_vede_campagne_entita(uuid, uuid) IS 'FM41 (09/10/2026). Storico campagne di un cliente/lead: chi accede al Marketing (auth_puo_accedere_marketing) oppure chi vede quel cliente (user_can_access_cliente) o quel lead (stessa condizione della policy lead_select: se cambia la policy, cambiare anche qui).';

CREATE OR REPLACE FUNCTION public.get_sinistri_aperti()
 RETURNS TABLE(polizza_id uuid, cliente_id uuid, ragione_sociale text, store_nome text, data_apertura_sinistro date, importo_sinistro numeric, numero_sinistro text, esito_sinistro text, note_sinistro text, numero_polizza text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.* FROM (
  SELECT
    ac.id AS polizza_id,
    ac.cliente_id,
    c.ragione_sociale,
    s.nome AS store_nome,
    ac.data_apertura_sinistro,
    ac.importo_sinistro,
    ac.numero_sinistro,
    ac.esito_sinistro,
    ac.note_sinistro,
    ac.numero_polizza
  FROM public.assicurazioni_credito ac
  JOIN public.clienti c ON c.id = ac.cliente_id
  LEFT JOIN public.stores s ON s.id = c.store_id
  WHERE ac.assicuratore = 'POUEY'
    AND ac.stato = 'sinistro_aperto'
  ORDER BY ac.data_apertura_sinistro DESC NULLS LAST, c.ragione_sociale ASC
  ) q
  WHERE public.auth_vede_sinistro_cliente(q.cliente_id)
  ORDER BY q.data_apertura_sinistro DESC NULLS LAST, q.ragione_sociale ASC;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_sinistri_aperti() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sinistri_aperti() TO authenticated, service_role;
COMMENT ON FUNCTION public.get_sinistri_aperti() IS 'FM41: guardia auth_vede_sinistro_cliente()';

CREATE OR REPLACE FUNCTION public.get_sinistri_da_aprire()
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, store_nome text, scaduto_eur numeric, data_scadenza_piu_vecchia date, giorni_da_scadenza integer, giorni_residui_30 integer, finestra text, promessa_data date, polizza_id uuid, numero_polizza text, importo_assicurato numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.* FROM (
  WITH cls AS (
    SELECT s.cliente_id, s.importo_scadenza, s.data_scadenza,
      public.is_anticipo(s.numero_documento) AS is_anticipo
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta'
      AND s.data_scadenza IS NOT NULL
      AND s.data_scadenza < CURRENT_DATE
      AND upper(COALESCE(s.codice_pagamento,'')) <> 'BOS'
  ),
  agg AS (
    SELECT cls.cliente_id,
      public.calcola_scaduto(
        COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE NOT cls.is_anticipo),0),
        COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.is_anticipo),0)) AS tot_s,
      MIN(cls.data_scadenza) AS min_scad
    FROM cls GROUP BY cls.cliente_id
  ),
  pol AS (
    SELECT DISTINCT ON (ac.cliente_id)
      ac.cliente_id, ac.id AS polizza_id, ac.numero_polizza, ac.importo_assicurato
    FROM public.assicurazioni_credito ac
    WHERE ac.assicuratore = 'POUEY' AND ac.stato = 'attiva'
    ORDER BY ac.cliente_id, ac.data_inizio DESC NULLS LAST, ac.created_at DESC
  ),
  prom AS (
    SELECT ar.cliente_id, MAX(ar.data_promessa_pagamento) AS promessa_data
    FROM public.azioni_recupero ar
    WHERE ar.esito = 'promessa_pagamento' AND ar.data_promessa_pagamento IS NOT NULL
    GROUP BY ar.cliente_id
  )
  SELECT
    cl.id AS cliente_id,
    cl.ragione_sociale,
    st.nome,
    a.tot_s,
    a.min_scad AS min_scad,
    (CURRENT_DATE - a.min_scad)::int,
    (30 - (CURRENT_DATE - a.min_scad))::int,
    CASE
      WHEN (30 - (CURRENT_DATE - a.min_scad)) < 0 THEN 'scaduta'
      WHEN (30 - (CURRENT_DATE - a.min_scad)) <= 7 THEN 'urgente'
      ELSE 'ok'
    END,
    pr.promessa_data,
    p.polizza_id,
    p.numero_polizza,
    p.importo_assicurato
  FROM agg a
  JOIN public.clienti cl ON cl.id = a.cliente_id
  JOIN pol p ON p.cliente_id = cl.id
  LEFT JOIN public.stores st ON st.id = cl.store_id
  LEFT JOIN prom pr ON pr.cliente_id = cl.id
  WHERE a.tot_s > 0
    AND NOT COALESCE(cl.in_gestione_legale, false)
  ORDER BY (30 - (CURRENT_DATE - a.min_scad)) ASC
  ) q
  WHERE public.auth_vede_sinistro_cliente(q.cliente_id)
  ORDER BY (30 - (CURRENT_DATE - q.min_scad)) ASC;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_sinistri_da_aprire() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sinistri_da_aprire() TO authenticated, service_role;
COMMENT ON FUNCTION public.get_sinistri_da_aprire() IS 'FM41: guardia auth_vede_sinistro_cliente()';

CREATE OR REPLACE FUNCTION public.get_campagne_entita(_cliente_id uuid DEFAULT NULL::uuid, _lead_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(campagna_id uuid, campagna_nome text, campagna_oggetto text, campagna_stato text, campagna_inviata_at timestamp with time zone, destinatario_id uuid, email text, tipo_destinatario text, stato_invio text, inviato_at timestamp with time zone, num_clic integer, ultimo_clic_at timestamp with time zone, errore text, canale text, contatto_id uuid, contatto_nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.* FROM (
  WITH base AS (
    SELECT d.id AS destinatario_id, d.campagna_id, d.email, d.tipo_destinatario, d.stato_invio,
           d.inviato_at, d.num_clic, d.ultimo_clic_at, d.errore, d.contatto_id,
           'cliente'::text AS canale
    FROM public.campagne_email_destinatari d
    WHERE _cliente_id IS NOT NULL AND d.cliente_id = _cliente_id

    UNION ALL

    SELECT d.id, d.campagna_id, d.email, d.tipo_destinatario, d.stato_invio,
           d.inviato_at, d.num_clic, d.ultimo_clic_at, d.errore, d.contatto_id,
           'cliente'::text
    FROM public.campagne_email_destinatari d
    WHERE _cliente_id IS NOT NULL AND d.contatto_id IN (
      SELECT c.id FROM public.contatti c WHERE c.cliente_id = _cliente_id AND c.lead_id IS NULL
    )

    UNION ALL

    SELECT d.id, d.campagna_id, d.email, d.tipo_destinatario, d.stato_invio,
           d.inviato_at, d.num_clic, d.ultimo_clic_at, d.errore, d.contatto_id,
           'lead'::text
    FROM public.campagne_email_destinatari d
    WHERE _cliente_id IS NOT NULL AND d.contatto_id IN (
      SELECT c.id FROM public.contatti c
      WHERE c.lead_id IN (SELECT l.id FROM public.lead l WHERE l.cliente_id = _cliente_id)
    )

    UNION ALL

    SELECT d.id, d.campagna_id, d.email, d.tipo_destinatario, d.stato_invio,
           d.inviato_at, d.num_clic, d.ultimo_clic_at, d.errore, d.contatto_id,
           'lead'::text
    FROM public.campagne_email_destinatari d
    WHERE _cliente_id IS NULL AND _lead_id IS NOT NULL AND d.contatto_id IN (
      SELECT c.id FROM public.contatti c WHERE c.lead_id = _lead_id
    )
  ),
  dedup AS (
    SELECT DISTINCT ON (b.destinatario_id) b.*
    FROM base b
    ORDER BY b.destinatario_id, (CASE WHEN b.canale = 'cliente' THEN 0 ELSE 1 END)
  )
  SELECT
    m.id, m.nome, m.oggetto, m.stato, m.inviata_at,
    x.destinatario_id, x.email, x.tipo_destinatario, x.stato_invio, x.inviato_at,
    x.num_clic, x.ultimo_clic_at, x.errore,
    x.canale,
    x.contatto_id,
    NULLIF(btrim(concat_ws(' ', c.nome, c.cognome)), '') AS contatto_nome
  FROM dedup x
  JOIN public.campagne_email_marketing m ON m.id = x.campagna_id
  LEFT JOIN public.contatti c ON c.id = x.contatto_id
  ORDER BY m.inviata_at DESC NULLS LAST, x.inviato_at DESC NULLS LAST
  ) q
  WHERE public.auth_vede_campagne_entita(_cliente_id, _lead_id)
  ORDER BY q.inviata_at DESC NULLS LAST, q.inviato_at DESC NULLS LAST;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_campagne_entita(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campagne_entita(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_campagne_entita(uuid, uuid) IS 'FM41: guardia auth_vede_campagne_entita()';