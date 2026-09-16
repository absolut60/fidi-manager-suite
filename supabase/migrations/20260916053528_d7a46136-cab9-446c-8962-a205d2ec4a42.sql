DROP FUNCTION IF EXISTS public.riconcilia_partecipante(uuid, uuid);

CREATE OR REPLACE FUNCTION public.riconcilia_partecipante(_partecipante_id uuid, _cliente_id uuid DEFAULT NULL::uuid, _lead_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  p record;
  l record;
  v_dest_cliente_id uuid;
  v_dest_lead_id uuid;
  v_contatto_id uuid;
  v_contatto_iniziale uuid;
  v_vecchio_lead uuid;
  v_grezzo boolean := false;
  v_cf text;
  v_email text;
  v_nome text;
  v_cognome text;
  v_cellulare text;
  v_n int;
  v_tipo text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  SELECT * INTO p FROM public.eventi_partecipanti WHERE id = _partecipante_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_trovato');
  END IF;

  IF p.lead_id IS NOT NULL THEN
    SELECT * INTO l FROM public.lead WHERE id = p.lead_id;
    IF FOUND THEN
      v_grezzo := (l.fonte = 'evento'::lead_fonte)
        AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = p.lead_id)
        AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = p.lead_id)
        AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = p.lead_id)
        AND NOT EXISTS (SELECT 1 FROM public.cantieri c WHERE c.lead_id = p.lead_id);
    END IF;
  END IF;

  IF p.cliente_id IS NOT NULL OR (p.lead_id IS NOT NULL AND NOT v_grezzo) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'gia_riconciliato');
  END IF;

  v_contatto_iniziale := p.contatto_id;

  -- destinazione
  IF _cliente_id IS NOT NULL THEN
    PERFORM 1 FROM public.clienti WHERE id = _cliente_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'cliente_non_trovato');
    END IF;
    v_dest_cliente_id := _cliente_id;
  ELSIF _lead_id IS NOT NULL THEN
    PERFORM 1 FROM public.lead WHERE id = _lead_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'lead_non_trovato');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.lead l2
      WHERE l2.id = _lead_id AND l2.fonte = 'evento'::lead_fonte
        AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.cantieri c WHERE c.lead_id = l2.id)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'lead_non_valido');
    END IF;
    v_dest_lead_id := _lead_id;
  ELSE
    SELECT count(*) INTO v_n
    FROM public.cerca_candidati_riconciliazione(_partecipante_id) cc
    WHERE cc.forte;

    IF coalesce(v_n, 0) <> 1 THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'match_non_univoco', 'n', coalesce(v_n, 0));
    END IF;

    SELECT cc.tipo, cc.id INTO v_tipo, v_id
    FROM public.cerca_candidati_riconciliazione(_partecipante_id) cc
    WHERE cc.forte
    LIMIT 1;

    IF v_tipo = 'cliente' THEN
      v_dest_cliente_id := v_id;
    ELSE
      v_dest_lead_id := v_id;
    END IF;
  END IF;

  -- dati anagrafici con fallback
  v_cf   := nullif(upper(btrim(coalesce(p.codice_fiscale, l.codice_fiscale))), '');
  v_email := nullif(lower(btrim(coalesce(p.email, l.email))), '');
  v_nome := nullif(btrim(coalesce(p.nome, l.nome)), '');
  v_cognome := nullif(btrim(coalesce(p.cognome, l.cognome)), '');
  v_cellulare := nullif(btrim(l.cellulare), '');
  IF v_cf IN ('102730','102729') THEN v_cf := NULL; END IF;

  IF (v_nome IS NULL OR v_cognome IS NULL OR v_email IS NULL OR v_cellulare IS NULL OR v_cf IS NULL)
     AND v_contatto_iniziale IS NOT NULL THEN
    SELECT nullif(btrim(coalesce(v_nome, ct.nome)), ''),
           nullif(btrim(coalesce(v_cognome, ct.cognome)), ''),
           coalesce(v_email, nullif(lower(btrim(ct.email)), '')),
           coalesce(v_cellulare, nullif(btrim(ct.cellulare), '')),
           coalesce(v_cf, nullif(upper(btrim(ct.codice_fiscale)), ''))
      INTO v_nome, v_cognome, v_email, v_cellulare, v_cf
    FROM public.contatti ct WHERE ct.id = v_contatto_iniziale;
  END IF;

  v_contatto_id := v_contatto_iniziale;

  IF v_nome IS NOT NULL AND v_cognome IS NOT NULL THEN
    SELECT r.contatto_id INTO v_contatto_id
    FROM public.crea_o_riusa_contatto_in_soggetto(
      _cliente_id := v_dest_cliente_id,
      _lead_id := v_dest_lead_id,
      _nome := v_nome,
      _cognome := v_cognome,
      _email := v_email,
      _cellulare := v_cellulare,
      _codice_fiscale := v_cf
    ) r;
    v_contatto_id := coalesce(v_contatto_id, v_contatto_iniziale);
  END IF;

  IF v_contatto_iniziale IS NOT NULL AND v_contatto_iniziale IS DISTINCT FROM v_contatto_id THEN
    UPDATE public.consensi_log
       SET cliente_id = CASE WHEN v_dest_cliente_id IS NOT NULL THEN v_dest_cliente_id ELSE NULL END,
           lead_id = CASE WHEN v_dest_cliente_id IS NOT NULL THEN NULL ELSE v_dest_lead_id END,
           contatto_id = COALESCE(v_contatto_id, contatto_id)
     WHERE contatto_id = v_contatto_iniziale;
  END IF;

  IF v_contatto_id IS NOT NULL THEN
    BEGIN
      PERFORM public.upsert_iscritto_da_contatto(v_contatto_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF v_grezzo THEN
    v_vecchio_lead := p.lead_id;
  END IF;

  UPDATE public.eventi_partecipanti
     SET cliente_id = COALESCE(v_dest_cliente_id, cliente_id),
         lead_id = CASE
                     WHEN v_dest_lead_id IS NOT NULL THEN v_dest_lead_id
                     WHEN v_dest_cliente_id IS NOT NULL AND v_vecchio_lead IS NOT NULL THEN NULL
                     ELSE lead_id
                   END,
         contatto_id = COALESCE(v_contatto_id, contatto_id),
         riconciliato_il = now()
   WHERE id = _partecipante_id;

  IF v_vecchio_lead IS NOT NULL AND v_vecchio_lead IS DISTINCT FROM v_dest_lead_id THEN
    IF EXISTS (
      SELECT 1 FROM public.lead l3
      WHERE l3.id = v_vecchio_lead AND l3.fonte = 'evento'::lead_fonte
        AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.cantieri c WHERE c.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.eventi_partecipanti ep WHERE ep.lead_id = l3.id AND ep.id <> _partecipante_id)
    ) THEN
      DELETE FROM public.contatti WHERE lead_id = v_vecchio_lead AND cliente_id IS NULL;
      DELETE FROM public.lead WHERE id = v_vecchio_lead;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true,
                            'cliente_id', v_dest_cliente_id,
                            'lead_id', v_dest_lead_id,
                            'contatto_id', v_contatto_id,
                            'modo', CASE WHEN _cliente_id IS NULL AND _lead_id IS NULL THEN 'auto' ELSE 'manuale' END);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.riconcilia_partecipante(uuid, uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.riconcilia_partecipante(uuid, uuid, uuid) TO authenticated, service_role;