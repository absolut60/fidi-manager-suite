CREATE OR REPLACE FUNCTION public.audit_clienti()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _old jsonb;
  _new jsonb;
  _campi jsonb;
  -- Campi NON registrati: timestamp tecnici e saldi che cambiano a ogni import
  -- (la loro storia sta nello scadenziario e nelle importazioni, non qui).
  _esclusi text[] := ARRAY[
    'updated_at','ultima_sincronizzazione','ultima_importazione_d',
    'totale_rischio','fido_residuo','scaduto','a_scadere','saldo_contabile',
    'doc_da_fatturare','doc_da_evadere','effetti_a_rischio','dilazione_effettiva',
    'num_insoluti','ultima_data_fatturazione','data_blocco',
    'privacy_token','privacy_token_expires_at'
  ];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    _old := to_jsonb(OLD) - _esclusi;
    _new := to_jsonb(NEW) - _esclusi;
    IF _old = _new THEN
      RETURN NEW;  -- nessun campo significativo cambiato: niente riga di registro
    END IF;
    SELECT jsonb_object_agg(n.key, jsonb_build_object('da', _old -> n.key, 'a', n.value))
      INTO _campi
      FROM jsonb_each(_new) AS n
     WHERE (_old -> n.key) IS DISTINCT FROM n.value;
  END IF;

  IF _uid IS NOT NULL THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(user_id, user_email, entita, entita_id, azione, dettagli)
    VALUES (_uid, _email, 'cliente', NEW.id, 'creato',
            jsonb_build_object('ragione_sociale', NEW.ragione_sociale,
                               'origine', CASE WHEN _uid IS NULL THEN 'sistema' ELSE 'utente' END));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log(user_id, user_email, entita, entita_id, azione, dettagli)
    VALUES (_uid, _email, 'cliente', NEW.id, 'aggiornato',
            jsonb_build_object('ragione_sociale', NEW.ragione_sociale,
                               'origine', CASE WHEN _uid IS NULL THEN 'sistema' ELSE 'utente' END,
                               'campi', COALESCE(_campi, '{}'::jsonb)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log(user_id, user_email, entita, entita_id, azione, dettagli)
    VALUES (_uid, _email, 'cliente', OLD.id, 'eliminato',
            jsonb_build_object('ragione_sociale', OLD.ragione_sociale,
                               'origine', CASE WHEN _uid IS NULL THEN 'sistema' ELSE 'utente' END));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;