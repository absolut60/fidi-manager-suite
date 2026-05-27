CREATE OR REPLACE FUNCTION public.ricalcola_privacy_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cliente_id uuid;
  _ha_firmato boolean;
BEGIN
  _cliente_id := COALESCE(NEW.cliente_id, OLD.cliente_id);
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
$$;

DROP TRIGGER IF EXISTS trg_ricalcola_privacy_cliente ON public.contatti;

CREATE TRIGGER trg_ricalcola_privacy_cliente
AFTER INSERT OR UPDATE OF privacy_firmata OR DELETE
ON public.contatti
FOR EACH ROW
EXECUTE FUNCTION public.ricalcola_privacy_cliente();

UPDATE public.clienti c
SET privacy_firmata = EXISTS (
  SELECT 1 FROM public.contatti
  WHERE cliente_id = c.id
    AND privacy_firmata = true
);