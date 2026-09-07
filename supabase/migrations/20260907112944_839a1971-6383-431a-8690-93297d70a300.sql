CREATE TABLE public.marketing_opt_out (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  cliente_id uuid NULL REFERENCES public.clienti(id) ON DELETE SET NULL,
  campagna_id uuid NULL REFERENCES public.campagne_email_marketing(id) ON DELETE SET NULL,
  destinatario_id uuid NULL,
  origine text NOT NULL DEFAULT 'link_email',
  operatore_id uuid NULL,
  ip_address text NULL,
  user_agent text NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_opt_out_origine_check CHECK (origine IN ('link_email','manuale','risposta_email','import'))
);

CREATE UNIQUE INDEX marketing_opt_out_email_unique ON public.marketing_opt_out (lower(email));
CREATE INDEX marketing_opt_out_cliente_id_idx ON public.marketing_opt_out (cliente_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_opt_out TO authenticated;
GRANT ALL ON public.marketing_opt_out TO service_role;

ALTER TABLE public.marketing_opt_out ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestione opt-out marketing"
ON public.marketing_opt_out
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(),'amministratore') OR has_role(auth.uid(),'amministrazione')
  OR has_role(auth.uid(),'direzione') OR has_role(auth.uid(),'marketing')
)
WITH CHECK (
  has_role(auth.uid(),'amministratore') OR has_role(auth.uid(),'amministrazione')
  OR has_role(auth.uid(),'direzione') OR has_role(auth.uid(),'marketing')
);

ALTER TABLE public.campagne_email_destinatari ADD COLUMN IF NOT EXISTS recesso_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS campagne_email_destinatari_recesso_token_unique
  ON public.campagne_email_destinatari (recesso_token) WHERE recesso_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_destinatario_recesso(_token uuid)
RETURNS TABLE(email text, ragione_sociale text, gia_disiscritto boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.email,
         c.ragione_sociale,
         EXISTS (SELECT 1 FROM public.marketing_opt_out o WHERE lower(o.email) = lower(d.email)) AS gia_disiscritto
  FROM public.campagne_email_destinatari d
  LEFT JOIN public.clienti c ON c.id = d.cliente_id
  WHERE d.recesso_token = _token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.registra_opt_out_marketing(_token uuid, _ip text DEFAULT NULL, _ua text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d RECORD;
BEGIN
  SELECT id, email, cliente_id, campagna_id
    INTO d
  FROM public.campagne_email_destinatari
  WHERE recesso_token = _token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.marketing_opt_out (email, cliente_id, campagna_id, destinatario_id, origine, ip_address, user_agent)
  VALUES (lower(trim(d.email)), d.cliente_id, d.campagna_id, d.id, 'link_email', _ip, _ua)
  ON CONFLICT (lower(email)) DO NOTHING;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_destinatario_recesso(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registra_opt_out_marketing(uuid, text, text) TO anon, authenticated, service_role;