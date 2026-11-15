-- DB reale, identità amministratore aal2 già usata nei test FM71.
-- Destinatari UUID di fixture senza account: nessun utente reale riceve avvisi.
-- ROLLBACK annulla documenti, contatore, notifiche e richieste push transazionali.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"30c9d579-76c3-4312-b47e-3f9f4680fc40","role":"authenticated","aal":"aal2"}', true);
DO $test$
DECLARE
  autore uuid := '30c9d579-76c3-4312-b47e-3f9f4680fc40';
  responsabile uuid := 'f0720000-0000-4000-8000-000000000001';
  nuovo uuid := 'f0720000-0000-4000-8000-000000000002';
  copia uuid := 'f0720000-0000-4000-8000-000000000003';
  aggiunto uuid := 'f0720000-0000-4000-8000-000000000004';
  p uuid; altro uuid; numero_p text;
  firma_preventivi text; firma_contatore text; firma_notifiche text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notifiche_tipi WHERE tipo='preventivo_assegnato'
    AND raggruppa AND chiave_metadata IS NULL
    AND titolo_gruppo='{n} preventivi assegnati o in copia' AND link_gruppo='/preventivatore/')
  THEN RAISE EXCEPTION 'Catalogo preventivo_assegnato assente o incoerente'; END IF;
  IF EXISTS (SELECT 1 FROM public.profili WHERE id IN (responsabile,nuovo,copia,aggiunto))
    OR EXISTS (SELECT 1 FROM public.notifiche WHERE user_id IN (responsabile,nuovo,copia,aggiunto))
  THEN RAISE EXCEPTION 'UUID di fixture già utilizzati: interrompere il test'; END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) INTO firma_preventivi FROM public.preventivi t;
  SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY anno,tipo),'')) INTO firma_contatore FROM public.contatori_preventivo t;
  SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) INTO firma_notifiche FROM public.notifiche t;

  -- Sotto-transazione di prova: anche le verifiche finali vedono lo stato ripristinato.
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.preventivi(titolo,assegnato_a)
      VALUES ('FM72 TEST assegnazione',responsabile) RETURNING id,numero INTO p,numero_p;
    RESET ROLE;
    IF (SELECT count(*) FROM public.notifiche WHERE user_id=responsabile AND tipo='preventivo_assegnato'
      AND titolo='Ti è stato assegnato un preventivo' AND messaggio=left(numero_p||' — FM72 TEST assegnazione',120)
      AND link='/preventivatore/'||p::text AND metadata=jsonb_build_object('preventivo_id',p) AND conteggio=1) <> 1
    THEN RAISE EXCEPTION 'Assegnazione: notifica, link o metadata errati'; END IF;

    SET LOCAL ROLE authenticated;
    UPDATE public.preventivi SET assegnato_a=nuovo WHERE id=p;
    RESET ROLE;
    IF (SELECT count(*) FROM public.notifiche WHERE user_id=nuovo AND tipo='preventivo_assegnato' AND conteggio=1) <> 1
      OR (SELECT sum(conteggio) FROM public.notifiche WHERE user_id=responsabile) <> 1
    THEN RAISE EXCEPTION 'Riassegnazione: notificare solo il nuovo responsabile'; END IF;

    SET LOCAL ROLE authenticated;
    UPDATE public.preventivi SET assegnati_copia=ARRAY[copia] WHERE id=p;
    UPDATE public.preventivi SET assegnati_copia=ARRAY[copia,aggiunto,aggiunto,autore] WHERE id=p;
    RESET ROLE;
    IF (SELECT count(*) FROM public.notifiche WHERE user_id=aggiunto AND tipo='preventivo_assegnato'
      AND titolo='Sei in copia su un preventivo' AND link='/preventivatore/'||p::text
      AND metadata=jsonb_build_object('preventivo_id',p) AND conteggio=1) <> 1
      OR (SELECT sum(conteggio) FROM public.notifiche WHERE user_id=copia) <> 1
    THEN RAISE EXCEPTION 'Copia: notificare solo chi viene aggiunto, senza duplicati'; END IF;

    SET LOCAL ROLE authenticated;
    UPDATE public.preventivi SET assegnato_a=autore WHERE id=p;
    RESET ROLE;
    IF firma_notifiche IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),''))
      FROM public.notifiche t WHERE user_id NOT IN (responsabile,nuovo,copia,aggiunto))
    THEN RAISE EXCEPTION 'Autoassegnazione o autocopia: autore notificato'; END IF;

    SET LOCAL ROLE authenticated;
    UPDATE public.preventivi SET titolo='FM72 TEST altro campo' WHERE id=p;
    RESET ROLE;
    IF (SELECT sum(conteggio) FROM public.notifiche WHERE user_id IN (responsabile,nuovo,copia,aggiunto)) <> 4
    THEN RAISE EXCEPTION 'UPDATE altri campi: notifica inattesa'; END IF;

    SET LOCAL ROLE authenticated;
    UPDATE public.preventivi SET assegnati_copia=ARRAY[copia],assegnato_a=NULL WHERE id=p;
    UPDATE public.preventivi SET assegnati_copia=assegnati_copia,assegnato_a=assegnato_a WHERE id=p;
    RESET ROLE;
    IF (SELECT sum(conteggio) FROM public.notifiche WHERE user_id IN (responsabile,nuovo,copia,aggiunto)) <> 4
    THEN RAISE EXCEPTION 'Rimozione o campi invariati: notifica inattesa'; END IF;

    -- INSERT con copie e raggruppamento tra documenti, non per preventivo_id.
    SET LOCAL ROLE authenticated;
    INSERT INTO public.preventivi(titolo,assegnato_a,assegnati_copia)
      VALUES ('FM72 TEST blocco',responsabile,ARRAY[copia,autore]) RETURNING id INTO altro;
    RESET ROLE;
    IF (SELECT count(*) FROM public.notifiche WHERE user_id=responsabile) <> 1
      OR (SELECT sum(conteggio) FROM public.notifiche WHERE user_id=responsabile) <> 2
      OR (SELECT sum(conteggio) FROM public.notifiche WHERE user_id=copia) <> 2
      OR NOT EXISTS (SELECT 1 FROM public.notifiche WHERE user_id=responsabile AND link='/preventivatore/'
        AND titolo='2 preventivi assegnati o in copia'
        AND metadata->'elementi' @> jsonb_build_array(jsonb_build_object('preventivo_id',altro)))
    THEN RAISE EXCEPTION 'INSERT copie o raggruppamento di blocco errati'; END IF;
    RAISE EXCEPTION USING ERRCODE='Z0072',MESSAGE='FM72 fixture da annullare';
  EXCEPTION WHEN SQLSTATE 'Z0072' THEN NULL;
  END;
  RESET ROLE;
  IF firma_preventivi IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM public.preventivi t)
    OR firma_contatore IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY anno,tipo),'')) FROM public.contatori_preventivo t)
    OR firma_notifiche IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM public.notifiche t)
  THEN RAISE EXCEPTION 'Prove non ripristinate integralmente'; END IF;
  RAISE NOTICE 'FM72: assegnazione, riassegnazione, copie, autore, altri campi, rimozioni e raggruppamento OK; dati e contatore invariati';
END;
$test$;
ROLLBACK;