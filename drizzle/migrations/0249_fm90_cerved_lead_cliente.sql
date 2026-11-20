CREATE OR REPLACE FUNCTION public.lead_cerved_a_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; piva_cliente text;
BEGIN
  IF OLD.cliente_id IS NOT NULL OR NEW.cliente_id IS NULL THEN RETURN NEW; END IF;
  BEGIN
    SELECT * INTO r FROM public.cerved_soggetti WHERE lead_id = NEW.id LIMIT 1;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.cerved_soggetti WHERE cliente_id = NEW.cliente_id) THEN RETURN NEW; END IF;
    SELECT regexp_replace(coalesce(partita_iva, ''), '\D', '', 'g') INTO piva_cliente FROM public.clienti WHERE id = NEW.cliente_id;
    IF piva_cliente IS NULL OR piva_cliente = '' OR piva_cliente <> regexp_replace(coalesce(r.partita_iva, ''), '\D', '', 'g') THEN RETURN NEW; END IF;
    INSERT INTO public.cerved_soggetti (cliente_id, lead_id, id_soggetto, partita_iva, denominazione_cerved, collegato_da, aggiornato_da, collegato_il)
    VALUES (NEW.cliente_id, NULL, r.id_soggetto, r.partita_iva, r.denominazione_cerved, r.collegato_da, r.aggiornato_da, now());
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lead_cerved_a_cliente: %', SQLERRM;
  END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.lead_cerved_a_cliente() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_cerved_a_cliente() TO service_role;
CREATE TRIGGER trg_lead_cerved_cliente AFTER UPDATE OF cliente_id ON public.lead
  FOR EACH ROW EXECUTE FUNCTION public.lead_cerved_a_cliente();