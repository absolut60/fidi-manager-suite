CREATE OR REPLACE FUNCTION public.notifica_richiesta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ruolo app_role;
  _approvatore record;
  _cliente text;
  _store_nome text;
  _metadata_store jsonb := '{}'::jsonb;
BEGIN
  -- Notifica approvatori quando entra in_approvazione
  IF NEW.stato = 'in_approvazione' AND (OLD IS NULL OR OLD.stato <> 'in_approvazione') THEN
    SELECT c.ragione_sociale, s.nome
    INTO _cliente, _store_nome
    FROM public.clienti c
    LEFT JOIN public.stores s ON s.id = NEW.store_id
    WHERE c.id = NEW.cliente_id;

    IF NEW.store_id IS NOT NULL THEN
      _metadata_store := jsonb_build_object('store_id', NEW.store_id);
    END IF;
    IF _store_nome IS NOT NULL THEN
      _metadata_store := _metadata_store || jsonb_build_object('gruppo_etichetta', _store_nome);
    END IF;

    _ruolo := ('approvatore_liv' || NEW.livello_corrente)::app_role;
    FOR _approvatore IN
      SELECT DISTINCT user_id
      FROM public.user_roles
      WHERE role = _ruolo OR role = 'amministratore'
    LOOP
      INSERT INTO public.notifiche(user_id, tipo, titolo, messaggio, link, metadata)
      VALUES (
        _approvatore.user_id,
        'richiesta_da_approvare',
        'Nuova richiesta da approvare',
        format('Richiesta livello %s per %s (€ %s)', NEW.livello_corrente, COALESCE(_cliente, '—'), NEW.importo_richiesto),
        '/richieste/' || NEW.id,
        jsonb_build_object('richiesta_id', NEW.id, 'livello', NEW.livello_corrente) || _metadata_store
      );
    END LOOP;
  END IF;
  
  -- Notifica autore quando approvata/rifiutata
  IF NEW.stato IN ('approvata','rifiutata') AND OLD.stato <> NEW.stato AND NEW.created_by IS NOT NULL THEN
    IF _cliente IS NULL THEN
      SELECT c.ragione_sociale, s.nome
      INTO _cliente, _store_nome
      FROM public.clienti c
      LEFT JOIN public.stores s ON s.id = NEW.store_id
      WHERE c.id = NEW.cliente_id;
    END IF;

    _metadata_store := '{}'::jsonb;
    IF NEW.store_id IS NOT NULL THEN
      _metadata_store := jsonb_build_object('store_id', NEW.store_id);
    END IF;
    IF _store_nome IS NOT NULL THEN
      _metadata_store := _metadata_store || jsonb_build_object('gruppo_etichetta', _store_nome);
    END IF;

    INSERT INTO public.notifiche(user_id, tipo, titolo, messaggio, link, metadata)
    VALUES (
      NEW.created_by,
      'richiesta_' || NEW.stato::text,
      CASE WHEN NEW.stato = 'approvata' THEN 'Richiesta approvata' ELSE 'Richiesta rifiutata' END,
      format('La tua richiesta di € %s è stata %s', NEW.importo_richiesto, NEW.stato),
      '/richieste/' || NEW.id,
      jsonb_build_object('richiesta_id', NEW.id) || _metadata_store
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notifica_admin_fido_approvato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _admin record;
  _cliente text;
  _store_nome text;
  _metadata_store jsonb := '{}'::jsonb;
BEGIN
  IF NEW.stato = 'approvata' AND (TG_OP = 'INSERT' OR OLD.stato <> 'approvata') THEN
    SELECT c.ragione_sociale, s.nome
    INTO _cliente, _store_nome
    FROM public.clienti c
    LEFT JOIN public.stores s ON s.id = NEW.store_id
    WHERE c.id = NEW.cliente_id;

    IF NEW.store_id IS NOT NULL THEN
      _metadata_store := jsonb_build_object('store_id', NEW.store_id);
    END IF;
    IF _store_nome IS NOT NULL THEN
      _metadata_store := _metadata_store || jsonb_build_object('gruppo_etichetta', _store_nome);
    END IF;

    FOR _admin IN
      SELECT DISTINCT user_id
      FROM public.user_roles
      WHERE role = 'amministratore'
    LOOP
      INSERT INTO public.notifiche(user_id, tipo, titolo, messaggio, link, metadata)
      VALUES (
        _admin.user_id,
        'fido_da_processare',
        'Nuovo fido da processare',
        format('Nuovo fido da processare: %s — € %s', COALESCE(_cliente, '—'), COALESCE(NEW.importo_approvato, NEW.importo_richiesto)),
        '/fidi-processare',
        jsonb_build_object('richiesta_id', NEW.id) || _metadata_store
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;