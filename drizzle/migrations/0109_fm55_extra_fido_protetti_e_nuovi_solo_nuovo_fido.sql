-- FM55: protezione 30 giorni dell'extra fido teorico approvato (fonte unica) e
-- regola "nuovo_in_attesa" limitata alle richieste approvate di tipo nuovo fido.

CREATE OR REPLACE FUNCTION public.extra_fido_protetti(_cliente_ids uuid[] DEFAULT NULL)
RETURNS TABLE(cliente_id uuid, richiesta_id uuid, importo_approvato numeric, fido_teorico_riferimento numeric, approvata_il timestamptz, protetto_fino_al date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  -- FM55: fonte unica della protezione dell'extra fido teorico approvato.
  -- Gemello TS: fetchExtraFidoProtetti (src/lib/fido-teorico.ts). Usata da aggiorna_alert_fidi.
  -- Invoker: ogni utente vede solo le richieste che la RLS di richieste_fido gli mostra.
  WITH cfg AS (
    SELECT COALESCE((SELECT NULLIF(trim(valore),'')::numeric FROM public.configurazioni WHERE chiave='alert_fidi_extra_giorni'), 30)::int AS gg
  )
  SELECT DISTINCT ON (r.cliente_id)
    r.cliente_id, r.id, r.importo_approvato::numeric, r.fido_teorico_riferimento::numeric,
    COALESCE(r.data_approvazione, r.data_chiusura),
    ((COALESCE(r.data_approvazione, r.data_chiusura) AT TIME ZONE 'Europe/Rome')::date + cfg.gg)
  FROM public.richieste_fido r CROSS JOIN cfg
  WHERE r.stato::text = 'approvata'
    AND r.esito_fido IS DISTINCT FROM 'rifiutata'
    AND r.fido_teorico_riferimento IS NOT NULL AND r.importo_approvato > r.fido_teorico_riferimento
    AND COALESCE(r.data_approvazione, r.data_chiusura) >= now() - make_interval(days => cfg.gg)
    AND (_cliente_ids IS NULL OR r.cliente_id = ANY(_cliente_ids))
  ORDER BY r.cliente_id, COALESCE(r.data_approvazione, r.data_chiusura) DESC
$$;
REVOKE EXECUTE ON FUNCTION public.extra_fido_protetti(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extra_fido_protetti(uuid[]) TO authenticated, service_role;

-- Le due funzioni esistenti vengono ricreate dalla loro definizione attiva sostituendo
-- SOLO i frammenti indicati (ogni sostituzione deve trovare esattamente il testo atteso).
DO $do$
DECLARE d text; o text; n text;
BEGIN
  -- aggiorna_alert_fidi: condizione inline → extra_fido_protetti()
  d := pg_get_functiondef('public.aggiorna_alert_fidi()'::regprocedure);
  o := $t$          AND NOT EXISTS (
            SELECT 1 FROM public.richieste_fido r
            WHERE r.cliente_id = d.cliente_id AND r.stato::text = 'approvata'
              AND r.esito_fido IS DISTINCT FROM 'rifiutata'
              AND r.fido_teorico_riferimento IS NOT NULL AND r.importo_approvato > r.fido_teorico_riferimento
              AND COALESCE(r.data_approvazione, r.data_chiusura) >= v_now - make_interval(days => extra_gg))) AS cond,$t$;
  n := $t$          AND NOT EXISTS (
            SELECT 1 FROM public.extra_fido_protetti() p WHERE p.cliente_id = d.cliente_id)) AS cond,$t$;
  IF (length(d) - length(replace(d, o, ''))) / length(o) <> 1 THEN
    RAISE EXCEPTION 'aggiorna_alert_fidi: frammento atteso non trovato';
  END IF;
  EXECUTE replace(d, o, n);

  -- get_fido_teorico_v2: punto 2b solo con richieste approvate di tipo nuovo fido
  d := pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure);
  o := $t$WHERE rf.cliente_id = c.id AND rf.stato::text = 'approvata'
$t$;
  n := $t$WHERE rf.cliente_id = c.id AND rf.stato::text = 'approvata'
          AND rf.tipo::text IN ('nuovo','nuovo_fido')
$t$;
  IF (length(d) - length(replace(d, o, ''))) / length(o) <> 2 THEN
    RAISE EXCEPTION 'get_fido_teorico_v2: frammenti attesi non trovati';
  END IF;
  EXECUTE replace(d, o, n);
END
$do$;

REVOKE EXECUTE ON FUNCTION public.aggiorna_alert_fidi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aggiorna_alert_fidi() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) TO authenticated, service_role;