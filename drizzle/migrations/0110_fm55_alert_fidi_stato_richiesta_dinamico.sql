-- FM55: stato richiesta degli Alert fidi dinamico. Collega l'ultima richiesta attiva del cliente
-- (anche precedente all'apertura), chiude solo a richiesta processata, riapre su rifiuto/annullamento.
-- Ricrea aggiorna_alert_fidi dalla definizione attiva sostituendo SOLO tre frammenti.
DO $do$
DECLARE d text;
  oa text := $t$  -- d) richiesta collegata decisa (approvata/rifiutata) o annullata → chiuso
  UPDATE public.alert_fidi a SET stato = 'chiuso', chiuso_il = v_now,
    motivo_chiusura = CASE WHEN r.stato::text = 'annullata' THEN 'richiesta_annullata' ELSE 'richiesta_decisa' END,
    aggiornato_il = v_now
  FROM public.richieste_fido r
  WHERE a.stato = 'richiesta_inserita' AND r.id = a.richiesta_id
    AND r.stato::text IN ('approvata','rifiutata','annullata');$t$; na text := $t$  -- d) richiesta collegata: processata (inserita in Gamma) -> chiuso;
  --    rifiutata/annullata o non piu' attiva -> torna aperto (riduzione non matura: in osservazione).
  UPDATE public.alert_fidi a SET stato = 'chiuso', chiuso_il = v_now,
    motivo_chiusura = CASE WHEN EXISTS (SELECT 1 FROM _af_dati d WHERE d.cliente_id = a.cliente_id
                                          AND d.fido_gamma IS DISTINCT FROM a.fido_gamma_apertura)
                           THEN 'fido_cambiato' ELSE 'richiesta_processata' END,
    aggiornato_il = v_now
  FROM public.richieste_fido r
  WHERE a.stato = 'richiesta_inserita' AND r.id = a.richiesta_id
    AND r.stato::text = 'approvata' AND r.stato_export = 'processata';

  UPDATE public.alert_fidi a SET
    stato = CASE WHEN a.tipo = 'riduzione' AND a.aperto_il > v_now - make_interval(days => rid_gg)
                 THEN 'in_osservazione' ELSE 'aperto' END,
    richiesta_id = NULL, aggiornato_il = v_now
  WHERE a.stato = 'richiesta_inserita' AND a.tipo <> 'extra_non_usato'
    AND NOT EXISTS (SELECT 1 FROM public.richieste_fido r WHERE r.id = a.richiesta_id
      AND public.richiesta_fido_attiva(r.stato::text, r.stato_export));$t$;
  ob text := $t$  -- ===================== d) richiesta attiva inserita dopo l'apertura =====================
  UPDATE public.alert_fidi a SET stato = 'richiesta_inserita', richiesta_id = (
    SELECT r.id FROM public.richieste_fido r
    WHERE r.cliente_id = a.cliente_id AND r.created_at > a.aperto_il
      AND public.richiesta_fido_attiva(r.stato::text, r.stato_export)
    ORDER BY r.created_at DESC LIMIT 1)
  WHERE a.stato IN ('in_osservazione','aperto','confermato')
    AND EXISTS (SELECT 1 FROM public.richieste_fido r
      WHERE r.cliente_id = a.cliente_id AND r.created_at > a.aperto_il
        AND public.richiesta_fido_attiva(r.stato::text, r.stato_export));$t$; nb text := $t$  -- ===================== d) richiesta attiva del cliente (anche precedente all'apertura) =====================
  -- Esclusi gli extra non usati: il loro richiesta_id e' la richiesta approvata che li ha generati.
  UPDATE public.alert_fidi a SET stato = 'richiesta_inserita', richiesta_id = (
    SELECT r.id FROM public.richieste_fido r
    WHERE r.cliente_id = a.cliente_id
      AND public.richiesta_fido_attiva(r.stato::text, r.stato_export)
    ORDER BY r.created_at DESC LIMIT 1), aggiornato_il = v_now
  WHERE a.stato IN ('in_osservazione','aperto','confermato') AND a.tipo <> 'extra_non_usato'
    AND EXISTS (SELECT 1 FROM public.richieste_fido r
      WHERE r.cliente_id = a.cliente_id
        AND public.richiesta_fido_attiva(r.stato::text, r.stato_export));$t$;
  oc text := $t$  -- una richiesta approvata non ancora processata appena collegata è già decisa
  UPDATE public.alert_fidi a SET stato = 'chiuso', chiuso_il = v_now, motivo_chiusura = 'richiesta_decisa', aggiornato_il = v_now
  FROM public.richieste_fido r
  WHERE a.stato = 'richiesta_inserita' AND r.id = a.richiesta_id AND r.stato::text IN ('approvata','rifiutata');
$t$;
BEGIN
  d := pg_get_functiondef('public.aggiorna_alert_fidi()'::regprocedure);
  IF (length(d) - length(replace(d, oa, ''))) / length(oa) <> 1 THEN RAISE EXCEPTION 'aggiorna_alert_fidi: frammento d1 non trovato'; END IF;
  IF (length(d) - length(replace(d, ob, ''))) / length(ob) <> 1 THEN RAISE EXCEPTION 'aggiorna_alert_fidi: frammento d2 non trovato'; END IF;
  IF (length(d) - length(replace(d, oc, ''))) / length(oc) <> 1 THEN RAISE EXCEPTION 'aggiorna_alert_fidi: frammento d3 non trovato'; END IF;
  d := replace(replace(replace(d, oa, na), ob, nb), oc, '');
  EXECUTE d;
END
$do$;

REVOKE EXECUTE ON FUNCTION public.aggiorna_alert_fidi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aggiorna_alert_fidi() TO authenticated, service_role;