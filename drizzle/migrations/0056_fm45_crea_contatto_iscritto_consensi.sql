CREATE OR REPLACE FUNCTION public._crea_contatto_da_iscritto(_isc_id uuid, _cliente_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_isc public.iscritti_whatsapp%ROWTYPE;
  v_contatto_id uuid;
  v_mkt boolean;
  v_prof boolean;
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
  ELSE
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
  END IF;

  -- FM45: allinea i consensi dall'ultima riga consensi_log per tipo; solo verso true.
  SELECT valore INTO v_mkt FROM public.consensi_log
   WHERE iscritto_id = _isc_id AND tipo_consenso = 'marketing_diretto'
   ORDER BY created_at DESC LIMIT 1;
  SELECT valore INTO v_prof FROM public.consensi_log
   WHERE iscritto_id = _isc_id AND tipo_consenso = 'profilazione'
   ORDER BY created_at DESC LIMIT 1;
  IF v_mkt IS TRUE THEN
    UPDATE public.contatti SET consenso_marketing_diretto = true
     WHERE id = v_contatto_id AND consenso_marketing_diretto IS DISTINCT FROM true;
  END IF;
  IF v_prof IS TRUE THEN
    UPDATE public.contatti SET consenso_profilazione = true
     WHERE id = v_contatto_id AND consenso_profilazione IS DISTINCT FROM true;
  END IF;

  RETURN v_contatto_id;
END;
$function$;