CREATE OR REPLACE FUNCTION public.auth_puo_accedere_marketing()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role'
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('amministratore','amministrazione','direzione','marketing')
      );
$$;
REVOKE EXECUTE ON FUNCTION public.auth_puo_accedere_marketing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_accedere_marketing() TO authenticated, service_role;
COMMENT ON FUNCTION public.auth_puo_accedere_marketing() IS 'FM41 (09/10/2026). Chi accede ai dati Marketing: amministratore, amministrazione, direzione, marketing (gemello TS: MARKETING_ROLES in src/lib/ruoli-marketing.ts) oppure il server (service_role).';

CREATE OR REPLACE FUNCTION public.elenco_persone_whatsapp_segmento(_filtri jsonb, _solo_contattabili boolean DEFAULT true)
 RETURNS TABLE(contatto_id uuid, cliente_id uuid, ragione_sociale text, nome text, cognome text, cellulare text, cellulare_valido boolean, consenso_whatsapp boolean, contattabile boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _publico uuid[];
  _contatti_ids uuid[];
BEGIN
  IF NOT public.auth_puo_accedere_marketing() THEN RAISE EXCEPTION 'Non autorizzato' USING ERRCODE = '42501'; END IF;

  SELECT array_agg(rp.cliente_id)
  INTO _publico
  FROM public.risolvi_pubblico_segmento(_filtri) rp;

  IF coalesce(array_length(_publico, 1), 0) = 0 THEN
    RETURN;
  END IF;

  SELECT array_agg(ct.id)
  INTO _contatti_ids
  FROM public.contatti ct
  WHERE ct.cliente_id = ANY(_publico);

  IF coalesce(array_length(_contatti_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH contatti_pubblico AS MATERIALIZED (
    SELECT
      ct.id AS ct_id,
      ct.cliente_id AS ct_cliente_id,
      ct.nome AS ct_nome,
      ct.cognome AS ct_cognome,
      ct.cellulare AS ct_cellulare
    FROM public.contatti ct
    WHERE ct.id = ANY(_contatti_ids)
  ),
  stati_consensi AS MATERIALIZED (
    SELECT
      sc.contatto_id AS sc_contatto_id,
      sc.whatsapp AS sc_whatsapp
    FROM public.get_stato_consensi(_contatti_ids) sc
  )
  SELECT
    cp.ct_id AS contatto_id,
    cp.ct_cliente_id AS cliente_id,
    cl.ragione_sociale AS ragione_sociale,
    cp.ct_nome AS nome,
    cp.ct_cognome AS cognome,
    cp.ct_cellulare AS cellulare,
    public.fn_telefono_valido(cp.ct_cellulare) AS cellulare_valido,
    COALESCE(sc.sc_whatsapp, false) AS consenso_whatsapp,
    (public.fn_telefono_valido(cp.ct_cellulare) AND COALESCE(sc.sc_whatsapp, false)) AS contattabile
  FROM contatti_pubblico cp
  JOIN public.clienti cl ON cl.id = cp.ct_cliente_id
  LEFT JOIN stati_consensi sc ON sc.sc_contatto_id = cp.ct_id
  WHERE NOT _solo_contattabili
     OR (public.fn_telefono_valido(cp.ct_cellulare) AND COALESCE(sc.sc_whatsapp, false))
  ORDER BY cl.ragione_sociale NULLS LAST, cp.ct_cognome NULLS LAST, cp.ct_nome NULLS LAST;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.elenco_persone_whatsapp_segmento(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elenco_persone_whatsapp_segmento(jsonb, boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.elenco_persone_whatsapp_segmento(jsonb, boolean) IS 'FM41: guardia auth_puo_accedere_marketing()';

CREATE OR REPLACE FUNCTION public.get_clic_destinatari(_campagna_id uuid)
 RETURNS TABLE(destinatario_id uuid, clic_reali integer, clic_auto integer, ultimo_clic_reale timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.* FROM (
  WITH base AS (
    SELECT cl.id, cl.destinatario_id, cl.created_at, cl.url_destinazione,
           EXTRACT(EPOCH FROM (cl.created_at - d.inviato_at)) AS sec,
           floor(EXTRACT(EPOCH FROM cl.created_at)/2)::bigint AS finestra
    FROM campagne_email_clic cl
    JOIN campagne_email_destinatari d ON d.id = cl.destinatario_id
    WHERE d.inviato_at IS NOT NULL
      AND cl.campagna_id = _campagna_id
  ),
  g AS (
    SELECT destinatario_id, finestra, count(DISTINCT url_destinazione) AS n_url
    FROM base GROUP BY 1,2
  ),
  cls AS (
    SELECT b.*, public.is_clic_automatico(b.sec, g.n_url::int) AS automatico
    FROM base b
    JOIN g ON g.destinatario_id = b.destinatario_id AND g.finestra = b.finestra
  )
  SELECT destinatario_id,
         count(*) FILTER (WHERE NOT automatico)::int AS clic_reali,
         count(*) FILTER (WHERE automatico)::int AS clic_auto,
         max(created_at) FILTER (WHERE NOT automatico) AS ultimo_clic_reale
  FROM cls
  GROUP BY destinatario_id
  ) q WHERE public.auth_puo_accedere_marketing()
$function$;
REVOKE EXECUTE ON FUNCTION public.get_clic_destinatari(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clic_destinatari(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_clic_destinatari(uuid) IS 'FM41: guardia auth_puo_accedere_marketing()';

CREATE OR REPLACE FUNCTION public.get_clic_reali_campagne()
 RETURNS TABLE(campagna_id uuid, clic_reali_totali bigint, clic_reali_unici bigint, clic_auto_totali bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.* FROM (
  WITH base AS (
    SELECT cl.id, cl.destinatario_id, cl.campagna_id, cl.url_destinazione,
           EXTRACT(EPOCH FROM (cl.created_at - d.inviato_at)) AS sec,
           floor(EXTRACT(EPOCH FROM cl.created_at)/2)::bigint AS finestra
    FROM campagne_email_clic cl
    JOIN campagne_email_destinatari d ON d.id = cl.destinatario_id
    WHERE d.inviato_at IS NOT NULL
  ),
  g AS (
    SELECT destinatario_id, finestra, count(DISTINCT url_destinazione) AS n_url
    FROM base GROUP BY 1,2
  ),
  cls AS (
    SELECT b.*, public.is_clic_automatico(b.sec, g.n_url::int) AS automatico
    FROM base b
    JOIN g ON g.destinatario_id = b.destinatario_id AND g.finestra = b.finestra
  )
  SELECT campagna_id,
         count(*) FILTER (WHERE NOT automatico) AS clic_reali_totali,
         count(DISTINCT destinatario_id) FILTER (WHERE NOT automatico) AS clic_reali_unici,
         count(*) FILTER (WHERE automatico) AS clic_auto_totali
  FROM cls
  GROUP BY campagna_id
  ) q WHERE public.auth_puo_accedere_marketing()
$function$;
REVOKE EXECUTE ON FUNCTION public.get_clic_reali_campagne() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clic_reali_campagne() TO authenticated, service_role;
COMMENT ON FUNCTION public.get_clic_reali_campagne() IS 'FM41: guardia auth_puo_accedere_marketing()';

CREATE OR REPLACE FUNCTION public.get_clienti_disiscritti_ids(_modo text)
 RETURNS TABLE(id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.* FROM (
  WITH disiscritti AS (
    SELECT c.id
    FROM clienti c
    WHERE c.email IS NOT NULL
      AND lower(btrim(c.email)) IN (SELECT lower(m.email) FROM marketing_opt_out m)
  )
  SELECT d.id FROM disiscritti d
  WHERE _modo = 'disiscritti'
  UNION ALL
  SELECT c.id FROM clienti c
  WHERE _modo = 'non_disiscritti'
    AND c.id NOT IN (SELECT id FROM disiscritti)
  ) q WHERE public.auth_puo_accedere_marketing();
$function$;
REVOKE EXECUTE ON FUNCTION public.get_clienti_disiscritti_ids(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clienti_disiscritti_ids(text) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_clienti_disiscritti_ids(text) IS 'FM41: guardia auth_puo_accedere_marketing()';

CREATE OR REPLACE FUNCTION public.get_clienti_email_valida_ids(_modo text)
 RETURNS TABLE(id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.* FROM (
  WITH email_valida AS (
    SELECT c.id
    FROM clienti c
    WHERE c.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    UNION
    SELECT k.cliente_id AS id
    FROM contatti k
    WHERE k.cliente_id IS NOT NULL
      AND k.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
  SELECT ev.id FROM email_valida ev
  WHERE _modo = 'con'
  UNION ALL
  SELECT c.id FROM clienti c
  WHERE _modo = 'senza'
    AND c.id NOT IN (SELECT id FROM email_valida)
  ) q WHERE public.auth_puo_accedere_marketing();
$function$;
REVOKE EXECUTE ON FUNCTION public.get_clienti_email_valida_ids(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clienti_email_valida_ids(text) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_clienti_email_valida_ids(text) IS 'FM41: guardia auth_puo_accedere_marketing()';

CREATE OR REPLACE FUNCTION public.get_disiscrizioni(_search text DEFAULT NULL::text, _limit integer DEFAULT 100, _offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, email text, cliente_id uuid, ragione_sociale text, codice_gestionale text, origine text, campagna_id uuid, campagna_nome text, operatore_id uuid, operatore_nome text, note text, created_at timestamp with time zone, totale bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.* FROM (
  SELECT
    o.id,
    o.email,
    o.cliente_id,
    c.ragione_sociale,
    c.codice_gestionale,
    o.origine,
    o.campagna_id,
    cam.nome AS campagna_nome,
    o.operatore_id,
    NULLIF(trim(concat_ws(' ', p.nome, p.cognome)), '') AS operatore_nome,
    o.note,
    o.created_at,
    count(*) OVER () AS totale
  FROM marketing_opt_out o
  LEFT JOIN clienti c ON c.id = o.cliente_id
  LEFT JOIN campagne_email_marketing cam ON cam.id = o.campagna_id
  LEFT JOIN profili p ON p.id = o.operatore_id
  WHERE (
    _search IS NULL
    OR btrim(_search) = ''
    OR o.email ILIKE '%' || replace(replace(replace(_search, ',', ' '), '(', ' '), ')', ' ') || '%'
    OR c.ragione_sociale ILIKE '%' || replace(replace(replace(_search, ',', ' '), '(', ' '), ')', ' ') || '%'
  )
  ORDER BY o.created_at DESC
  LIMIT _limit
  OFFSET _offset
  ) q WHERE public.auth_puo_accedere_marketing()
  ORDER BY q.created_at DESC
$function$;
REVOKE EXECUTE ON FUNCTION public.get_disiscrizioni(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_disiscrizioni(text, integer, integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_disiscrizioni(text, integer, integer) IS 'FM41: guardia auth_puo_accedere_marketing()';

CREATE OR REPLACE FUNCTION public.get_progresso_campagne_in_corso()
 RETURNS TABLE(id uuid, stato text, inviati integer, saltati integer, falliti integer, clic_unici integer, clic_totali integer, ultimo_invio_at timestamp with time zone, avviata_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.* FROM (
  SELECT
    cam.id,
    cam.stato,
    COALESCE(cam.inviati, 0),
    COALESCE(cam.saltati, 0),
    COALESCE(cam.falliti, 0),
    COALESCE(cam.clic_unici, 0),
    COALESCE(cam.clic_totali, 0),
    (SELECT max(d.inviato_at) FROM public.campagne_email_destinatari d WHERE d.campagna_id = cam.id),
    COALESCE(cam.inviata_at, cam.updated_at, cam.created_at)
  FROM public.campagne_email_marketing cam
  WHERE cam.stato = 'in_corso'
  ) q WHERE public.auth_puo_accedere_marketing();
$function$;
REVOKE EXECUTE ON FUNCTION public.get_progresso_campagne_in_corso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_progresso_campagne_in_corso() TO authenticated, service_role;
COMMENT ON FUNCTION public.get_progresso_campagne_in_corso() IS 'FM41: guardia auth_puo_accedere_marketing()';