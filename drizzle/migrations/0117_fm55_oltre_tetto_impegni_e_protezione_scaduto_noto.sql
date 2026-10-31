ALTER TABLE public.richieste_fido ADD COLUMN IF NOT EXISTS scaduto_al_momento numeric;
COMMENT ON COLUMN public.richieste_fido.scaduto_al_momento IS 'FM55: fido_teorico_cliente.scaduto_oltre del cliente alla creazione della richiesta (NULL per le richieste precedenti).';

CREATE OR REPLACE FUNCTION public.richieste_fido_scaduto_al_momento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- FM55: punto unico per tutte le vie di inserimento (singola, massiva, da alert).
  NEW.scaduto_al_momento := COALESCE(
    (SELECT f.scaduto_oltre FROM public.fido_teorico_cliente f WHERE f.cliente_id = NEW.cliente_id), 0);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.richieste_fido_scaduto_al_momento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_richieste_fido_scaduto_al_momento ON public.richieste_fido;
CREATE TRIGGER trg_richieste_fido_scaduto_al_momento BEFORE INSERT ON public.richieste_fido
  FOR EACH ROW EXECUTE FUNCTION public.richieste_fido_scaduto_al_momento();

DROP FUNCTION IF EXISTS public.extra_fido_protetti(uuid[]);
CREATE FUNCTION public.extra_fido_protetti(_cliente_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(cliente_id uuid, richiesta_id uuid, importo_approvato numeric, fido_teorico_riferimento numeric,
   approvata_il timestamp with time zone, protetto_fino_al date,
   scaduto_al_momento numeric, scaduto_attuale numeric, protezione_valida boolean)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  -- FM55: fonte unica della protezione dell'extra fido teorico approvato (regola di validità inclusa).
  -- Gemello TS: fetchExtraFidoProtetti/riferimentoRichiesta (src/lib/fido-teorico.ts). Usata da aggiorna_alert_fidi.
  -- Con regola 'scaduto_non_incassato' la protezione vale solo se lo scaduto era già noto alla decisione:
  -- scaduto_al_momento NULL (richieste precedenti) o scaduto attuale <= scaduto_al_momento + fido_v2_scaduto_importo.
  WITH cfg AS (
    SELECT COALESCE((SELECT NULLIF(trim(valore),'')::numeric FROM public.configurazioni WHERE chiave='alert_fidi_extra_giorni'), 30)::int AS gg,
           COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_scaduto_importo'),',','.')),'')::numeric, 500) AS sc_imp
  ), p AS (
    SELECT DISTINCT ON (r.cliente_id)
      r.cliente_id, r.id, r.importo_approvato::numeric AS imp, r.fido_teorico_riferimento::numeric AS rif,
      COALESCE(r.data_approvazione, r.data_chiusura) AS app,
      ((COALESCE(r.data_approvazione, r.data_chiusura) AT TIME ZONE 'Europe/Rome')::date + cfg.gg) AS fino,
      r.scaduto_al_momento AS sam
    FROM public.richieste_fido r CROSS JOIN cfg
    WHERE r.stato::text = 'approvata'
      AND r.esito_fido IS DISTINCT FROM 'rifiutata'
      AND r.fido_teorico_riferimento IS NOT NULL AND r.importo_approvato > r.fido_teorico_riferimento
      AND COALESCE(r.data_approvazione, r.data_chiusura) >= now() - make_interval(days => cfg.gg)
      AND (_cliente_ids IS NULL OR r.cliente_id = ANY(_cliente_ids))
    ORDER BY r.cliente_id, COALESCE(r.data_approvazione, r.data_chiusura) DESC
  )
  SELECT p.cliente_id, p.id, p.imp, p.rif, p.app, p.fino, p.sam, COALESCE(f.scaduto_oltre, 0),
    (f.regola_applicata IS DISTINCT FROM 'scaduto_non_incassato'
      OR p.sam IS NULL
      OR COALESCE(f.scaduto_oltre, 0) <= p.sam + cfg.sc_imp)
  FROM p CROSS JOIN cfg LEFT JOIN public.fido_teorico_cliente f ON f.cliente_id = p.cliente_id
$function$;
REVOKE EXECUTE ON FUNCTION public.extra_fido_protetti(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extra_fido_protetti(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.segnalazioni_fido(_regola text, _base numeric, _fabbisogno numeric, _ordini numeric, _fido_gamma numeric, _scaduto_oltre numeric, _pagato_12m numeric, _ordini_fuori numeric, _valore_senza_tetto numeric, _tetto numeric)
 RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- FM55 3B: 'oltre_tetto' confronta il tetto con gli impegni interi (fabbisogno = esposizione + ordini aperti).
  WITH cfg AS (
    SELECT
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='alert_fidi_soglia_1'),',','.')),'')::numeric, 0.80) AS soglia,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_scaduto_importo'),',','.')),'')::numeric, 500) AS sc_imp
  ), v AS (
    SELECT COALESCE(_base,0) b, COALESCE(_fabbisogno,0) fab, COALESCE(_fido_gamma,0) fg,
           COALESCE(_scaduto_oltre,0) so, COALESCE(_ordini_fuori,0) ofu FROM cfg
  )
  SELECT array_remove(ARRAY[
    CASE WHEN _regola='cliente_bloccato' THEN 'bloccato' END,
    CASE WHEN _regola='scaduto_non_incassato' THEN 'scaduto_non_incassato' END,
    CASE WHEN COALESCE(_regola,'') NOT IN ('scaduto_non_incassato','cliente_bloccato','gestione_legale') AND v.so > cfg.sc_imp THEN 'scaduto_da_incassare' END,
    CASE WHEN v.b>0 AND v.fab>v.b THEN 'impegni_sopra_base' END,
    CASE WHEN v.ofu > 0 THEN 'ordine_fuori_giro' END,
    CASE WHEN _tetto IS NOT NULL AND v.fab > _tetto THEN 'oltre_tetto' END,
    CASE WHEN v.fg>0 AND v.fab/v.fg >= cfg.soglia AND NOT (v.b>0 AND v.fab>v.b) THEN 'uso_pieno' END
  ], NULL)
  FROM v, cfg
$function$;
REVOKE EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) TO authenticated, service_role;