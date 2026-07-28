-- 1) Table
CREATE TABLE public.consensi_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contatto_id uuid NOT NULL REFERENCES public.contatti(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  tipo_consenso text NOT NULL CHECK (tipo_consenso IN ('marketing_diretto','marketing_media','profilazione')),
  valore boolean NOT NULL,
  origine text NOT NULL CHECK (origine IN ('link_pubblico','operatore','recesso_link','import')),
  operatore_id uuid,
  prova_path text,
  ip_address text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX consensi_log_contatto_idx ON public.consensi_log(contatto_id, created_at DESC);
CREATE INDEX consensi_log_cliente_idx ON public.consensi_log(cliente_id, created_at DESC);

-- 2) Grants
GRANT SELECT, INSERT ON public.consensi_log TO authenticated;
GRANT ALL ON public.consensi_log TO service_role;

-- 3) RLS
ALTER TABLE public.consensi_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consensi_log_select_admin"
  ON public.consensi_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  );

CREATE POLICY "consensi_log_insert_admin"
  ON public.consensi_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
  );
-- No UPDATE / DELETE policies: immutable log.

-- 4) SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.registra_consenso(
  _contatto_id uuid,
  _tipo_consenso text,
  _valore boolean,
  _origine text,
  _operatore_id uuid DEFAULT NULL,
  _prova_path text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cliente_id uuid;
  _log_id uuid;
BEGIN
  IF _tipo_consenso NOT IN ('marketing_diretto','marketing_media','profilazione') THEN
    RAISE EXCEPTION 'tipo_consenso non valido: %', _tipo_consenso;
  END IF;
  IF _origine NOT IN ('link_pubblico','operatore','recesso_link','import') THEN
    RAISE EXCEPTION 'origine non valida: %', _origine;
  END IF;

  SELECT cliente_id INTO _cliente_id FROM public.contatti WHERE id = _contatto_id;
  IF _cliente_id IS NULL THEN
    RAISE EXCEPTION 'contatto % non trovato', _contatto_id;
  END IF;

  INSERT INTO public.consensi_log (
    contatto_id, cliente_id, tipo_consenso, valore, origine,
    operatore_id, prova_path, ip_address, note
  ) VALUES (
    _contatto_id, _cliente_id, _tipo_consenso, _valore, _origine,
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
$$;

REVOKE EXECUTE ON FUNCTION public.registra_consenso(uuid, text, boolean, text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registra_consenso(uuid, text, boolean, text, uuid, text, text, text) TO authenticated, service_role;