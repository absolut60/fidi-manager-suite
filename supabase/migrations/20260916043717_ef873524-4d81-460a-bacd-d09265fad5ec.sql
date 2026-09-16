CREATE OR REPLACE FUNCTION public.trg_cancella_lead_evento_da_partecipante()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.lead%ROWTYPE;
BEGIN
  IF OLD.lead_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT * INTO v_lead FROM public.lead WHERE id = OLD.lead_id;
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  IF v_lead.fonte = 'evento'
     AND NOT EXISTS (SELECT 1 FROM public.opportunita WHERE lead_id = OLD.lead_id)
     AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale WHERE lead_id = OLD.lead_id)
     AND NOT EXISTS (SELECT 1 FROM public.lead_richieste WHERE lead_id = OLD.lead_id)
     AND NOT EXISTS (SELECT 1 FROM public.cantieri WHERE lead_id = OLD.lead_id)
     AND NOT EXISTS (SELECT 1 FROM public.eventi_partecipanti WHERE lead_id = OLD.lead_id AND id <> OLD.id)
  THEN
    DELETE FROM public.contatti WHERE lead_id = OLD.lead_id AND cliente_id IS NULL;
    DELETE FROM public.lead WHERE id = OLD.lead_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancella_lead_evento ON public.eventi_partecipanti;
CREATE TRIGGER trg_cancella_lead_evento
  BEFORE DELETE ON public.eventi_partecipanti
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_cancella_lead_evento_da_partecipante();