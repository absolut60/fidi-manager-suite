
ALTER TABLE public.richieste_fido
  ADD COLUMN IF NOT EXISTS stato_export text,
  ADD COLUMN IF NOT EXISTS data_export timestamptz,
  ADD COLUMN IF NOT EXISTS esportata_da uuid,
  ADD COLUMN IF NOT EXISTS data_processata timestamptz,
  ADD COLUMN IF NOT EXISTS processata_da uuid,
  ADD COLUMN IF NOT EXISTS note_export text;

ALTER TABLE public.richieste_fido
  DROP CONSTRAINT IF EXISTS richieste_fido_stato_export_check;
ALTER TABLE public.richieste_fido
  ADD CONSTRAINT richieste_fido_stato_export_check
  CHECK (stato_export IS NULL OR stato_export IN ('da_esportare','esportata','processata','errore_export'));

UPDATE public.richieste_fido
  SET stato_export = 'da_esportare'
  WHERE stato = 'approvata' AND stato_export IS NULL;

CREATE OR REPLACE FUNCTION public.richieste_fido_export_init()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stato = 'approvata' AND (TG_OP = 'INSERT' OR OLD.stato <> 'approvata') THEN
    IF NEW.stato_export IS NULL THEN
      NEW.stato_export := 'da_esportare';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_richieste_fido_export_init ON public.richieste_fido;
CREATE TRIGGER trg_richieste_fido_export_init
  BEFORE INSERT OR UPDATE ON public.richieste_fido
  FOR EACH ROW EXECUTE FUNCTION public.richieste_fido_export_init();

CREATE OR REPLACE FUNCTION public.notifica_admin_fido_approvato()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _admin record;
  _cliente text;
BEGIN
  IF NEW.stato = 'approvata' AND (TG_OP = 'INSERT' OR OLD.stato <> 'approvata') THEN
    SELECT ragione_sociale INTO _cliente FROM public.clienti WHERE id = NEW.cliente_id;
    FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'amministratore' LOOP
      INSERT INTO public.notifiche(user_id, tipo, titolo, messaggio, link, metadata)
      VALUES (
        _admin.user_id,
        'fido_da_processare',
        'Nuovo fido da processare',
        format('Nuovo fido da processare: %s — € %s', COALESCE(_cliente, '—'), COALESCE(NEW.importo_approvato, NEW.importo_richiesto)),
        '/fidi-processare',
        jsonb_build_object('richiesta_id', NEW.id)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_richieste_fido_notifica_admin ON public.richieste_fido;
CREATE TRIGGER trg_richieste_fido_notifica_admin
  AFTER INSERT OR UPDATE ON public.richieste_fido
  FOR EACH ROW EXECUTE FUNCTION public.notifica_admin_fido_approvato();
