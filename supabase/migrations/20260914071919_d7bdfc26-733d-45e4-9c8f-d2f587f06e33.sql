CREATE OR REPLACE FUNCTION public._crea_contatto_da_iscritto(_isc_id uuid, _cliente_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_isc public.iscritti_whatsapp%ROWTYPE;
  v_contatto_id uuid;
BEGIN
  SELECT * INTO v_isc FROM public.iscritti_whatsapp WHERE id = _isc_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO v_contatto_id
  FROM public.contatti
  WHERE cliente_id = _cliente_id
    AND public.normalizza_numero_it(cellulare) = v_isc.numero_norm
  LIMIT 1;

  IF v_contatto_id IS NOT NULL THEN
    UPDATE public.contatti
    SET whatsapp_opt_in = true,
        email = COALESCE(email, NULLIF(btrim(v_isc.email), '')),
        cellulare = COALESCE(cellulare, v_isc.numero_norm),
        updated_at = now()
    WHERE id = v_contatto_id;
    RETURN v_contatto_id;
  END IF;

  INSERT INTO public.contatti(
    cliente_id, nome, cognome, ruolo, cellulare, email, whatsapp_opt_in, principale
  ) VALUES (
    _cliente_id,
    COALESCE(NULLIF(btrim(v_isc.nome),''), 'Contatto'),
    NULLIF(btrim(v_isc.cognome),''),
    'Contatto WhatsApp',
    v_isc.numero_norm,
    NULLIF(btrim(v_isc.email), ''),
    true,
    false
  ) RETURNING id INTO v_contatto_id;

  RETURN v_contatto_id;
END;
$function$;