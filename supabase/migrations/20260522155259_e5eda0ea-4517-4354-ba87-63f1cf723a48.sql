-- Funzione: crea automaticamente una richiesta_fido in bozza quando un cliente
-- viene inserito o aggiornato con un importo_affidamento_richiesto > 0,
-- se non esiste già una richiesta non chiusa per quel cliente.
CREATE OR REPLACE FUNCTION public.crea_richiesta_fido_da_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _esistente uuid;
BEGIN
  IF NEW.importo_affidamento_richiesto IS NULL OR NEW.importo_affidamento_richiesto <= 0 THEN
    RETURN NEW;
  END IF;

  -- Su UPDATE, salta se l'importo non è cambiato
  IF TG_OP = 'UPDATE' AND OLD.importo_affidamento_richiesto IS NOT DISTINCT FROM NEW.importo_affidamento_richiesto THEN
    RETURN NEW;
  END IF;

  -- Evita duplicati: non creare se esiste già una richiesta non chiusa
  SELECT id INTO _esistente
  FROM public.richieste_fido
  WHERE cliente_id = NEW.id
    AND stato NOT IN ('approvata','rifiutata','annullata')
  LIMIT 1;

  IF _esistente IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.richieste_fido (
    cliente_id,
    store_id,
    importo_richiesto,
    tipo,
    stato,
    motivazione,
    created_by
  ) VALUES (
    NEW.id,
    NEW.store_id,
    NEW.importo_affidamento_richiesto,
    'nuovo',
    'bozza',
    NEW.note_amministrazione,
    COALESCE(NEW.created_by, auth.uid())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crea_richiesta_fido_da_cliente_ins ON public.clienti;
CREATE TRIGGER trg_crea_richiesta_fido_da_cliente_ins
AFTER INSERT ON public.clienti
FOR EACH ROW
EXECUTE FUNCTION public.crea_richiesta_fido_da_cliente();

DROP TRIGGER IF EXISTS trg_crea_richiesta_fido_da_cliente_upd ON public.clienti;
CREATE TRIGGER trg_crea_richiesta_fido_da_cliente_upd
AFTER UPDATE OF importo_affidamento_richiesto ON public.clienti
FOR EACH ROW
EXECUTE FUNCTION public.crea_richiesta_fido_da_cliente();

-- Anche il trigger richieste_fido_prepare deve essere attivo per calcolare livello
DROP TRIGGER IF EXISTS trg_richieste_fido_prepare ON public.richieste_fido;
CREATE TRIGGER trg_richieste_fido_prepare
BEFORE INSERT OR UPDATE ON public.richieste_fido
FOR EACH ROW
EXECUTE FUNCTION public.richieste_fido_prepare();

-- Backfill: crea richieste in bozza per i clienti esistenti con importo > 0 senza richiesta
INSERT INTO public.richieste_fido (cliente_id, store_id, importo_richiesto, tipo, stato, motivazione, created_by)
SELECT c.id, c.store_id, c.importo_affidamento_richiesto, 'nuovo', 'bozza', c.note_amministrazione, c.created_by
FROM public.clienti c
WHERE c.importo_affidamento_richiesto IS NOT NULL
  AND c.importo_affidamento_richiesto > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.richieste_fido r
    WHERE r.cliente_id = c.id
      AND r.stato NOT IN ('approvata','rifiutata','annullata')
  );