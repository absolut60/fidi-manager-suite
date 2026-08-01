CREATE TABLE public.campagne_email_clic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id uuid NOT NULL REFERENCES public.campagne_email_destinatari(id) ON DELETE CASCADE,
  campagna_id uuid NOT NULL REFERENCES public.campagne_email_marketing(id) ON DELETE CASCADE,
  url_destinazione text NOT NULL,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campagne_email_clic_campagna ON public.campagne_email_clic(campagna_id);
CREATE INDEX idx_campagne_email_clic_destinatario ON public.campagne_email_clic(destinatario_id);

GRANT SELECT ON public.campagne_email_clic TO authenticated;
GRANT ALL ON public.campagne_email_clic TO service_role;

ALTER TABLE public.campagne_email_clic ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clic visibili ai ruoli direzionali"
ON public.campagne_email_clic FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'amministratore')
  OR public.has_role(auth.uid(), 'amministrazione')
  OR public.has_role(auth.uid(), 'direzione')
);

ALTER TABLE public.campagne_email_destinatari
  ADD COLUMN IF NOT EXISTS tracking_token text,
  ADD COLUMN IF NOT EXISTS primo_clic_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_clic_at timestamptz,
  ADD COLUMN IF NOT EXISTS num_clic int NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campagne_email_destinatari_tracking_token
  ON public.campagne_email_destinatari(tracking_token);

ALTER TABLE public.campagne_email_marketing
  ADD COLUMN IF NOT EXISTS clic_unici int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clic_totali int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.registra_clic_campagna(
  _token text,
  _url text,
  _ua text DEFAULT NULL,
  _ip text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dest RECORD;
  _primo boolean;
BEGIN
  SELECT id, campagna_id, primo_clic_at
    INTO _dest
    FROM public.campagne_email_destinatari
   WHERE tracking_token = _token;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  _primo := _dest.primo_clic_at IS NULL;

  INSERT INTO public.campagne_email_clic (destinatario_id, campagna_id, url_destinazione, user_agent, ip_address)
  VALUES (_dest.id, _dest.campagna_id, _url, _ua, _ip);

  UPDATE public.campagne_email_destinatari
     SET num_clic = num_clic + 1,
         primo_clic_at = COALESCE(primo_clic_at, now()),
         ultimo_clic_at = now()
   WHERE id = _dest.id;

  UPDATE public.campagne_email_marketing
     SET clic_totali = clic_totali + 1,
         clic_unici = clic_unici + (CASE WHEN _primo THEN 1 ELSE 0 END)
   WHERE id = _dest.campagna_id;

  RETURN true;
END;
$$;