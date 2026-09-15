CREATE OR REPLACE FUNCTION public.crea_o_riusa_contatto_in_soggetto(_cliente_id uuid DEFAULT NULL::uuid, _lead_id uuid DEFAULT NULL::uuid, _nome text DEFAULT NULL::text, _cognome text DEFAULT NULL::text, _email text DEFAULT NULL::text, _cellulare text DEFAULT NULL::text, _codice_fiscale text DEFAULT NULL::text)
 RETURNS TABLE(contatto_id uuid, riusato boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text := nullif(btrim(_nome), '');
  v_cognome text := nullif(btrim(_cognome), '');
  v_email text := nullif(btrim(_email), '');
  v_cellulare text := nullif(btrim(_cellulare), '');
  v_codice_fiscale text := nullif(upper(btrim(_codice_fiscale)), '');
  v_cliente_id uuid := _cliente_id;
  v_lead_id uuid := _lead_id;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  -- XOR: esattamente uno tra cliente e lead
  IF (v_cliente_id IS NOT NULL AND v_lead_id IS NOT NULL)
     OR (v_cliente_id IS NULL AND v_lead_id IS NULL) THEN
    RAISE EXCEPTION 'Specificare uno tra cliente o lead';
  END IF;

  IF v_nome IS NULL OR v_cognome IS NULL THEN
    RAISE EXCEPTION 'Nome e cognome obbligatori';
  END IF;

  -- Riuso: stesso soggetto, STESSA persona (nome+cognome e almeno un dato coincidente)
  SELECT c.id INTO v_id
  FROM public.contatti c
  WHERE ((v_cliente_id IS NOT NULL AND c.cliente_id = v_cliente_id)
      OR (v_lead_id IS NOT NULL AND c.lead_id = v_lead_id))
    AND lower(btrim(coalesce(c.nome,''))) = lower(v_nome)
    AND lower(btrim(coalesce(c.cognome,''))) = lower(v_cognome)
    AND (
      (v_email IS NOT NULL AND lower(btrim(coalesce(c.email,''))) = lower(v_email))
      OR (v_cellulare IS NOT NULL AND public.normalizza_numero_it(c.cellulare) IS NOT NULL
          AND public.normalizza_numero_it(c.cellulare) = public.normalizza_numero_it(v_cellulare))
      OR (v_codice_fiscale IS NOT NULL AND upper(btrim(coalesce(c.codice_fiscale,''))) = v_codice_fiscale)
    )
  ORDER BY c.privacy_firmata DESC, c.principale DESC, c.created_at ASC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, true;
    RETURN;
  END IF;

  INSERT INTO public.contatti (
    cliente_id, lead_id, nome, cognome, email, cellulare, codice_fiscale, ruolo, principale
  ) VALUES (
    v_cliente_id,
    v_lead_id,
    v_nome,
    v_cognome,
    v_email,
    v_cellulare,
    v_codice_fiscale,
    CASE WHEN v_cliente_id IS NOT NULL THEN 'Referente' ELSE NULL END,
    false
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, false;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crea_o_riusa_contatto_in_soggetto(uuid,uuid,text,text,text,text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.crea_o_riusa_contatto_in_soggetto(uuid,uuid,text,text,text,text,text) FROM anon;