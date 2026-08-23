CREATE TYPE public.tipo_canale AS ENUM ('area','store','diretto');

CREATE TABLE public.canali (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.tipo_canale NOT NULL,
  area_id uuid NULL REFERENCES public.aree_funzionali(id) ON DELETE CASCADE,
  store_id uuid NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NULL,
  created_by uuid NULL DEFAULT auth.uid(),
  attivo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canali_tipo_coerenza CHECK (
       (tipo='area'    AND area_id IS NOT NULL AND store_id IS NULL)
    OR (tipo='store'   AND store_id IS NOT NULL AND area_id IS NULL)
    OR (tipo='diretto' AND area_id IS NULL AND store_id IS NULL)
  )
);

CREATE TABLE public.canale_membri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canale_id uuid NOT NULL REFERENCES public.canali(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  ultimo_letto_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canale_id, user_id)
);

CREATE INDEX idx_canale_membri_user_id ON public.canale_membri (user_id);
CREATE INDEX idx_canale_membri_canale_id ON public.canale_membri (canale_id);
CREATE INDEX idx_canali_area_id ON public.canali (area_id);
CREATE INDEX idx_canali_store_id ON public.canali (store_id);

CREATE TRIGGER trg_canali_updated BEFORE UPDATE ON public.canali
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.is_canale_membro(_canale_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.canale_membri cm
    WHERE cm.canale_id = _canale_id AND cm.user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_canale_membro(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_canale_membro(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_canale_membro(uuid, uuid) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.canali TO authenticated;
GRANT ALL ON public.canali TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canale_membri TO authenticated;
GRANT ALL ON public.canale_membri TO service_role;

ALTER TABLE public.canali ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canale_membri ENABLE ROW LEVEL SECURITY;

CREATE POLICY canali_select ON public.canali FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'amministratore'::app_role)
  OR public.is_canale_membro(canali.id, auth.uid())
);
CREATE POLICY canali_insert ON public.canali FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'amministratore'::app_role));
CREATE POLICY canali_update ON public.canali FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role))
WITH CHECK (has_role(auth.uid(),'amministratore'::app_role));
CREATE POLICY canali_delete ON public.canali FOR DELETE TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role));

CREATE POLICY canale_membri_select ON public.canale_membri FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'amministratore'::app_role)
  OR public.is_canale_membro(canale_membri.canale_id, auth.uid())
);
CREATE POLICY canale_membri_insert ON public.canale_membri FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'amministratore'::app_role));
CREATE POLICY canale_membri_update ON public.canale_membri FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role))
WITH CHECK (has_role(auth.uid(),'amministratore'::app_role));
CREATE POLICY canale_membri_delete ON public.canale_membri FOR DELETE TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role));