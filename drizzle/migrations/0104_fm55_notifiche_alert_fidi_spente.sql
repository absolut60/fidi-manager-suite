CREATE OR REPLACE FUNCTION public.invia_notifiche_alert_fidi()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  a record;
  v_dest uuid;
  v_messaggio text;
  v_n integer := 0;
  v_destinatari integer;
  v_now timestamptz := now();
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND NOT public.has_role(auth.uid(), 'amministratore')
     AND NOT public.has_role(auth.uid(), 'direzione') THEN
    RAISE EXCEPTION 'Operazione non consentita';
  END IF;

  -- Solo il valore esatto 'true' abilita gli invii; nessuna scrittura da spento.
  IF NOT EXISTS (SELECT 1 FROM public.configurazioni
                 WHERE chiave = 'alert_fidi_notifiche_attive' AND valore = 'true') THEN
    RETURN 0;
  END IF;

  -- Il catalogo è un dato inserito separatamente dal proprietario.
  -- Non usare il raggruppamento predefinito per tipo se manca la regola per negozio.
  IF NOT EXISTS (SELECT 1 FROM public.notifiche_tipi
                 WHERE tipo = 'alert_fido' AND raggruppa = true
                   AND chiave_metadata = 'store_id'
                   AND titolo_gruppo = '{gruppo}: {n} alert fidi'
                   AND link_gruppo = '/alert-fidi') THEN
    RAISE EXCEPTION 'Configurare il tipo notifica alert_fido prima di attivare gli invii';
  END IF;

  FOR a IN
    SELECT af.*, c.ragione_sociale, c.store_id, s.nome AS negozio,
           r.importo_approvato, r.fido_teorico_riferimento,
           COALESCE(af.riproponi_dal::timestamptz, r.data_approvazione, r.data_chiusura, r.created_at, af.aperto_il) AS extra_dal
    FROM public.alert_fidi af
    JOIN public.clienti c ON c.id = af.cliente_id
    LEFT JOIN public.stores s ON s.id = c.store_id
    LEFT JOIN public.richieste_fido r ON r.id = af.richiesta_id
    WHERE af.stato = 'aperto'
      AND ((af.tipo = 'consumo' AND af.livello IS NOT NULL
            AND (af.notificato_livello IS NULL OR af.livello > af.notificato_livello))
        OR (af.tipo IN ('riduzione', 'extra_non_usato') AND af.notificato_livello IS NULL))
    ORDER BY af.id
    FOR UPDATE OF af
  LOOP
    -- Formato italiano indipendente dal locale della sessione SQL.
    IF a.tipo = 'consumo' THEN
      v_messaggio := format('Fido usato al %s%%: %s € su %s €. Fido proposto %s €.',
        round(COALESCE(a.consumo, 0) * 100)::text,
        translate(to_char(round(COALESCE(a.esposizione, 0) + COALESCE(a.ordini_aperti, 0)), 'FM999,999,999,999,999,990'), ',', '.'),
        translate(to_char(round(COALESCE(a.fido_gamma, 0)), 'FM999,999,999,999,999,990'), ',', '.'),
        translate(to_char(round(COALESCE(a.fido_proposto, 0)), 'FM999,999,999,999,999,990'), ',', '.'));
    ELSIF a.tipo = 'riduzione' THEN
      v_messaggio := format('Fido più alto del necessario da %s giorni: %s € in Gamma, proposti %s €.',
        GREATEST(0, floor(extract(epoch FROM v_now - a.aperto_il) / 86400))::text,
        translate(to_char(round(COALESCE(a.fido_gamma, 0)), 'FM999,999,999,999,999,990'), ',', '.'),
        translate(to_char(round(COALESCE(a.fido_proposto, 0)), 'FM999,999,999,999,999,990'), ',', '.'));
    ELSE
      v_messaggio := format('Extra fido teorico non usato da %s giorni: approvati %s €, teorico %s €.',
        GREATEST(0, floor(extract(epoch FROM v_now - a.extra_dal) / 86400))::text,
        translate(to_char(round(COALESCE(a.importo_approvato, 0)), 'FM999,999,999,999,999,990'), ',', '.'),
        translate(to_char(round(COALESCE(a.fido_teorico_riferimento, 0)), 'FM999,999,999,999,999,990'), ',', '.'));
    END IF;

    v_destinatari := 0;
    FOR v_dest IN
      SELECT DISTINCT d.user_id
      FROM (
        SELECT p.id AS user_id
        FROM public.profili p
        JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'store_manager'
        WHERE p.attivo IS TRUE AND p.store_id = a.store_id
        UNION
        SELECT u.id FROM public.utenti_agente_cliente(a.cliente_id) AS u(id)
      ) d
      ORDER BY d.user_id
    LOOP
      INSERT INTO public.notifiche(user_id, tipo, titolo, messaggio, link, metadata)
      VALUES (v_dest, 'alert_fido', a.ragione_sociale, v_messaggio, '/alert-fidi',
        jsonb_build_object('cliente_id', a.cliente_id, 'store_id', a.store_id,
                           'alert_id', a.id, 'gruppo_etichetta', COALESCE(a.negozio, '')));
      -- Il trigger può annullare INSERT dopo aver aggiornato un gruppo: contare
      -- gli avvisi logici, non le righe restituite o ROW_COUNT.
      v_n := v_n + 1;
      v_destinatari := v_destinatari + 1;
    END LOOP;

    -- Senza destinatari mantenere l'alert da notificare.
    IF v_destinatari > 0 THEN
      UPDATE public.alert_fidi
      SET notificato_livello = CASE WHEN a.tipo = 'consumo' THEN a.livello ELSE 1 END,
          notificato_il = v_now
      WHERE id = a.id;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;
COMMENT ON FUNCTION public.invia_notifiche_alert_fidi() IS
'FM55: notifiche logiche Alert fidi, spente salvo configurazione esattamente true; destinatari pertinenti, raggruppamento e push esistenti. Ritorna avvisi logici, non righe fisiche.';
REVOKE EXECUTE ON FUNCTION public.invia_notifiche_alert_fidi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invia_notifiche_alert_fidi() TO authenticated, service_role;