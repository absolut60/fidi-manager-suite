-- Prova annullata su duplicato temporaneo, utente reale amministratore con MFA.
-- Nessuna modifica persistente ai documenti e ai contatori.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"485baff2-b930-4947-a868-9e3da3d3a0c9","role":"authenticated","aal":"aal2"}',true);
DO $test$
DECLARE
  v_prev uuid; v_blocco uuid; v_riga uuid; v_ordine1 uuid; v_ordine2 uuid;
  v_selezione jsonb; v_stato public.stato_preventivo; v_precedente public.stato_preventivo;
BEGIN
  INSERT INTO public.preventivi (tipo,data,cliente_id,agente_codice,linea,store_id,stato,titolo)
  SELECT 'preventivo',CURRENT_DATE,cliente_id,agente_codice,linea,store_id,'inviato','TEST FM93 F3 ROLLBACK'
  FROM public.preventivi WHERE id='05cf2b75-303e-469f-bd42-a6ad0602b692' RETURNING id INTO v_prev;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'TEST: origine non disponibile'; END IF;
  INSERT INTO public.blocchi_preventivo (preventivo_id,descrizione,ordine) VALUES (v_prev,'TEST',0) RETURNING id INTO v_blocco;
  INSERT INTO public.righe_preventivo (blocco_id,tipo_riga,descrizione,um,quantita,qta_ordinata,ordine,prezzo_unit,importo)
  VALUES (v_blocco,'manuale','TEST','PZ',10,0,0,1,10) RETURNING id INTO v_riga;
  v_selezione := jsonb_build_array(jsonb_build_object('blocco_id',v_blocco,'righe',jsonb_build_array(jsonb_build_object('riga_id',v_riga,'quantita',4))));
  v_ordine1 := public.trasforma_preventivo_in_ordine(v_prev,v_selezione);
  SELECT stato,stato_prima_ordine INTO v_stato,v_precedente FROM public.preventivi WHERE id=v_prev;
  IF v_stato IS DISTINCT FROM 'ordinato'::public.stato_preventivo OR v_precedente IS DISTINCT FROM 'inviato'::public.stato_preventivo THEN RAISE EXCEPTION 'TEST: prima trasformazione %, %',v_stato,v_precedente; END IF;
  IF (SELECT stato FROM public.preventivi WHERE id=v_ordine1) IS DISTINCT FROM 'bozza'::public.stato_preventivo THEN RAISE EXCEPTION 'TEST: stato ordine cambiato'; END IF;
  UPDATE public.preventivi SET stato='inviato' WHERE id=v_prev AND stato='bozza';
  IF (SELECT stato FROM public.preventivi WHERE id=v_prev) IS DISTINCT FROM 'ordinato'::public.stato_preventivo THEN RAISE EXCEPTION 'TEST: email cambia ordinato'; END IF;
  DELETE FROM public.preventivi WHERE id=v_ordine1;
  SELECT stato,stato_prima_ordine INTO v_stato,v_precedente FROM public.preventivi WHERE id=v_prev;
  IF v_stato IS DISTINCT FROM 'inviato'::public.stato_preventivo OR v_precedente IS NOT NULL THEN RAISE EXCEPTION 'TEST: ripristino unico ordine %, %',v_stato,v_precedente; END IF;
  v_ordine1 := public.trasforma_preventivo_in_ordine(v_prev,v_selezione);
  v_ordine2 := public.trasforma_preventivo_in_ordine(v_prev,v_selezione);
  DELETE FROM public.preventivi WHERE id=v_ordine1;
  SELECT stato,stato_prima_ordine INTO v_stato,v_precedente FROM public.preventivi WHERE id=v_prev;
  IF v_stato IS DISTINCT FROM 'ordinato'::public.stato_preventivo OR v_precedente IS DISTINCT FROM 'inviato'::public.stato_preventivo THEN RAISE EXCEPTION 'TEST: uno di due ordini %, %',v_stato,v_precedente; END IF;
  IF (SELECT qta_ordinata FROM public.righe_preventivo WHERE id=v_riga) IS DISTINCT FROM 4::numeric THEN RAISE EXCEPTION 'TEST: quantità derivate'; END IF;
  DELETE FROM public.preventivi WHERE id=v_ordine2;
  SELECT stato,stato_prima_ordine INTO v_stato,v_precedente FROM public.preventivi WHERE id=v_prev;
  IF v_stato IS DISTINCT FROM 'inviato'::public.stato_preventivo OR v_precedente IS NOT NULL THEN RAISE EXCEPTION 'TEST: ultimo di due ordini %, %',v_stato,v_precedente; END IF;
  v_ordine1 := public.trasforma_preventivo_in_ordine(v_prev,v_selezione);
  UPDATE public.preventivi SET stato_prima_ordine=NULL WHERE id=v_prev;
  DELETE FROM public.preventivi WHERE id=v_ordine1;
  IF (SELECT stato FROM public.preventivi WHERE id=v_prev) IS DISTINCT FROM 'bozza'::public.stato_preventivo THEN RAISE EXCEPTION 'TEST: fallback bozza'; END IF;
END;
$test$;
ROLLBACK;

-- Verifiche di struttura/permessi (sola lettura).
SELECT column_name,udt_name,is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='preventivi' AND column_name='stato_prima_ordine';
SELECT enumlabel FROM pg_enum WHERE enumtypid='public.stato_preventivo'::regtype ORDER BY enumsortorder;
SELECT p.proname,p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,pg_get_triggerdef(t.oid)
FROM pg_proc p JOIN pg_trigger t ON t.tgfoid=p.oid WHERE p.proname='ripristina_stato_preventivo_dopo_ordine';
SELECT pg_get_functiondef('public.trasforma_preventivo_in_ordine(uuid,jsonb)'::regprocedure);
SELECT count(*) AS prove_persistenti FROM public.preventivi WHERE titolo='TEST FM93 F3 ROLLBACK';
