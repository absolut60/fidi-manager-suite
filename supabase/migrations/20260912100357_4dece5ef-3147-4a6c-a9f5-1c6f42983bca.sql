CREATE TABLE IF NOT EXISTS public.whatsapp_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'marketing'
    CHECK (categoria IN ('marketing','utility')),
  lingua text NOT NULL DEFAULT 'it',
  stato text NOT NULL DEFAULT 'bozza'
    CHECK (stato IN ('bozza','in_attesa','approvato','rifiutato')),
  nota_rifiuto text,
  meta_template_id text,
  meta_template_name text,
  header_tipo text NOT NULL DEFAULT 'nessuno'
    CHECK (header_tipo IN ('nessuno','testo','immagine')),
  header_testo text,
  header_media_url text,
  body_testo text NOT NULL DEFAULT '',
  footer_testo text,
  pulsanti jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_template TO authenticated;
GRANT ALL ON public.whatsapp_template TO service_role;

ALTER TABLE public.whatsapp_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_template_all" ON public.whatsapp_template;
CREATE POLICY "whatsapp_template_all" ON public.whatsapp_template
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'amministratore'::app_role)
    OR has_role(auth.uid(),'amministrazione'::app_role)
    OR has_role(auth.uid(),'direzione'::app_role)
    OR has_role(auth.uid(),'marketing'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'amministratore'::app_role)
    OR has_role(auth.uid(),'amministrazione'::app_role)
    OR has_role(auth.uid(),'direzione'::app_role)
    OR has_role(auth.uid(),'marketing'::app_role)
  );

DO $$
DECLARE
  fn_name text;
BEGIN
  SELECT proname INTO fn_name
  FROM pg_proc
  WHERE proname IN ('update_updated_at_column', 'update_updated_at')
    AND pronamespace = 'public'::regnamespace
  ORDER BY CASE proname WHEN 'update_updated_at_column' THEN 0 ELSE 1 END
  LIMIT 1;

  IF fn_name IS NULL THEN
    RAISE EXCEPTION 'Nessuna funzione update_updated_at_column o update_updated_at trovata';
  END IF;

  EXECUTE format(
    'DROP TRIGGER IF EXISTS trg_whatsapp_template_updated ON public.whatsapp_template; CREATE TRIGGER trg_whatsapp_template_updated BEFORE UPDATE ON public.whatsapp_template FOR EACH ROW EXECUTE FUNCTION public.%I()',
    fn_name
  );
END $$;