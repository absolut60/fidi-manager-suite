ALTER TABLE public.contatti ADD COLUMN IF NOT EXISTS recesso_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS contatti_recesso_token_key ON public.contatti (recesso_token) WHERE recesso_token IS NOT NULL;

INSERT INTO public.configurazioni (chiave, valore)
VALUES ('consensi_recesso_email_notifica', '')
ON CONFLICT (chiave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.revoca_consensi_batch(
  _contatto_id uuid,
  _marketing_diretto boolean DEFAULT false,
  _marketing_media boolean DEFAULT false,
  _profilazione boolean DEFAULT false,
  _origine text DEFAULT 'recesso_link',
  _ip text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF _marketing_diretto THEN
    PERFORM public.registra_consenso(_contatto_id := _contatto_id, _tipo_consenso := 'marketing_diretto', _valore := false, _origine := _origine, _ip := _ip, _note := _note);
    n := n + 1;
  END IF;
  IF _marketing_media THEN
    PERFORM public.registra_consenso(_contatto_id := _contatto_id, _tipo_consenso := 'marketing_media', _valore := false, _origine := _origine, _ip := _ip, _note := _note);
    n := n + 1;
  END IF;
  IF _profilazione THEN
    PERFORM public.registra_consenso(_contatto_id := _contatto_id, _tipo_consenso := 'profilazione', _valore := false, _origine := _origine, _ip := _ip, _note := _note);
    n := n + 1;
  END IF;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.revoca_consensi_batch(uuid, boolean, boolean, boolean, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoca_consensi_batch(uuid, boolean, boolean, boolean, text, text, text) TO service_role;