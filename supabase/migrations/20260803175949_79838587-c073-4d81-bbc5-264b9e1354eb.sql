
ALTER TABLE public.consensi_log DROP CONSTRAINT consensi_log_origine_check;
ALTER TABLE public.consensi_log ADD CONSTRAINT consensi_log_origine_check
  CHECK (origine = ANY (ARRAY['link_pubblico','operatore','recesso_link','import','firma_grafica']));

CREATE OR REPLACE FUNCTION public.registra_consensi_batch(_contatto_id uuid, _marketing_diretto boolean, _marketing_media boolean, _profilazione boolean, _origine text, _operatore_id uuid DEFAULT NULL::uuid, _prova_path text DEFAULT NULL::text, _ip text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente_id uuid;
  v_lead_id uuid;
BEGIN
  SELECT c.cliente_id, c.lead_id INTO v_cliente_id, v_lead_id
    FROM public.contatti c WHERE c.id = _contatto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contatto % non trovato', _contatto_id;
  END IF;

  IF _origine NOT IN ('link_pubblico','operatore','recesso_link','import','firma_grafica') THEN
    RAISE EXCEPTION 'Origine non valida: %', _origine;
  END IF;

  INSERT INTO public.consensi_log
    (contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, operatore_id, prova_path, ip_address, note)
  VALUES
    (_contatto_id, v_cliente_id, v_lead_id, 'marketing_diretto', _marketing_diretto, _origine, _operatore_id, _prova_path, _ip, _note),
    (_contatto_id, v_cliente_id, v_lead_id, 'marketing_media',   _marketing_media,   _origine, _operatore_id, _prova_path, _ip, _note),
    (_contatto_id, v_cliente_id, v_lead_id, 'profilazione',      _profilazione,      _origine, _operatore_id, _prova_path, _ip, _note);

  UPDATE public.contatti
     SET consenso_marketing_diretto = _marketing_diretto,
         consenso_marketing_media   = _marketing_media,
         consenso_profilazione      = _profilazione,
         updated_at = now()
   WHERE id = _contatto_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registra_consenso(_contatto_id uuid, _tipo_consenso text, _valore boolean, _origine text, _operatore_id uuid DEFAULT NULL::uuid, _prova_path text DEFAULT NULL::text, _ip text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cliente_id uuid;
  _lead_id uuid;
  _log_id uuid;
BEGIN
  IF _tipo_consenso NOT IN ('marketing_diretto','marketing_media','profilazione') THEN
    RAISE EXCEPTION 'tipo_consenso non valido: %', _tipo_consenso;
  END IF;
  IF _origine NOT IN ('link_pubblico','operatore','recesso_link','import','firma_grafica') THEN
    RAISE EXCEPTION 'origine non valida: %', _origine;
  END IF;

  SELECT c.cliente_id, c.lead_id INTO _cliente_id, _lead_id
    FROM public.contatti c WHERE c.id = _contatto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contatto % non trovato', _contatto_id;
  END IF;

  INSERT INTO public.consensi_log (
    contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
    operatore_id, prova_path, ip_address, note
  ) VALUES (
    _contatto_id, _cliente_id, _lead_id, _tipo_consenso, _valore, _origine,
    _operatore_id, _prova_path, _ip, _note
  ) RETURNING id INTO _log_id;

  IF _tipo_consenso = 'marketing_diretto' THEN
    UPDATE public.contatti SET consenso_marketing_diretto = _valore WHERE id = _contatto_id;
  ELSIF _tipo_consenso = 'marketing_media' THEN
    UPDATE public.contatti SET consenso_marketing_media = _valore WHERE id = _contatto_id;
  ELSIF _tipo_consenso = 'profilazione' THEN
    UPDATE public.contatti SET consenso_profilazione = _valore WHERE id = _contatto_id;
  END IF;

  RETURN _log_id;
END;
$function$;
