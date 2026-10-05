-- FM38 Fetta L1: ambito del lead (commerciale/eventi)

ALTER TABLE public.lead
  ADD COLUMN ambito text NOT NULL DEFAULT 'commerciale'
  CONSTRAINT lead_ambito_chk CHECK (ambito IN ('commerciale','eventi'));

COMMENT ON COLUMN public.lead.ambito IS 'FM38: ambito di lavoro del lead. commerciale = lead da lavorare (lista quotidiana); eventi = anagrafica nata da un evento, da coltivare/reinvitare. Alla creazione vale eventi se fonte = evento (trigger lead_imposta_ambito); poi si cambia a mano.';

CREATE INDEX idx_lead_ambito_stato ON public.lead (ambito, stato);

CREATE OR REPLACE FUNCTION public.lead_imposta_ambito()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.fonte = 'evento'::lead_fonte THEN
    NEW.ambito := 'eventi';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.lead_imposta_ambito() IS 'FM38: alla creazione un lead con fonte evento nasce nell''ambito eventi. Fonte unica della regola di nascita: le funzioni che creano lead da evento non devono impostare ambito.';

CREATE TRIGGER trg_lead_imposta_ambito
BEFORE INSERT ON public.lead
FOR EACH ROW
EXECUTE FUNCTION public.lead_imposta_ambito();