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

  -- Subtransazione: anche la marcatura con invii accesi viene annullata.
  BEGIN
    INSERT INTO public.configurazioni(chiave,valore) VALUES ('alert_fidi_notifiche_attive','true');
    v_n := public.invia_notifiche_alert_fidi();
    ASSERT public.invia_notifiche_alert_fidi() = 0, 'Seconda esecuzione non deve duplicare';
    SELECT jsonb_build_object(
      'alert_marcati',v_n,
      'nuove_notifiche',(SELECT count(*) FROM (
        SELECT * FROM public.notifiche EXCEPT SELECT * FROM af_test_notifiche
      ) x)
    ) INTO v_report;
    ASSERT NOT EXISTS (SELECT 1 FROM (SELECT * FROM public.notifiche EXCEPT SELECT * FROM af_test_notifiche) x),
      'La funzione non deve più creare notifiche immediate';
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