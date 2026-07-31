ALTER TABLE public.segmenti_marketing
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'dinamico';

ALTER TABLE public.segmenti_marketing
  DROP CONSTRAINT IF EXISTS segmenti_marketing_tipo_check;

ALTER TABLE public.segmenti_marketing
  ADD CONSTRAINT segmenti_marketing_tipo_check CHECK (tipo IN ('dinamico','statico'));

CREATE TABLE IF NOT EXISTS public.segmenti_marketing_clienti (
  segmento_id uuid NOT NULL REFERENCES public.segmenti_marketing(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (segmento_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_segmenti_marketing_clienti_segmento
  ON public.segmenti_marketing_clienti (segmento_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.segmenti_marketing_clienti TO authenticated;
GRANT ALL ON public.segmenti_marketing_clienti TO service_role;

ALTER TABLE public.segmenti_marketing_clienti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "segmenti_clienti_select" ON public.segmenti_marketing_clienti
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
  );

CREATE POLICY "segmenti_clienti_all" ON public.segmenti_marketing_clienti
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore'::app_role)
    OR public.has_role(auth.uid(), 'amministrazione'::app_role)
    OR public.has_role(auth.uid(), 'direzione'::app_role)
  );