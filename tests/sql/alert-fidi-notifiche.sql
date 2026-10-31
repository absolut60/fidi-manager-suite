-- Eseguire con sessione amministrativa: tutto annullato, incluse le code push
-- pg_net (le richieste HTTP partono solo dopo COMMIT).
BEGIN;
CREATE TEMP TABLE af_test_notifiche AS SELECT * FROM public.notifiche;
CREATE TEMP TABLE af_test_alert AS SELECT * FROM public.alert_fidi;
CREATE TEMP TABLE af_test_report (dati jsonb);
DO $test$
DECLARE
  v_n integer;
  v_report jsonb;
BEGIN
  -- Ogni valore diverso dall'esatto 'true' deve lasciare tutto invariato.
  INSERT INTO public.configurazioni(chiave,valore)
  VALUES ('alert_fidi_notifiche_attive','false')
  ON CONFLICT (chiave) DO UPDATE SET valore=EXCLUDED.valore;
  ASSERT public.invia_notifiche_alert_fidi() = 0, 'Spento deve restituire 0';
  UPDATE public.configurazioni SET valore='TRUE' WHERE chiave='alert_fidi_notifiche_attive';
  ASSERT public.invia_notifiche_alert_fidi() = 0, 'TRUE non deve accendere';
  DELETE FROM public.configurazioni WHERE chiave='alert_fidi_notifiche_attive';
  ASSERT public.invia_notifiche_alert_fidi() = 0, 'Chiave assente deve restituire 0';
  ASSERT NOT EXISTS (
    (SELECT * FROM public.notifiche EXCEPT SELECT * FROM af_test_notifiche)
    UNION ALL (SELECT * FROM af_test_notifiche EXCEPT SELECT * FROM public.notifiche)
  ), 'Spento non deve scrivere notifiche';
  ASSERT NOT EXISTS (
    (SELECT * FROM public.alert_fidi EXCEPT SELECT * FROM af_test_alert)
    UNION ALL (SELECT * FROM af_test_alert EXCEPT SELECT * FROM public.alert_fidi)
  ), 'Spento non deve segnare alert';

  -- Subtransazione: anche invii accesi e catalogo temporaneo vengono annullati.
  BEGIN
    INSERT INTO public.notifiche_tipi(tipo,raggruppa,chiave_metadata,titolo_gruppo,link_gruppo)
    VALUES ('alert_fido',true,'store_id','{gruppo}: {n} alert fidi','/alert-fidi')
    ON CONFLICT (tipo) DO UPDATE SET raggruppa=EXCLUDED.raggruppa,
      chiave_metadata=EXCLUDED.chiave_metadata,titolo_gruppo=EXCLUDED.titolo_gruppo,link_gruppo=EXCLUDED.link_gruppo;
    INSERT INTO public.configurazioni(chiave,valore) VALUES ('alert_fidi_notifiche_attive','true');
    v_n := public.invia_notifiche_alert_fidi();
    ASSERT public.invia_notifiche_alert_fidi() = 0, 'Seconda esecuzione non deve duplicare';
    SELECT jsonb_build_object(
      'notifiche_logiche',v_n,
      'righe_raggruppate',(SELECT count(*) FROM public.notifiche WHERE tipo='alert_fido'),
      'destinatari_distinti',(SELECT count(DISTINCT user_id) FROM public.notifiche WHERE tipo='alert_fido'),
      'primi_10_destinatari',(SELECT jsonb_agg(x) FROM (
        SELECT concat_ws(' ',p.nome,p.cognome) AS nome,
          (SELECT string_agg(ur.role::text,', ' ORDER BY ur.role::text) FROM public.user_roles ur
           WHERE ur.user_id=p.id AND ur.role IN ('store_manager','agente')) AS ruolo,
          sum(n.conteggio) AS notifiche
        FROM public.notifiche n JOIN public.profili p ON p.id=n.user_id
        WHERE n.tipo='alert_fido' GROUP BY p.id,p.nome,p.cognome
        ORDER BY notifiche DESC,nome LIMIT 10
      ) x),
      'esempi',(SELECT jsonb_agg(x) FROM (
        SELECT titolo,messaggio FROM public.notifiche WHERE tipo='alert_fido' ORDER BY user_id,chiave_gruppo LIMIT 3
      ) x)
    ) INTO v_report;
    RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='Annulla prova accesa';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN
    -- Variabili conservate, tutte le scritture e le code HTTP annullate.
    NULL;
  END;

  ASSERT NOT EXISTS (
    (SELECT * FROM public.notifiche EXCEPT SELECT * FROM af_test_notifiche)
    UNION ALL (SELECT * FROM af_test_notifiche EXCEPT SELECT * FROM public.notifiche)
  ), 'Notifiche non ripristinate dopo annullamento';
  ASSERT NOT EXISTS (
    (SELECT * FROM public.alert_fidi EXCEPT SELECT * FROM af_test_alert)
    UNION ALL (SELECT * FROM af_test_alert EXCEPT SELECT * FROM public.alert_fidi)
  ), 'Alert non ripristinati dopo annullamento';
  INSERT INTO af_test_report VALUES (v_report || jsonb_build_object('rollback_verificato',true));
END;
$test$;
SELECT dati FROM af_test_report;
ROLLBACK;