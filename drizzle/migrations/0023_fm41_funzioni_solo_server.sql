DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN (
         'aggiorna_stato_messaggio_whatsapp','registra_stop_whatsapp','registra_adesione_evento_whatsapp',
         'registra_consenso_whatsapp','registra_opt_out_marketing','get_destinatario_recesso',
         'revoca_consensi_batch','registra_consenso','upsert_iscritto_da_contatto','trova_corrispondenze_soggetto',
         'auto_collega_iscritto_whatsapp','classifica_iscritto_whatsapp','risolvi_pubblico_segmento',
         'get_destinatari_whatsapp_segmento','conta_contattabili_canale','ricalcola_in_gestione_legale')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.f);
    n := n + 1;
  END LOOP;
  IF n < 16 THEN RAISE EXCEPTION 'Attese almeno 16 funzioni, trovate %', n; END IF;
END $$;
