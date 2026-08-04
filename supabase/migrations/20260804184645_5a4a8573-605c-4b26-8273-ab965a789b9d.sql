ALTER TABLE public.contatti
  ADD COLUMN IF NOT EXISTS richiesta_privacy_generata_il timestamptz,
  ADD COLUMN IF NOT EXISTS richiesta_privacy_inviata_il timestamptz,
  ADD COLUMN IF NOT EXISTS richiesta_privacy_aperta_il timestamptz;

COMMENT ON COLUMN public.contatti.richiesta_privacy_generata_il IS 'Data/ora di generazione del link di richiesta firma privacy';
COMMENT ON COLUMN public.contatti.richiesta_privacy_inviata_il IS 'Data/ora di invio al contatto del link di richiesta firma privacy';
COMMENT ON COLUMN public.contatti.richiesta_privacy_aperta_il IS 'Data/ora della PRIMA apertura della pagina pubblica di firma privacy';

ALTER TABLE public.consensi_log
  ADD COLUMN IF NOT EXISTS informativa_versione text,
  ADD COLUMN IF NOT EXISTS informativa_hash text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS secondi_permanenza integer;

COMMENT ON COLUMN public.consensi_log.informativa_versione IS 'Versione dell''informativa privacy mostrata all''interessato al momento del consenso';
COMMENT ON COLUMN public.consensi_log.informativa_hash IS 'SHA-256 (hex) del testo dell''informativa effettivamente mostrato';
COMMENT ON COLUMN public.consensi_log.user_agent IS 'User-Agent del browser usato per prestare il consenso (max 300 char)';
COMMENT ON COLUMN public.consensi_log.secondi_permanenza IS 'Secondi trascorsi tra apertura pagina e conferma del consenso';

DROP FUNCTION IF EXISTS public.registra_consensi_batch(uuid, boolean, boolean, boolean, text, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.registra_consensi_batch(
  _contatto_id uuid,
  _marketing_diretto boolean,
  _marketing_media boolean,
  _profilazione boolean,
  _origine text,
  _operatore_id uuid DEFAULT NULL::uuid,
  _prova_path text DEFAULT NULL::text,
  _ip text DEFAULT NULL::text,
  _note text DEFAULT NULL::text,
  _informativa_versione text DEFAULT NULL::text,
  _informativa_hash text DEFAULT NULL::text,
  _user_agent text DEFAULT NULL::text,
  _secondi_permanenza integer DEFAULT NULL::integer
)
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
    (contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, operatore_id, prova_path, ip_address, note,
     informativa_versione, informativa_hash, user_agent, secondi_permanenza)
  VALUES
    (_contatto_id, v_cliente_id, v_lead_id, 'marketing_diretto', _marketing_diretto, _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza),
    (_contatto_id, v_cliente_id, v_lead_id, 'marketing_media',   _marketing_media,   _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza),
    (_contatto_id, v_cliente_id, v_lead_id, 'profilazione',      _profilazione,      _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza);

  UPDATE public.contatti
     SET consenso_marketing_diretto = _marketing_diretto,
         consenso_marketing_media   = _marketing_media,
         consenso_profilazione      = _profilazione,
         updated_at = now()
   WHERE id = _contatto_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registra_consensi_batch(uuid, boolean, boolean, boolean, text, uuid, text, text, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registra_consensi_batch(uuid, boolean, boolean, boolean, text, uuid, text, text, text, text, text, text, integer) TO authenticated, service_role;