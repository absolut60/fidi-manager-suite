-- Verifica 1a una tantum sul database reale; tutte le scritture sono annullate.
-- L'eccezione OK_ROLLBACK è l'esito positivo e annulla anche gli INSERT di prova.
DO $test$
DECLARE
  v_kit public.kit%ROWTYPE;
  v_componente public.kit_componenti%ROWTYPE;
  n integer;
BEGIN
  IF (SELECT count(*) FROM public.kit) <> 3 THEN RAISE EXCEPTION 'Conteggio kit diverso da 3'; END IF;
  IF (SELECT count(*) FROM public.kit_famiglie) <> 6 THEN RAISE EXCEPTION 'Conteggio famiglie diverso da 6'; END IF;
  IF (SELECT count(*) FROM public.kit_componenti) <> 33 THEN RAISE EXCEPTION 'Conteggio componenti diverso da 33'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.kit k LEFT JOIN public.kit_famiglie f ON f.id=k.famiglia_id
    WHERE k.codice IS NULL OR k.linea <> 'sistema_made' OR f.linea <> k.linea
      OR f.codice IS DISTINCT FROM k.famiglia::text OR k.specifiche IS DISTINCT FROM
      jsonb_strip_nulls(jsonb_build_object('tipo_struttura',k.tipo_struttura,
        'spessore_mm',k.spessore,'h_max_m',k.h_max,'passo',k.passo,'passo_um',k.passo_um,'isolante',k.isolante))
  ) THEN RAISE EXCEPTION 'Backfill kit incoerente'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.kit_componenti c JOIN public.articoli a ON a.id=c.articolo_id
    LEFT JOIN public.articoli_gamma g ON g.codice=a.cod_gamma
    WHERE c.articolo_codice IS DISTINCT FROM g.codice
      OR (g.codice IS NULL AND (c.codice_articolo_fornitore IS DISTINCT FROM COALESCE(NULLIF(a.cod_gamma,''),a.cod_fornitore)
        OR c.descrizione IS DISTINCT FROM a.descrizione OR c.um IS DISTINCT FROM a.um))
  ) THEN RAISE EXCEPTION 'Backfill componenti incoerente'; END IF;
  IF (SELECT count(*) FROM public.kit_componenti WHERE articolo_codice IS NOT NULL) <> 30
    OR (SELECT count(*) FROM public.kit_componenti WHERE articolo_codice IS NULL) <> 3
    THEN RAISE EXCEPTION 'Ripartizione Gamma/manuali diversa da 30/3'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='kit_famiglie') <> 3
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kit_famiglie'
      AND policyname='Secondo fattore (FM44)' AND permissive='RESTRICTIVE' AND cmd='ALL'
      AND qual LIKE '%auth_mfa_ok()%' AND with_check LIKE '%auth_mfa_ok()%')
    THEN RAISE EXCEPTION 'Policy famiglie o secondo fattore mancanti'; END IF;
  IF NOT has_table_privilege('authenticated','public.kit_famiglie','SELECT,INSERT,UPDATE,DELETE')
    OR NOT has_table_privilege('service_role','public.kit_famiglie','SELECT,INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION 'Grant famiglie mancanti'; END IF;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.kit_famiglie;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'Famiglie accessibili senza autenticazione'; END IF;

  -- Stesso payload minimo della schermata attuale, senza i nuovi campi.
  INSERT INTO public.kit (nome, famiglia) VALUES ('Fixture FM90 rollback','PARETE') RETURNING * INTO v_kit;
  IF v_kit.codice NOT LIKE 'LEGACY-%' OR v_kit.linea <> 'sistema_made' OR v_kit.specifiche <> '{}'
    THEN RAISE EXCEPTION 'Creazione storica non compatibile'; END IF;
  BEGIN
    INSERT INTO public.kit (nome,codice) VALUES ('Duplicato vietato',v_kit.codice);
    RAISE EXCEPTION 'Codice duplicato accettato';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO public.kit_componenti (kit_id,incidenza,tipo_driver,valore_driver)
    VALUES (v_kit.id,0,'CONSUMO',5) RETURNING * INTO v_componente;
  IF v_componente.incidenza <> 0 OR v_componente.valore_driver <> 5 THEN RAISE EXCEPTION 'Dati componente storico alterati'; END IF;
  UPDATE public.kit SET passo=600,passo_um='MM' WHERE id=v_kit.id;
  IF NOT EXISTS (SELECT 1 FROM public.kit WHERE id=v_kit.id AND passo=600 AND passo_um='MM')
    THEN RAISE EXCEPTION 'Modifica storica non compatibile'; END IF;
  RAISE EXCEPTION 'OK_ROLLBACK FM90 kit=3 famiglie=6 componenti=33 Gamma=30 manuali=3; backfill, anon negato, default, unicità, creazione/modifica storica verificati';
END $test$;