-- A) SCHEMA
ALTER TABLE public.contatti ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE public.cantieri ALTER COLUMN cliente_id DROP NOT NULL;

ALTER TABLE public.contatti
  ADD CONSTRAINT contatti_cliente_o_lead_chk
  CHECK (cliente_id IS NOT NULL OR lead_id IS NOT NULL);

ALTER TABLE public.cantieri
  ADD CONSTRAINT cantieri_cliente_o_lead_chk
  CHECK (cliente_id IS NOT NULL OR lead_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_contatti_lead_only
  ON public.contatti (lead_id) WHERE cliente_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cantieri_lead_only
  ON public.cantieri (lead_id) WHERE cliente_id IS NULL;

-- B) RLS — rami OR isolati per righe lead-only
DROP POLICY IF EXISTS "Contatti: visibili come il cliente" ON public.contatti;
CREATE POLICY "Contatti: visibili come il cliente"
ON public.contatti FOR SELECT TO authenticated
USING (
  user_can_access_cliente(cliente_id)
  OR has_role(auth.uid(), 'marketing'::app_role)
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND can_access_lead(auth.uid()))
);

DROP POLICY IF EXISTS "Contatti: insert come il cliente" ON public.contatti;
CREATE POLICY "Contatti: insert come il cliente"
ON public.contatti FOR INSERT TO authenticated
WITH CHECK (
  user_can_write_cliente(cliente_id)
  OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
  OR (has_role(auth.uid(), 'marketing'::app_role) AND cliente_id IS NOT NULL)
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND can_access_lead(auth.uid()))
);

DROP POLICY IF EXISTS "Contatti: update come il cliente" ON public.contatti;
CREATE POLICY "Contatti: update come il cliente"
ON public.contatti FOR UPDATE TO authenticated
USING (
  user_can_write_cliente(cliente_id)
  OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
  OR has_role(auth.uid(), 'marketing'::app_role)
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND can_access_lead(auth.uid()))
)
WITH CHECK (
  user_can_write_cliente(cliente_id)
  OR (has_role(auth.uid(), 'agente'::app_role) AND user_can_access_cliente(cliente_id))
  OR (has_role(auth.uid(), 'marketing'::app_role) AND cliente_id IS NOT NULL)
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND can_access_lead(auth.uid()))
);

DROP POLICY IF EXISTS "Contatti: delete admin" ON public.contatti;
CREATE POLICY "Contatti: delete admin"
ON public.contatti FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND can_access_lead(auth.uid()))
);

DROP POLICY IF EXISTS "Cantieri: select come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: select come il cliente"
ON public.cantieri FOR SELECT TO authenticated
USING (
  (cliente_id IN (
    SELECT c.id FROM public.clienti c
    WHERE has_role(auth.uid(), 'amministratore'::app_role)
       OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
       OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
       OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
       OR c.store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
  ))
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND can_access_lead(auth.uid()))
);

DROP POLICY IF EXISTS "Cantieri: insert come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: insert come il cliente"
ON public.cantieri FOR INSERT TO authenticated
WITH CHECK (
  user_can_write_cliente(cliente_id)
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND can_access_lead(auth.uid()))
);

DROP POLICY IF EXISTS "Cantieri: update come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: update come il cliente"
ON public.cantieri FOR UPDATE TO authenticated
USING (
  user_can_write_cliente(cliente_id)
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND can_access_lead(auth.uid()))
)
WITH CHECK (
  user_can_write_cliente(cliente_id)
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND can_access_lead(auth.uid()))
);

DROP POLICY IF EXISTS "Cantieri: delete admin" ON public.cantieri;
CREATE POLICY "Cantieri: delete admin"
ON public.cantieri FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND can_access_lead(auth.uid()))
);

-- C) Guardia trigger privacy
CREATE OR REPLACE FUNCTION public.ricalcola_privacy_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cliente_id uuid;
  _ha_firmato boolean;
BEGIN
  _cliente_id := COALESCE(NEW.cliente_id, OLD.cliente_id);
  IF _cliente_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.contatti
    WHERE cliente_id = _cliente_id
      AND privacy_firmata = true
  ) INTO _ha_firmato;
  UPDATE public.clienti
  SET privacy_firmata = _ha_firmato
  WHERE id = _cliente_id;
  RETURN COALESCE(NEW, OLD);
END;
$function$;