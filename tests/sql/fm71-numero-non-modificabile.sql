-- DB reale: nessuna fixture o avanzamento contatore resta dopo ROLLBACK.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"30c9d579-76c3-4312-b47e-3f9f4680fc40","role":"authenticated","aal":"aal2"}', true);
DO $test$
DECLARE
  p1 uuid; p2 uuid; esplicito uuid; ordine uuid;
  n1 text; n2 text; no text; firma text; contatore integer;
  messaggio text;
BEGIN
  SELECT md5(string_agg(id::text||':'||coalesce(numero,'<NULL>'),'|' ORDER BY id)) INTO firma FROM public.preventivi;
  INSERT INTO public.preventivi(titolo) VALUES ('FM71 TEST numero 1') RETURNING id,numero INTO p1,n1;
  INSERT INTO public.preventivi(titolo) VALUES ('FM71 TEST numero 2') RETURNING id,numero INTO p2,n2;
  IF n1 !~ '^PRV-[0-9]+/[0-9]{2}$' OR n2 !~ '^PRV-[0-9]+/[0-9]{2}$'
    OR split_part(split_part(n2,'-',2),'/',1)::integer <> split_part(split_part(n1,'-',2),'/',1)::integer + 1
    OR n1=n2 THEN RAISE EXCEPTION 'Numeri preventivi non consecutivi/univoci: %, %',n1,n2; END IF;
  SELECT ultimo_numero INTO contatore FROM public.contatori_preventivo WHERE anno=EXTRACT(YEAR FROM CURRENT_DATE)::integer AND tipo='preventivo';
  IF contatore <> split_part(split_part(n2,'-',2),'/',1)::integer THEN RAISE EXCEPTION 'Contatore non allineato'; END IF;
  INSERT INTO public.preventivi(numero,titolo) VALUES ('FM71-ESPLICITO-TEST','FM71 TEST esplicito') RETURNING id INTO esplicito;
  IF NOT EXISTS(SELECT 1 FROM public.preventivi WHERE id=esplicito AND numero='FM71-ESPLICITO-TEST') THEN RAISE EXCEPTION 'Numero esplicito sovrascritto'; END IF;
  BEGIN
    INSERT INTO public.preventivi(numero) VALUES ('FM71-ESPLICITO-TEST');
    RAISE EXCEPTION 'Doppione esplicito accettato';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- L'utente amministratore non è service_role: il trigger deve negare.
  BEGIN
    UPDATE public.preventivi SET numero='FM71-MODIFICA-NEGATA' WHERE id=p1;
    RAISE EXCEPTION 'UPDATE numero non negato';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS messaggio=MESSAGE_TEXT;
    IF messaggio <> 'Il numero del documento è assegnato dal database e non può essere modificato.' THEN RAISE EXCEPTION 'Errore inatteso: %',messaggio; END IF;
  END;
  UPDATE public.preventivi SET numero=numero,titolo='FM71 TEST altro campo' WHERE id=p1;
  INSERT INTO public.preventivi(tipo,titolo) VALUES ('ordine','FM71 TEST ordine') RETURNING id,numero INTO ordine,no;
  IF no !~ '^ORD-[0-9]+/[0-9]{2}$' THEN RAISE EXCEPTION 'Numero ordine non assegnato'; END IF;
  IF public.trasforma_preventivo_in_ordine(p2,'[]'::jsonb) IS NULL THEN RAISE EXCEPTION 'Conversione non riuscita'; END IF;
  -- Eccezione tecnica esplicita, annullata con tutto il test.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.preventivi SET numero='FM71-SERVICE-TEST' WHERE id=p1;
  IF NOT EXISTS(SELECT 1 FROM public.preventivi WHERE id=p1 AND numero='FM71-SERVICE-TEST') THEN RAISE EXCEPTION 'Eccezione service_role non rispettata'; END IF;
  IF firma IS DISTINCT FROM (SELECT md5(string_agg(id::text||':'||coalesce(numero,'<NULL>'),'|' ORDER BY id)) FROM public.preventivi WHERE titolo IS NULL OR titolo NOT LIKE 'FM71 TEST%') THEN RAISE EXCEPTION 'Numeri esistenti modificati'; END IF;
END;
$test$;
ROLLBACK;