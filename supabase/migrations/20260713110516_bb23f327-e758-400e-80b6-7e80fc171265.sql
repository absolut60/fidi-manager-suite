-- ============================================================
-- CONTATTI: aggiunta ramo agente (SELECT + INSERT + UPDATE)
-- Il ramo si limita ad ampliare, non rimuove né restringe nessun accesso esistente.
-- ============================================================

-- SELECT: rifattorizzo delegando a user_can_access_cliente
-- (copre esattamente admin/liv1-3/store come la vecchia policy inline, più agente)
DROP POLICY IF EXISTS "Contatti: visibili come il cliente" ON public.contatti;
CREATE POLICY "Contatti: visibili come il cliente"
ON public.contatti
FOR SELECT
USING (public.user_can_access_cliente(cliente_id));

-- INSERT: withcheck = scrittura come cliente OPPURE agente sul proprio cliente
DROP POLICY IF EXISTS "Contatti: insert come il cliente" ON public.contatti;
CREATE POLICY "Contatti: insert come il cliente"
ON public.contatti
FOR INSERT
WITH CHECK (
  public.user_can_write_cliente(cliente_id)
  OR (
    public.has_role(auth.uid(), 'agente'::app_role)
    AND public.user_can_access_cliente(cliente_id)
  )
);

-- UPDATE: idem su USING + WITHCHECK
DROP POLICY IF EXISTS "Contatti: update come il cliente" ON public.contatti;
CREATE POLICY "Contatti: update come il cliente"
ON public.contatti
FOR UPDATE
USING (
  public.user_can_write_cliente(cliente_id)
  OR (
    public.has_role(auth.uid(), 'agente'::app_role)
    AND public.user_can_access_cliente(cliente_id)
  )
)
WITH CHECK (
  public.user_can_write_cliente(cliente_id)
  OR (
    public.has_role(auth.uid(), 'agente'::app_role)
    AND public.user_can_access_cliente(cliente_id)
  )
);

-- DELETE contatti: NON toccata, resta solo admin.

-- ============================================================
-- AZIONI_RECUPERO: trigger BEFORE INSERT per operatore_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_operatore_azione_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.operatore_id IS NULL THEN
    NEW.operatore_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_operatore_azione ON public.azioni_recupero;
CREATE TRIGGER trg_set_operatore_azione
BEFORE INSERT ON public.azioni_recupero
FOR EACH ROW
EXECUTE FUNCTION public.set_operatore_azione_default();