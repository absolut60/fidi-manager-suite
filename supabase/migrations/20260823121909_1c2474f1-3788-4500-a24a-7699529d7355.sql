ALTER TYPE public.tipo_canale ADD VALUE IF NOT EXISTS 'task';

CREATE TYPE public.stato_task AS ENUM ('da_fare','in_corso','fatto','annullato');

ALTER TABLE public.canali DROP CONSTRAINT canali_tipo_coerenza;
ALTER TABLE public.canali ADD CONSTRAINT canali_tipo_coerenza CHECK (
     (tipo::text = 'area'    AND area_id IS NOT NULL AND store_id IS NULL)
  OR (tipo::text = 'store'   AND store_id IS NOT NULL AND area_id IS NULL)
  OR (tipo::text = 'diretto' AND area_id IS NULL AND store_id IS NULL)
  OR (tipo::text = 'task'    AND area_id IS NULL AND store_id IS NULL)
);

CREATE TABLE public.task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titolo text NOT NULL,
  descrizione text,
  stato public.stato_task NOT NULL DEFAULT 'da_fare',
  titolare_id uuid NOT NULL DEFAULT auth.uid(),
  esecutore_id uuid,
  area_id uuid REFERENCES public.aree_funzionali(id) ON DELETE SET NULL,
  canale_id uuid REFERENCES public.canali(id) ON DELETE SET NULL,
  entita_tipo text,
  entita_id uuid,
  scadenza timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_entita_coerenza CHECK (
       (entita_tipo IS NULL AND entita_id IS NULL)
    OR (entita_tipo IS NOT NULL AND entita_id IS NOT NULL
        AND entita_tipo IN ('cliente','preventivo','richiesta_fido','richiesta_interna'))
  )
);

CREATE INDEX idx_task_titolare ON public.task (titolare_id);
CREATE INDEX idx_task_esecutore ON public.task (esecutore_id);
CREATE INDEX idx_task_area ON public.task (area_id);
CREATE INDEX idx_task_stato ON public.task (stato);
CREATE INDEX idx_task_canale ON public.task (canale_id);
CREATE INDEX idx_task_entita ON public.task (entita_tipo, entita_id) WHERE entita_tipo IS NOT NULL;

CREATE TRIGGER trg_task_updated BEFORE UPDATE ON public.task
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.crea_canale_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canale_id uuid;
BEGIN
  IF NEW.canale_id IS NULL THEN
    INSERT INTO public.canali (tipo, nome, created_by)
    VALUES ('task'::public.tipo_canale, NEW.titolo, COALESCE(NEW.titolare_id, auth.uid()))
    RETURNING id INTO v_canale_id;

    NEW.canale_id := v_canale_id;

    IF NEW.titolare_id IS NOT NULL THEN
      INSERT INTO public.canale_membri (canale_id, user_id)
      VALUES (v_canale_id, NEW.titolare_id)
      ON CONFLICT DO NOTHING;
    END IF;

    IF NEW.esecutore_id IS NOT NULL AND NEW.esecutore_id IS DISTINCT FROM NEW.titolare_id THEN
      INSERT INTO public.canale_membri (canale_id, user_id)
      VALUES (v_canale_id, NEW.esecutore_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crea_canale_task() TO authenticated, service_role;

CREATE TRIGGER trg_task_crea_canale BEFORE INSERT ON public.task
FOR EACH ROW EXECUTE FUNCTION public.crea_canale_task();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task TO authenticated;
GRANT ALL ON public.task TO service_role;

ALTER TABLE public.task ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_select ON public.task FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'amministratore'::app_role)
  OR titolare_id = auth.uid()
  OR esecutore_id = auth.uid()
  OR (area_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.area_membri am
        WHERE am.area_id = task.area_id AND am.user_id = auth.uid()))
);

CREATE POLICY task_insert ON public.task FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(),'amministratore'::app_role) OR titolare_id = auth.uid()
);

CREATE POLICY task_update ON public.task FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(),'amministratore'::app_role) OR titolare_id = auth.uid() OR esecutore_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(),'amministratore'::app_role) OR titolare_id = auth.uid() OR esecutore_id = auth.uid()
);

CREATE POLICY task_delete ON public.task FOR DELETE TO authenticated
USING (
  has_role(auth.uid(),'amministratore'::app_role) OR titolare_id = auth.uid()
);