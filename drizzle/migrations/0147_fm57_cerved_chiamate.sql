CREATE TABLE public.cerved_chiamate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  utente_id uuid,
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  operazione text NOT NULL,
  parametri jsonb,
  http_status int,
  esito text CHECK (esito IN ('ok','errore')),
  errore text,
  durata_ms int,
  risposta jsonb
);
GRANT SELECT ON public.cerved_chiamate TO authenticated;
GRANT ALL ON public.cerved_chiamate TO service_role;
REVOKE ALL ON public.cerved_chiamate FROM anon;
ALTER TABLE public.cerved_chiamate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Amministratori leggono chiamate Cerved" ON public.cerved_chiamate
  FOR SELECT TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'amministratore'::public.app_role)));
CREATE INDEX cerved_chiamate_created_at_idx ON public.cerved_chiamate (created_at DESC);
CREATE INDEX cerved_chiamate_cliente_id_idx ON public.cerved_chiamate (cliente_id);