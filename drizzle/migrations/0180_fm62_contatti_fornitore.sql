-- FM62 G6: contatti del fornitore (stessa tabella contatti) + privacy, esclusi dal marketing.

ALTER TABLE public.contatti ADD COLUMN fornitore_id uuid REFERENCES public.fornitori(id) ON DELETE NO ACTION;
CREATE INDEX contatti_fornitore_id_idx ON public.contatti (fornitore_id) WHERE fornitore_id IS NOT NULL;
COMMENT ON COLUMN public.contatti.fornitore_id IS 'FM62 G6: persona referente del fornitore. Un contatto con SOLO fornitore_id (cliente_id e lead_id null) resta fuori da segmenti, campagne, WhatsApp e riconciliazione.';

-- "Almeno uno dei tre" (mai "esattamente uno": esistono contatti validi con cliente e lead insieme).
ALTER TABLE public.contatti DROP CONSTRAINT contatti_cliente_o_lead_chk;
ALTER TABLE public.contatti ADD CONSTRAINT contatti_cliente_o_lead_chk
  CHECK (cliente_id IS NOT NULL OR lead_id IS NOT NULL OR fornitore_id IS NOT NULL);

-- Policy permissive aggiuntive (le esistenti e le restrittive MFA/showroom restano invariate).
CREATE POLICY "Contatti: fornitore lettura" ON public.contatti FOR SELECT TO authenticated
  USING (fornitore_id IS NOT NULL AND (SELECT public.auth_ha_accesso_fornitori()));
CREATE POLICY "Contatti: fornitore inserimento" ON public.contatti FOR INSERT TO authenticated
  WITH CHECK (fornitore_id IS NOT NULL AND (SELECT public.auth_puo_gestire_fornitori()));
CREATE POLICY "Contatti: fornitore modifica" ON public.contatti FOR UPDATE TO authenticated
  USING (fornitore_id IS NOT NULL AND (SELECT public.auth_puo_gestire_fornitori()))
  WITH CHECK (fornitore_id IS NOT NULL AND (SELECT public.auth_puo_gestire_fornitori()));

-- Registro consensi: soggetto fornitore (additivo).
ALTER TABLE public.consensi_log ADD COLUMN fornitore_id uuid REFERENCES public.fornitori(id) ON DELETE NO ACTION;
CREATE INDEX consensi_log_fornitore_id_idx ON public.consensi_log (fornitore_id) WHERE fornitore_id IS NOT NULL;
CREATE POLICY consensi_log_select_fornitore ON public.consensi_log FOR SELECT TO authenticated
  USING (fornitore_id IS NOT NULL AND (SELECT public.auth_ha_accesso_fornitori()));

CREATE OR REPLACE FUNCTION public.registra_consensi_batch(_contatto_id uuid, _marketing_diretto boolean, _marketing_media boolean, _profilazione boolean, _origine text, _operatore_id uuid DEFAULT NULL::uuid, _prova_path text DEFAULT NULL::text, _ip text DEFAULT NULL::text, _note text DEFAULT NULL::text, _informativa_versione text DEFAULT NULL::text, _informativa_hash text DEFAULT NULL::text, _user_agent text DEFAULT NULL::text, _secondi_permanenza integer DEFAULT NULL::integer, _whatsapp boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente_id uuid;
  v_lead_id uuid;
  v_fornitore_id uuid;
BEGIN
  SELECT c.cliente_id, c.lead_id, c.fornitore_id INTO v_cliente_id, v_lead_id, v_fornitore_id
    FROM public.contatti c WHERE c.id = _contatto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contatto % non trovato', _contatto_id;
  END IF;

  IF _origine NOT IN ('link_pubblico','operatore','recesso_link','import','firma_grafica','di_persona','azienda_gruppo') THEN
    RAISE EXCEPTION 'Origine non valida: %', _origine;
  END IF;

  INSERT INTO public.consensi_log
    (contatto_id, cliente_id, lead_id, fornitore_id, tipo_consenso, valore, origine, operatore_id, prova_path, ip_address, note,
     informativa_versione, informativa_hash, user_agent, secondi_permanenza)
  VALUES
    (_contatto_id, v_cliente_id, v_lead_id, v_fornitore_id, 'marketing_diretto', _marketing_diretto, _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza),
    (_contatto_id, v_cliente_id, v_lead_id, v_fornitore_id, 'marketing_media',   _marketing_media,   _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza),
    (_contatto_id, v_cliente_id, v_lead_id, v_fornitore_id, 'profilazione',      _profilazione,      _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza),
    (_contatto_id, v_cliente_id, v_lead_id, v_fornitore_id, 'trattamento_dati',  true,                _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza),
    (_contatto_id, v_cliente_id, v_lead_id, v_fornitore_id, 'whatsapp',          coalesce(_whatsapp, _marketing_diretto), _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza);

  UPDATE public.contatti
     SET consenso_marketing_diretto = _marketing_diretto,
         consenso_marketing_media   = _marketing_media,
         consenso_profilazione      = _profilazione,
         updated_at = now()
   WHERE id = _contatto_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.registra_consensi_batch(uuid,boolean,boolean,boolean,text,uuid,text,text,text,text,text,text,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registra_consensi_batch(uuid,boolean,boolean,boolean,text,uuid,text,text,text,text,text,text,integer,boolean) TO service_role;

-- Iscritti WhatsApp: mai da un contatto solo-fornitore.
CREATE OR REPLACE FUNCTION public.upsert_iscritto_da_contatto(_contatto_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD;
  v_norm text;
  v_id uuid;
BEGIN
  SELECT id, cliente_id, lead_id, nome, cognome, email, cellulare
    INTO c
  FROM public.contatti
  WHERE id = _contatto_id;

  IF NOT FOUND THEN RETURN NULL; END IF;
  -- FM62 G6: i contatti che appartengono solo a fornitori restano fuori dal marketing.
  IF c.cliente_id IS NULL AND c.lead_id IS NULL THEN RETURN NULL; END IF;

  v_norm := public.normalizza_numero_it(c.cellulare);
  IF v_norm IS NULL THEN RETURN NULL; END IF;

  SELECT i.id INTO v_id
  FROM public.iscritti_whatsapp i
  WHERE i.contatto_id = _contatto_id
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    SELECT i.id INTO v_id
    FROM public.iscritti_whatsapp i
    WHERE i.numero_norm = v_norm
    ORDER BY i.created_at DESC
    LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.iscritti_whatsapp i
    SET contatto_id = _contatto_id,
        cliente_id = COALESCE(c.cliente_id, i.cliente_id),
        lead_id = COALESCE(c.lead_id, i.lead_id),
        nome = COALESCE(NULLIF(btrim(c.nome), ''), i.nome),
        cognome = COALESCE(NULLIF(btrim(c.cognome), ''), i.cognome),
        email = COALESCE(NULLIF(btrim(c.email), ''), i.email),
        stato = CASE
                  WHEN COALESCE(c.cliente_id, i.cliente_id) IS NOT NULL THEN 'collegato_cliente'
                  WHEN COALESCE(c.lead_id, i.lead_id) IS NOT NULL THEN 'collegato_lead'
                  ELSE i.stato
                END
    WHERE i.id = v_id;
  ELSE
    INSERT INTO public.iscritti_whatsapp
      (numero_norm, numero_raw, nome, cognome, email, origine, stato, cliente_id, lead_id, contatto_id)
    VALUES (
      v_norm,
      c.cellulare,
      NULLIF(btrim(c.nome), ''),
      NULLIF(btrim(c.cognome), ''),
      NULLIF(btrim(c.email), ''),
      'di_persona',
      CASE WHEN c.cliente_id IS NOT NULL THEN 'collegato_cliente'
           WHEN c.lead_id IS NOT NULL THEN 'collegato_lead'
           ELSE 'nuovo' END,
      c.cliente_id,
      c.lead_id,
      _contatto_id
    )
    RETURNING id INTO v_id;
  END IF;

  UPDATE public.contatti SET whatsapp_opt_in = true, updated_at = now() WHERE id = _contatto_id;
  UPDATE public.iscritti_whatsapp SET whatsapp_opt_out = false WHERE id = v_id;

  RETURN v_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.upsert_iscritto_da_contatto(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_iscritto_da_contatto(uuid) TO service_role;

-- Riconciliazione / iscrizioni: esclusi i contatti solo-fornitore.
CREATE OR REPLACE FUNCTION public.trova_corrispondenze_soggetto(_email text DEFAULT NULL::text, _partita_iva text DEFAULT NULL::text, _codice_fiscale text DEFAULT NULL::text, _nome text DEFAULT NULL::text, _cognome text DEFAULT NULL::text, _ragione_sociale text DEFAULT NULL::text)
 RETURNS TABLE(tipo text, id uuid, contatto_id uuid, etichetta text, criterio text, privacy_firmata boolean, priorita integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH par AS (
  SELECT
    nullif(lower(trim(coalesce(_email,''))),'')          AS email,
    nullif(trim(coalesce(_partita_iva,'')),'')           AS piva,
    nullif(upper(trim(coalesce(_codice_fiscale,''))),'') AS cf,
    nullif(trim(coalesce(_nome,'')),'')                  AS nome,
    nullif(trim(coalesce(_cognome,'')),'')               AS cognome,
    nullif(trim(coalesce(_ragione_sociale,'')),'')       AS rs
),
cand AS (
  -- priorità 1: email
  SELECT 'contatto'::text AS tipo, coalesce(c.cliente_id, c.lead_id) AS id, c.id AS contatto_id,
         nullif(trim(coalesce(c.nome,'') || ' ' || coalesce(c.cognome,'')),'') AS etichetta,
         'email'::text AS criterio, c.privacy_firmata AS privacy_firmata, 1 AS priorita
  FROM public.contatti c, par p
  WHERE (c.cliente_id IS NOT NULL OR c.lead_id IS NOT NULL) -- FM62 G6: mai contatti solo-fornitore
    AND p.email IS NOT NULL AND lower(trim(coalesce(c.email,''))) = p.email
  UNION ALL
  SELECT 'cliente', cl.id, NULL::uuid, cl.ragione_sociale, 'email', NULL::boolean, 1
  FROM public.clienti cl, par p
  WHERE p.email IS NOT NULL AND lower(trim(coalesce(cl.email,''))) = p.email
  -- priorità 2: partita iva / codice fiscale (esclusi i placeholder)
  UNION ALL
  SELECT 'cliente', cl.id, NULL::uuid, cl.ragione_sociale, 'partita_iva', NULL::boolean, 2
  FROM public.clienti cl, par p
  WHERE p.piva IS NOT NULL AND p.piva NOT IN ('102730','102729')
    AND nullif(trim(coalesce(cl.partita_iva,'')),'') = p.piva
  UNION ALL
  SELECT 'lead', l.id, NULL::uuid, l.ragione_sociale, 'partita_iva', NULL::boolean, 2
  FROM public.lead l, par p
  WHERE p.piva IS NOT NULL AND p.piva NOT IN ('102730','102729')
    AND nullif(trim(coalesce(l.partita_iva,'')),'') = p.piva
  UNION ALL
  SELECT 'cliente', cl.id, NULL::uuid, cl.ragione_sociale, 'codice_fiscale', NULL::boolean, 2
  FROM public.clienti cl, par p
  WHERE p.cf IS NOT NULL AND p.cf NOT IN ('102730','102729')
    AND nullif(upper(trim(coalesce(cl.codice_fiscale,''))),'') = p.cf
  UNION ALL
  SELECT 'lead', l.id, NULL::uuid, l.ragione_sociale, 'codice_fiscale', NULL::boolean, 2
  FROM public.lead l, par p
  WHERE p.cf IS NOT NULL AND p.cf NOT IN ('102730','102729')
    AND nullif(upper(trim(coalesce(l.codice_fiscale,''))),'') = p.cf
  -- priorità 3: nome / ragione sociale
  UNION ALL
  SELECT 'cliente', cl.id, NULL::uuid, cl.ragione_sociale, 'nome', NULL::boolean, 3
  FROM public.clienti cl, par p
  WHERE p.rs IS NOT NULL AND lower(trim(coalesce(cl.ragione_sociale,''))) = lower(p.rs)
  UNION ALL
  SELECT 'lead', l.id, NULL::uuid, l.ragione_sociale, 'nome', NULL::boolean, 3
  FROM public.lead l, par p
  WHERE p.rs IS NOT NULL AND lower(trim(coalesce(l.ragione_sociale,''))) = lower(p.rs)
  UNION ALL
  SELECT 'contatto', coalesce(c.cliente_id, c.lead_id), c.id,
         nullif(trim(coalesce(c.nome,'') || ' ' || coalesce(c.cognome,'')),''),
         'nome', c.privacy_firmata, 3
  FROM public.contatti c, par p
  WHERE (c.cliente_id IS NOT NULL OR c.lead_id IS NOT NULL) -- FM62 G6: mai contatti solo-fornitore
    AND p.nome IS NOT NULL AND p.cognome IS NOT NULL
    AND lower(trim(coalesce(c.nome,''))) = lower(p.nome)
    AND lower(trim(coalesce(c.cognome,''))) = lower(p.cognome)
),
uniq AS (
  SELECT DISTINCT ON (tipo, coalesce(contatto_id, id)) *
  FROM cand
  ORDER BY tipo, coalesce(contatto_id, id), priorita
)
SELECT u.tipo,
       u.id,
       coalesce(u.contatto_id, ct.id) AS contatto_id,
       u.etichetta,
       u.criterio,
       coalesce(u.privacy_firmata, ct.privacy_firmata, false) AS privacy_firmata,
       u.priorita
FROM uniq u
LEFT JOIN LATERAL (
  SELECT k.id, k.privacy_firmata
  FROM public.contatti k
  WHERE u.contatto_id IS NULL AND u.id IS NOT NULL
    AND (k.cliente_id = u.id OR k.lead_id = u.id)
  ORDER BY k.privacy_firmata DESC, k.principale DESC
  LIMIT 1
) ct ON TRUE
ORDER BY u.priorita, u.tipo, u.etichetta
$function$;

REVOKE EXECUTE ON FUNCTION public.trova_corrispondenze_soggetto(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trova_corrispondenze_soggetto(text,text,text,text,text,text) TO service_role;

-- Opt-in WhatsApp: esclusi i consensi registrati per soggetti solo-fornitore.
CREATE OR REPLACE VIEW public.v_whatsapp_opt_in_attuale WITH (security_invoker = true) AS
WITH soggetti AS (
         SELECT DISTINCT consensi_log.contatto_id,
            consensi_log.cliente_id,
            consensi_log.lead_id,
            COALESCE((consensi_log.contatto_id)::text, (consensi_log.cliente_id)::text, (consensi_log.lead_id)::text) AS soggetto_key
           FROM consensi_log
          WHERE (consensi_log.tipo_consenso = ANY (ARRAY['whatsapp'::text, 'marketing_diretto'::text]))
            AND NOT (consensi_log.cliente_id IS NULL AND consensi_log.lead_id IS NULL AND consensi_log.fornitore_id IS NOT NULL)
        ), abilitanti AS (
         SELECT COALESCE((consensi_log.contatto_id)::text, (consensi_log.cliente_id)::text, (consensi_log.lead_id)::text) AS soggetto_key,
            max(consensi_log.created_at) AS ultimo_abilitante_at
           FROM consensi_log
          WHERE ((consensi_log.tipo_consenso = ANY (ARRAY['whatsapp'::text, 'marketing_diretto'::text])) AND (consensi_log.valore = true))
          GROUP BY COALESCE((consensi_log.contatto_id)::text, (consensi_log.cliente_id)::text, (consensi_log.lead_id)::text)
        ), stop_whatsapp AS (
         SELECT COALESCE((consensi_log.contatto_id)::text, (consensi_log.cliente_id)::text, (consensi_log.lead_id)::text) AS soggetto_key,
            max(consensi_log.created_at) AS ultimo_stop_at
           FROM consensi_log
          WHERE ((consensi_log.tipo_consenso = 'whatsapp'::text) AND (consensi_log.valore = false))
          GROUP BY COALESCE((consensi_log.contatto_id)::text, (consensi_log.cliente_id)::text, (consensi_log.lead_id)::text)
        )
 SELECT s.contatto_id,
    s.cliente_id,
    s.lead_id,
    ((a.ultimo_abilitante_at IS NOT NULL) AND ((w.ultimo_stop_at IS NULL) OR (w.ultimo_stop_at < a.ultimo_abilitante_at))) AS opt_in,
    GREATEST(a.ultimo_abilitante_at, COALESCE(w.ultimo_stop_at, a.ultimo_abilitante_at)) AS aggiornato_at
   FROM ((soggetti s
     LEFT JOIN abilitanti a ON ((a.soggetto_key = s.soggetto_key)))
     LEFT JOIN stop_whatsapp w ON ((w.soggetto_key = s.soggetto_key)));

-- Ricerca contatti esistenti da collegare: prima quelli del cliente collegato al fornitore.
CREATE OR REPLACE FUNCTION public.cerca_contatti_collegabili_fornitore(_fornitore_id uuid, _testo text DEFAULT NULL)
RETURNS TABLE(id uuid, nome text, cognome text, ruolo text, email text, telefono text, cellulare text,
  azienda text, del_cliente_collegato boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q text := nullif(btrim(coalesce(_testo, '')), '');
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_puo_gestire_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH collegati AS (SELECT fc.cliente_id FROM public.fornitore_cliente fc WHERE fc.fornitore_id = _fornitore_id)
  SELECT c.id, c.nome, c.cognome, c.ruolo, c.email, c.telefono, c.cellulare,
    coalesce(cl.ragione_sociale, nullif(btrim(l.ragione_sociale), ''), nullif(btrim(coalesce(l.nome, '') || ' ' || coalesce(l.cognome, '')), '')) AS azienda,
    (c.cliente_id IN (SELECT cliente_id FROM collegati)) AS del_cliente_collegato
  FROM public.contatti c
  LEFT JOIN public.clienti cl ON cl.id = c.cliente_id
  LEFT JOIN public.lead l ON l.id = c.lead_id
  WHERE c.fornitore_id IS NULL
    AND (c.cliente_id IS NOT NULL OR c.lead_id IS NOT NULL)
    AND (
      (q IS NULL AND c.cliente_id IN (SELECT cliente_id FROM collegati))
      OR (q IS NOT NULL AND length(q) >= 2 AND (
        (coalesce(c.nome, '') || ' ' || coalesce(c.cognome, '')) ILIKE '%' || q || '%'
        OR (coalesce(c.cognome, '') || ' ' || coalesce(c.nome, '')) ILIKE '%' || q || '%'
        OR c.email ILIKE '%' || q || '%' OR c.cellulare ILIKE '%' || q || '%' OR c.telefono ILIKE '%' || q || '%'
        OR cl.ragione_sociale ILIKE '%' || q || '%' OR l.ragione_sociale ILIKE '%' || q || '%')))
  ORDER BY (c.cliente_id IN (SELECT cliente_id FROM collegati)) DESC NULLS LAST, c.cognome, c.nome, c.id
  LIMIT 30;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cerca_contatti_collegabili_fornitore(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_contatti_collegabili_fornitore(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.collega_contatto_fornitore(_contatto_id uuid, _fornitore_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_attuale uuid;
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_puo_gestire_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fornitori WHERE id = _fornitore_id) THEN
    RAISE EXCEPTION 'Fornitore non trovato';
  END IF;
  SELECT fornitore_id INTO v_attuale FROM public.contatti WHERE id = _contatto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contatto non trovato'; END IF;
  IF v_attuale = _fornitore_id THEN RETURN; END IF;
  IF v_attuale IS NOT NULL THEN
    RAISE EXCEPTION 'Il contatto è già collegato a un altro fornitore';
  END IF;
  UPDATE public.contatti SET fornitore_id = _fornitore_id, updated_at = now() WHERE id = _contatto_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.collega_contatto_fornitore(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collega_contatto_fornitore(uuid, uuid) TO authenticated, service_role;

-- Se il contatto appartiene anche a cliente/lead toglie solo il fornitore, altrimenti lo elimina.
CREATE OR REPLACE FUNCTION public.scollega_contatto_fornitore(_contatto_id uuid, _fornitore_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD;
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_puo_gestire_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  SELECT id, cliente_id, lead_id, fornitore_id INTO c FROM public.contatti WHERE id = _contatto_id FOR UPDATE;
  IF NOT FOUND OR c.fornitore_id IS DISTINCT FROM _fornitore_id THEN
    RAISE EXCEPTION 'Contatto non collegato a questo fornitore';
  END IF;
  IF c.cliente_id IS NOT NULL OR c.lead_id IS NOT NULL THEN
    UPDATE public.contatti SET fornitore_id = NULL, updated_at = now() WHERE id = _contatto_id;
    RETURN 'scollegato';
  END IF;
  DELETE FROM public.contatti WHERE id = _contatto_id;
  RETURN 'eliminato';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.scollega_contatto_fornitore(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scollega_contatto_fornitore(uuid, uuid) TO authenticated, service_role;