CREATE OR REPLACE FUNCTION public.richieste_fido_guardia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _gestione boolean;
BEGIN
  -- Vale solo per le scritture dirette degli utenti dell'app.
  -- Dentro la RPC SECURITY DEFINER processa_richiesta_fido, con il service role e nelle migrazioni current_user è diverso: passa.
  IF current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF public.has_role(_uid, 'amministratore'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  _gestione := public.has_role(_uid, 'amministrazione'::app_role) OR public.has_role(_uid, 'direzione'::app_role);

  IF TG_OP = 'DELETE' THEN
    IF OLD.stato::text <> 'bozza' AND NOT public.has_role(_uid, 'amministrazione'::app_role) THEN
      RAISE EXCEPTION 'Si possono eliminare solo le richieste in bozza (stato=%).', OLD.stato USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.stato::text NOT IN ('bozza','in_approvazione') THEN
      RAISE EXCEPTION 'Una richiesta fido può nascere solo in bozza o in approvazione (stato=%).', NEW.stato USING ERRCODE = '42501';
    END IF;
    IF NEW.importo_approvato IS NOT NULL OR NEW.approvato_da IS NOT NULL OR NEW.data_approvazione IS NOT NULL
       OR NEW.esito_fido IS NOT NULL OR NEW.esito_condizione_pagamento IS NOT NULL
       OR NEW.stato_export IS NOT NULL OR NEW.data_export IS NOT NULL OR NEW.esportata_da IS NOT NULL
       OR NEW.data_processata IS NOT NULL OR NEW.processata_da IS NOT NULL THEN
      RAISE EXCEPTION 'I campi di decisione ed export non si possono impostare alla creazione della richiesta.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.importo_approvato IS DISTINCT FROM OLD.importo_approvato
     OR NEW.approvato_da IS DISTINCT FROM OLD.approvato_da
     OR NEW.data_approvazione IS DISTINCT FROM OLD.data_approvazione
     OR NEW.esito_fido IS DISTINCT FROM OLD.esito_fido
     OR NEW.esito_condizione_pagamento IS DISTINCT FROM OLD.esito_condizione_pagamento
     OR NEW.condizione_pagamento_precedente_cod IS DISTINCT FROM OLD.condizione_pagamento_precedente_cod
     OR NEW.condizione_pagamento_richiesta_cod IS DISTINCT FROM OLD.condizione_pagamento_richiesta_cod
     OR NEW.condizione_pagamento_modificata IS DISTINCT FROM OLD.condizione_pagamento_modificata THEN
    RAISE EXCEPTION 'La decisione su una richiesta fido si registra solo dalla funzione di approvazione.' USING ERRCODE = '42501';
  END IF;

  IF NEW.stato IS DISTINCT FROM OLD.stato THEN
    IF NOT (
         (OLD.stato::text = 'bozza' AND NEW.stato::text IN ('in_approvazione','annullata'))
      OR (OLD.stato::text = 'integrazioni_richieste' AND NEW.stato::text IN ('in_approvazione','annullata','bozza'))
    ) THEN
      RAISE EXCEPTION 'Passaggio di stato non consentito: % -> %.', OLD.stato, NEW.stato USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.stato_export IS DISTINCT FROM OLD.stato_export
     OR NEW.data_export IS DISTINCT FROM OLD.data_export
     OR NEW.esportata_da IS DISTINCT FROM OLD.esportata_da
     OR NEW.data_processata IS DISTINCT FROM OLD.data_processata
     OR NEW.processata_da IS DISTINCT FROM OLD.processata_da
     OR NEW.note_export IS DISTINCT FROM OLD.note_export THEN
    IF NOT _gestione OR OLD.stato::text <> 'approvata' THEN
      RAISE EXCEPTION 'I campi di export si gestiscono solo da Amministrazione/Direzione su richieste approvate.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR NEW.store_id IS DISTINCT FROM OLD.store_id
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.importo_richiesto IS DISTINCT FROM OLD.importo_richiesto
     OR NEW.durata_mesi IS DISTINCT FROM OLD.durata_mesi
     OR NEW.motivazione IS DISTINCT FROM OLD.motivazione
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.condizione_pagamento_cod IS DISTINCT FROM OLD.condizione_pagamento_cod THEN
    IF OLD.stato::text NOT IN ('bozza','integrazioni_richieste') THEN
      RAISE EXCEPTION 'Il contenuto di una richiesta si modifica solo in bozza o con integrazioni richieste (stato=%).', OLD.stato USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Il nome inizia per "a_" di proposito: i trigger BEFORE scattano in ordine alfabetico e la guardia deve vedere i valori inviati dall'utente PRIMA di richieste_fido_prepare e richieste_fido_export_init.
CREATE TRIGGER a_richieste_fido_guardia
  BEFORE INSERT OR UPDATE OR DELETE ON public.richieste_fido
  FOR EACH ROW EXECUTE FUNCTION public.richieste_fido_guardia();

COMMENT ON FUNCTION public.richieste_fido_guardia() IS 'FM41 (09/10/2026). Guardia sulle scritture dirette a richieste_fido (current_user = authenticated): approvata/rifiutata, importo approvato e campi di decisione solo dalla RPC processa_richiesta_fido; contenuto modificabile solo in bozza o integrazioni_richieste; export solo amministrazione/direzione su approvate; eliminazione solo bozze (o amministrazione); amministratore esente. Gemello TS: puoModificareRichiestaFido / puoEliminareRichiestaFido in src/lib/fidi.ts.';