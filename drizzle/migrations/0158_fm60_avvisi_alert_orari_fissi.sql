-- FM60: invia_notifiche_alert_fidi marca soltanto gli alert eleggibili.
-- Le notifiche in app e le email sono create dal job Inngest a orari fissi,
-- insieme alle variazioni blocco/legale dello stesso negozio.
DO $guard$
DECLARE v text;
BEGIN
  SELECT md5(pg_get_functiondef('public.invia_notifiche_alert_fidi()'::regprocedure)) INTO v;
  IF v IS DISTINCT FROM '7e9d2fcd74c74324bc3c77db9bd7e5ce' THEN
    RAISE EXCEPTION 'invia_notifiche_alert_fidi cambiata (md5 %): aggiornare la migrazione', v;
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.invia_notifiche_alert_fidi()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a record;
  v_n integer := 0;
  v_now timestamptz := now();
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND NOT public.has_role(auth.uid(), 'amministratore')
     AND NOT public.has_role(auth.uid(), 'direzione') THEN
    RAISE EXCEPTION 'Operazione non consentita';
  END IF;

  -- Solo il valore esatto 'true' abilita la marcatura; nessuna scrittura da spento.
  IF NOT EXISTS (SELECT 1 FROM public.configurazioni
                 WHERE chiave = 'alert_fidi_notifiche_attive' AND valore = 'true') THEN
    RETURN 0;
  END IF;

  FOR a IN
    SELECT af.id, af.tipo, af.livello
    FROM public.alert_fidi af
    JOIN public.clienti c ON c.id = af.cliente_id
    WHERE af.stato = 'aperto'
      AND ((af.tipo = 'consumo' AND af.livello IS NOT NULL
            AND (af.notificato_livello IS NULL OR af.livello > af.notificato_livello))
        OR (af.tipo IN ('riduzione', 'extra_non_usato') AND af.notificato_livello IS NULL))
      -- Già decisi: non marcati, così ripartono quando la protezione scade o decade.
      AND NOT public.alert_fido_gia_deciso(af.cliente_id)
    ORDER BY af.id
    FOR UPDATE OF af
  LOOP
    UPDATE public.alert_fidi
    SET notificato_livello = CASE WHEN a.tipo = 'consumo' THEN a.livello ELSE 1 END,
        notificato_il = v_now
    WHERE id = a.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.invia_notifiche_alert_fidi() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invia_notifiche_alert_fidi() TO service_role;
