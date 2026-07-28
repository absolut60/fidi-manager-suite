CREATE OR REPLACE FUNCTION public.registra_consensi_batch(
  _contatto_id uuid,
  _marketing_diretto boolean,
  _marketing_media boolean,
  _profilazione boolean,
  _origine text,
  _operatore_id uuid DEFAULT NULL,
  _prova_path text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
BEGIN
  SELECT cliente_id INTO v_cliente_id FROM public.contatti WHERE id = _contatto_id;
  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Contatto % non trovato', _contatto_id;
  END IF;

  IF _origine NOT IN ('link_pubblico','operatore','recesso_link','import') THEN
    RAISE EXCEPTION 'Origine non valida: %', _origine;
  END IF;

  INSERT INTO public.consensi_log
    (contatto_id, cliente_id, tipo_consenso, valore, origine, operatore_id, prova_path, ip_address, note)
  VALUES
    (_contatto_id, v_cliente_id, 'marketing_diretto', _marketing_diretto, _origine, _operatore_id, _prova_path, _ip, _note),
    (_contatto_id, v_cliente_id, 'marketing_media',   _marketing_media,   _origine, _operatore_id, _prova_path, _ip, _note),
    (_contatto_id, v_cliente_id, 'profilazione',      _profilazione,      _origine, _operatore_id, _prova_path, _ip, _note);

  UPDATE public.contatti
     SET consenso_marketing_diretto = _marketing_diretto,
         consenso_marketing_media   = _marketing_media,
         consenso_profilazione      = _profilazione,
         updated_at = now()
   WHERE id = _contatto_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registra_consensi_batch(uuid, boolean, boolean, boolean, text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registra_consensi_batch(uuid, boolean, boolean, boolean, text, uuid, text, text, text) TO authenticated, service_role;