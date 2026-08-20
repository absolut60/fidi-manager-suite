CREATE OR REPLACE FUNCTION public.ricalcola_in_gestione_legale(_cliente_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag boolean;
BEGIN
  IF _cliente_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pratiche_legali pl
    WHERE pl.cliente_id = _cliente_id
      AND pl.stato::text NOT LIKE 'chiusa%'
  ) OR EXISTS (
    SELECT 1 FROM public.note_legali_gestionali nl
    WHERE nl.cliente_id = _cliente_id
  )
  INTO v_flag;

  UPDATE public.clienti c
     SET in_gestione_legale = v_flag
   WHERE c.id = _cliente_id
     AND COALESCE(c.in_gestione_legale, false) IS DISTINCT FROM v_flag;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_ricalcola_in_gestione_legale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.ricalcola_in_gestione_legale(OLD.cliente_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
    PERFORM public.ricalcola_in_gestione_legale(OLD.cliente_id);
  END IF;

  PERFORM public.ricalcola_in_gestione_legale(NEW.cliente_id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ricalcola_in_gestione_legale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ricalcola_in_gestione_legale(uuid) TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_pratiche_legali_gestione_legale ON public.pratiche_legali;
CREATE TRIGGER trg_pratiche_legali_gestione_legale
AFTER INSERT OR UPDATE OR DELETE ON public.pratiche_legali
FOR EACH ROW EXECUTE FUNCTION public.trg_ricalcola_in_gestione_legale();

DROP TRIGGER IF EXISTS trg_note_legali_gest_gestione_legale ON public.note_legali_gestionali;
CREATE TRIGGER trg_note_legali_gest_gestione_legale
AFTER INSERT OR DELETE ON public.note_legali_gestionali
FOR EACH ROW EXECUTE FUNCTION public.trg_ricalcola_in_gestione_legale();

-- Allineamento una-tantum
WITH atteso AS (
  SELECT c.id,
         (EXISTS (SELECT 1 FROM public.pratiche_legali pl WHERE pl.cliente_id = c.id AND pl.stato::text NOT LIKE 'chiusa%')
          OR EXISTS (SELECT 1 FROM public.note_legali_gestionali nl WHERE nl.cliente_id = c.id)) AS flag
  FROM public.clienti c
)
UPDATE public.clienti c
   SET in_gestione_legale = a.flag
  FROM atteso a
 WHERE c.id = a.id
   AND COALESCE(c.in_gestione_legale, false) IS DISTINCT FROM a.flag;
