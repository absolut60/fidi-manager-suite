ALTER TABLE public.eventi ADD COLUMN codice_pubblico text NULL;
ALTER TABLE public.eventi ADD CONSTRAINT eventi_codice_pubblico_key UNIQUE (codice_pubblico);
ALTER TABLE public.eventi ADD COLUMN iscrizioni_aperte boolean NOT NULL DEFAULT false;

ALTER TABLE public.eventi_partecipanti DROP CONSTRAINT eventi_partecipanti_origine_chk;
ALTER TABLE public.eventi_partecipanti ADD CONSTRAINT eventi_partecipanti_origine_chk
  CHECK (origine = ANY (ARRAY['atteso'::text, 'sul_posto'::text, 'import'::text, 'iscrizione_online'::text]));

CREATE OR REPLACE FUNCTION public.evento_iscrizioni_aperte(_aperte boolean, _data_evento date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(_aperte, false)
     AND (_data_evento IS NULL OR _data_evento >= (now() AT TIME ZONE 'Europe/Rome')::date)
$$;
COMMENT ON FUNCTION public.evento_iscrizioni_aperte(boolean, date) IS 'FM38: FONTE UNICA della regola "iscrizioni aperte": interruttore acceso e evento non ancora passato (il giorno dell''evento resta aperto, ora di Roma).';

CREATE OR REPLACE FUNCTION public.imposta_iscrizioni_evento(_evento_id uuid, _aperte boolean)
RETURNS TABLE(codice_pubblico text, iscrizioni_aperte boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _codice text;
  _tentativi int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_eventi_module_access(auth.uid()) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  SELECT e.codice_pubblico INTO _codice FROM public.eventi e WHERE e.id = _evento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento non trovato';
  END IF;

  WHILE _codice IS NULL LOOP
    _tentativi := _tentativi + 1;
    BEGIN
      UPDATE public.eventi e
         SET codice_pubblico = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
       WHERE e.id = _evento_id
       RETURNING e.codice_pubblico INTO _codice;
    EXCEPTION WHEN unique_violation THEN
      _codice := NULL;
      IF _tentativi >= 10 THEN
        RAISE EXCEPTION 'Impossibile generare un codice pubblico univoco';
      END IF;
    END;
  END LOOP;

  UPDATE public.eventi e SET iscrizioni_aperte = coalesce(_aperte, false) WHERE e.id = _evento_id;

  RETURN QUERY SELECT e.codice_pubblico, e.iscrizioni_aperte FROM public.eventi e WHERE e.id = _evento_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.imposta_iscrizioni_evento(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imposta_iscrizioni_evento(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_evento_iscrizione_pubblica(_codice text)
RETURNS TABLE(nome text, data_evento date, luogo text, aperte boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.nome, e.data_evento, e.luogo,
         public.evento_iscrizioni_aperte(e.iscrizioni_aperte, e.data_evento)
    FROM public.eventi e
   WHERE nullif(btrim(coalesce(_codice, '')), '') IS NOT NULL
     AND e.codice_pubblico = btrim(_codice)
$$;
REVOKE EXECUTE ON FUNCTION public.get_evento_iscrizione_pubblica(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_evento_iscrizione_pubblica(text) TO service_role;

CREATE OR REPLACE FUNCTION public.registra_iscrizione_evento_pubblica(
  _codice text, _nome text, _cognome text, _cellulare text,
  _azienda text DEFAULT NULL, _email text DEFAULT NULL)
RETURNS TABLE(ok boolean, gia_presente boolean, motivo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _ev record;
  _digits text;
BEGIN
  SELECT e.id, e.iscrizioni_aperte, e.data_evento INTO _ev
    FROM public.eventi e
   WHERE nullif(btrim(coalesce(_codice, '')), '') IS NOT NULL
     AND e.codice_pubblico = btrim(_codice);
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 'evento_non_trovato'::text; RETURN;
  END IF;

  IF NOT public.evento_iscrizioni_aperte(_ev.iscrizioni_aperte, _ev.data_evento) THEN
    RETURN QUERY SELECT false, false, 'iscrizioni_chiuse'::text; RETURN;
  END IF;

  IF coalesce(btrim(_nome), '') = '' OR coalesce(btrim(_cognome), '') = '' THEN
    RETURN QUERY SELECT false, false, 'dati_mancanti'::text; RETURN;
  END IF;

  _digits := regexp_replace(coalesce(_cellulare, ''), '\D', '', 'g');
  IF length(_digits) < 8 THEN
    RETURN QUERY SELECT false, false, 'numero_non_valido'::text; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('iscr_evento:' || _ev.id::text || ':' || right(_digits, 10)));

  IF EXISTS (
    SELECT 1 FROM public.eventi_partecipanti p
     WHERE p.evento_id = _ev.id
       AND right(regexp_replace(coalesce(p.telefono, ''), '\D', '', 'g'), 10) = right(_digits, 10)
  ) THEN
    RETURN QUERY SELECT true, true, 'gia_presente'::text; RETURN;
  END IF;

  INSERT INTO public.eventi_partecipanti (evento_id, stato, nome, cognome, ragione_sociale, email, telefono, origine, note)
  VALUES (_ev.id, 'atteso', btrim(_nome), btrim(_cognome), nullif(btrim(_azienda), ''),
          nullif(lower(btrim(_email)), ''), btrim(_cellulare), 'iscrizione_online', 'Iscrizione online (QR/link)');

  RETURN QUERY SELECT true, false, 'iscrizione_registrata'::text;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.registra_iscrizione_evento_pubblica(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registra_iscrizione_evento_pubblica(text, text, text, text, text, text) TO service_role;