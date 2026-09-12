-- 1) campagne_whatsapp
ALTER TABLE public.campagne_whatsapp
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.whatsapp_template(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stato text NOT NULL DEFAULT 'bozza',
  ADD COLUMN IF NOT EXISTS saltati integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.campagne_whatsapp
  ALTER COLUMN template_name DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campagne_whatsapp_stato_check'
      AND conrelid = 'public.campagne_whatsapp'::regclass
  ) THEN
    ALTER TABLE public.campagne_whatsapp
      ADD CONSTRAINT campagne_whatsapp_stato_check
      CHECK (stato IN ('bozza','pronta','in_corso','completata'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_campagne_whatsapp_updated ON public.campagne_whatsapp;
CREATE TRIGGER trg_campagne_whatsapp_updated
  BEFORE UPDATE ON public.campagne_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) messaggi_whatsapp
ALTER TABLE public.messaggi_whatsapp
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nome_riferimento text,
  ADD COLUMN IF NOT EXISTS aggiunto_da uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messaggi_whatsapp_uniq_dest'
      AND conrelid = 'public.messaggi_whatsapp'::regclass
  ) THEN
    ALTER TABLE public.messaggi_whatsapp
      ADD CONSTRAINT messaggi_whatsapp_uniq_dest UNIQUE (campagna_id, contatto_id);
  END IF;
END $$;

-- 3) RLS: policy allineate ai 4 ruoli marketing (pattern whatsapp_template_all)
DROP POLICY IF EXISTS "Campagne WA: solo admin" ON public.campagne_whatsapp;
DROP POLICY IF EXISTS campagne_whatsapp_all ON public.campagne_whatsapp;
CREATE POLICY campagne_whatsapp_all ON public.campagne_whatsapp
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore')
    OR public.has_role(auth.uid(), 'amministrazione')
    OR public.has_role(auth.uid(), 'direzione')
    OR public.has_role(auth.uid(), 'marketing')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore')
    OR public.has_role(auth.uid(), 'amministrazione')
    OR public.has_role(auth.uid(), 'direzione')
    OR public.has_role(auth.uid(), 'marketing')
  );

DROP POLICY IF EXISTS "Messaggi WA: solo admin" ON public.messaggi_whatsapp;
DROP POLICY IF EXISTS messaggi_whatsapp_all ON public.messaggi_whatsapp;
CREATE POLICY messaggi_whatsapp_all ON public.messaggi_whatsapp
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'amministratore')
    OR public.has_role(auth.uid(), 'amministrazione')
    OR public.has_role(auth.uid(), 'direzione')
    OR public.has_role(auth.uid(), 'marketing')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'amministratore')
    OR public.has_role(auth.uid(), 'amministrazione')
    OR public.has_role(auth.uid(), 'direzione')
    OR public.has_role(auth.uid(), 'marketing')
  );