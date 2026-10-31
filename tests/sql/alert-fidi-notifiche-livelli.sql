-- Prova delle transizioni su un alert reale con destinatari; nessun COMMIT.
BEGIN;
INSERT INTO public.notifiche_tipi(tipo,raggruppa,chiave_metadata,titolo_gruppo,link_gruppo)
VALUES ('alert_fido',true,'store_id','{gruppo}: {n} alert fidi','/alert-fidi')
ON CONFLICT (tipo) DO UPDATE SET raggruppa=EXCLUDED.raggruppa,chiave_metadata=EXCLUDED.chiave_metadata,
  titolo_gruppo=EXCLUDED.titolo_gruppo,link_gruppo=EXCLUDED.link_gruppo;
INSERT INTO public.configurazioni(chiave,valore) VALUES ('alert_fidi_notifiche_attive','true')
ON CONFLICT (chiave) DO UPDATE SET valore=EXCLUDED.valore;
DO $test$
DECLARE v_id uuid; v_dest integer; v_n integer;
BEGIN
  SELECT a.id INTO v_id FROM public.alert_fidi a JOIN public.clienti c ON c.id=a.cliente_id
  WHERE a.tipo='consumo' AND a.stato='aperto' AND EXISTS (
    SELECT 1 FROM public.profili p JOIN public.user_roles r ON r.user_id=p.id
    WHERE p.attivo AND p.store_id=c.store_id AND r.role='store_manager'
  ) ORDER BY a.id LIMIT 1;
  ASSERT v_id IS NOT NULL, 'Serve un alert consumo reale con destinatari';
  UPDATE public.alert_fidi SET notificato_livello=CASE WHEN tipo='consumo' THEN livello ELSE 1 END
  WHERE stato='aperto';
  SELECT count(*) INTO v_dest FROM (
    SELECT p.id FROM public.alert_fidi a JOIN public.clienti c ON c.id=a.cliente_id
    JOIN public.profili p ON p.store_id=c.store_id AND p.attivo
    JOIN public.user_roles r ON r.user_id=p.id AND r.role='store_manager' WHERE a.id=v_id
    UNION
    SELECT public.utenti_agente_cliente(cliente_id) FROM public.alert_fidi WHERE id=v_id
  ) d;
  UPDATE public.alert_fidi SET livello=0.80,notificato_livello=NULL WHERE id=v_id;
  v_n:=public.invia_notifiche_alert_fidi();
  ASSERT v_n=v_dest, 'Una notifica per destinatario al livello 80%';
  ASSERT (SELECT notificato_livello=0.80 FROM public.alert_fidi WHERE id=v_id), 'Memorizza livello 80%';
  ASSERT public.invia_notifiche_alert_fidi()=0, 'Livello 80% non si ripete';
  UPDATE public.alert_fidi SET livello=0.90 WHERE id=v_id;
  ASSERT public.invia_notifiche_alert_fidi()=v_dest, 'Salita al 90% notifica una volta';
  ASSERT (SELECT notificato_livello=0.90 FROM public.alert_fidi WHERE id=v_id), 'Memorizza livello 90%';
  ASSERT public.invia_notifiche_alert_fidi()=0, 'Livello 90% non si ripete';
  UPDATE public.alert_fidi SET livello=0.80 WHERE id=v_id;
  ASSERT public.invia_notifiche_alert_fidi()=0, 'Discesa non notifica';
  -- Le transizioni degli altri tipi non richiedono dati di richieste nel messaggio.
  UPDATE public.alert_fidi SET stato='chiuso' WHERE stato<>'chiuso' AND id<>v_id;
  UPDATE public.alert_fidi SET tipo='riduzione',notificato_livello=NULL WHERE id=v_id;
  ASSERT public.invia_notifiche_alert_fidi()=v_dest, 'Riduzione aperta una volta';
  ASSERT (SELECT notificato_livello=1 FROM public.alert_fidi WHERE id=v_id), 'Riduzione marcata 1';
  ASSERT public.invia_notifiche_alert_fidi()=0, 'Riduzione non si ripete';
  UPDATE public.alert_fidi SET tipo='extra_non_usato',notificato_livello=NULL WHERE id=v_id;
  ASSERT public.invia_notifiche_alert_fidi()=v_dest, 'Extra aperto una volta';
  ASSERT (SELECT notificato_livello=1 FROM public.alert_fidi WHERE id=v_id), 'Extra marcato 1';
  ASSERT public.invia_notifiche_alert_fidi()=0, 'Extra non si ripete';
  UPDATE public.alert_fidi SET stato='in_osservazione',notificato_livello=NULL WHERE id=v_id;
  ASSERT public.invia_notifiche_alert_fidi()=0, 'In osservazione non notifica';
END;
$test$;
ROLLBACK;