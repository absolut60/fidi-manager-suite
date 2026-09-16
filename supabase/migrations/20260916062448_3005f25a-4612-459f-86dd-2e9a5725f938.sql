DROP TRIGGER IF EXISTS trg_cancella_lead_evento ON public.eventi_partecipanti;

CREATE OR REPLACE FUNCTION public.trg_cancella_lead_evento_da_partecipante()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.lead%ROWTYPE;
BEGIN
  IF OLD.lead_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_lead FROM public.lead WHERE id = OLD.lead_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_lead.fonte = 'evento'
     AND NOT EXISTS (SELECT 1 FROM public.opportunita WHERE lead_id = OLD.lead_id)
     AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale WHERE lead_id = OLD.lead_id)
     AND NOT EXISTS (SELECT 1 FROM public.lead_richieste WHERE lead_id = OLD.lead_id)
     AND NOT EXISTS (SELECT 1 FROM public.cantieri WHERE lead_id = OLD.lead_id)
     AND NOT EXISTS (SELECT 1 FROM public.eventi_partecipanti WHERE lead_id = OLD.lead_id)
  THEN
    DELETE FROM public.contatti WHERE lead_id = OLD.lead_id AND cliente_id IS NULL;
    DELETE FROM public.lead WHERE id = OLD.lead_id;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_cancella_lead_evento_da_partecipante() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.trg_cancella_lead_evento_da_partecipante() TO service_role;

CREATE TRIGGER trg_cancella_lead_evento
AFTER DELETE ON public.eventi_partecipanti
FOR EACH ROW EXECUTE FUNCTION public.trg_cancella_lead_evento_da_partecipante();