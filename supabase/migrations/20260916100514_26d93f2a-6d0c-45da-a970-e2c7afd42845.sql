DO $$
DECLARE
  r record;
  v_id uuid;
  v_nome text; v_cognome text; v_email text; v_cf text;
BEGIN
  FOR r IN
    SELECT ep.id, ep.cliente_id, ep.nome, ep.cognome, ep.email, ep.telefono, ep.codice_fiscale
    FROM public.eventi_partecipanti ep
    WHERE ep.evento_id='75ef3412-bcd8-4f2b-9c31-616919a6ca57'
      AND ep.origine='import'
      AND ep.cliente_id IS NOT NULL
      AND ep.contatto_id IS NULL
      AND nullif(btrim(coalesce(ep.nome,'')),'') IS NOT NULL
  LOOP
    v_nome := nullif(btrim(r.nome),'');
    v_cognome := nullif(btrim(coalesce(r.cognome,'')),'');
    v_email := nullif(btrim(coalesce(r.email,'')),'');
    v_cf := nullif(upper(btrim(coalesce(r.codice_fiscale,''))),'');
    v_id := NULL;

    SELECT c.id INTO v_id
    FROM public.contatti c
    WHERE c.cliente_id = r.cliente_id
      AND lower(btrim(coalesce(c.nome,''))) = lower(v_nome)
      AND lower(btrim(coalesce(c.cognome,''))) = lower(coalesce(v_cognome,''))
      AND (
        (v_email IS NOT NULL AND lower(btrim(coalesce(c.email,''))) = lower(v_email))
        OR (v_cf IS NOT NULL AND upper(btrim(coalesce(c.codice_fiscale,''))) = v_cf)
      )
    ORDER BY c.privacy_firmata DESC, c.principale DESC, c.created_at ASC
    LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.contatti (cliente_id, lead_id, nome, cognome, email, cellulare, codice_fiscale, ruolo, principale)
      VALUES (r.cliente_id, NULL, v_nome, v_cognome, v_email, NULL, v_cf, 'Referente', false)
      RETURNING id INTO v_id;
    END IF;

    UPDATE public.eventi_partecipanti SET contatto_id = v_id WHERE id = r.id;

    BEGIN
      PERFORM public.registra_consensi_batch(
        _contatto_id := v_id,
        _marketing_diretto := false,
        _marketing_media := false,
        _profilazione := false,
        _origine := 'azienda_gruppo',
        _note := 'Privacy raccolta da azienda del gruppo');
      UPDATE public.contatti
         SET privacy_firmata = true, data_firma = coalesce(data_firma, now())
       WHERE id = v_id AND privacy_firmata IS DISTINCT FROM true;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;