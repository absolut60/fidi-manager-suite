CREATE TABLE public.segmenti_marketing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  descrizione text,
  filtri jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.segmenti_marketing TO authenticated;
GRANT ALL ON public.segmenti_marketing TO service_role;

ALTER TABLE public.segmenti_marketing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "segmenti_marketing_select_marketing_roles"
  ON public.segmenti_marketing
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore')
    OR public.has_role(auth.uid(), 'direzione')
    OR public.has_role(auth.uid(), 'amministrazione')
  );

CREATE POLICY "segmenti_marketing_all_marketing_roles"
  ON public.segmenti_marketing
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore')
    OR public.has_role(auth.uid(), 'direzione')
    OR public.has_role(auth.uid(), 'amministrazione')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore')
    OR public.has_role(auth.uid(), 'direzione')
    OR public.has_role(auth.uid(), 'amministrazione')
  );

CREATE TRIGGER update_segmenti_marketing_updated_at
  BEFORE UPDATE ON public.segmenti_marketing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_segmenti_marketing_created_at ON public.segmenti_marketing(created_at DESC);
