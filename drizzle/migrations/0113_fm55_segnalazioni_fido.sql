ALTER TABLE public.fido_teorico_cliente
  ADD COLUMN IF NOT EXISTS segnalazioni text[] NOT NULL DEFAULT '{}';

-- FM55 fetta 2: fonte unica SQL delle segnalazioni del fido (ordine di gravità).
CREATE OR REPLACE FUNCTION public.segnalazioni_fido(
  _regola text, _base numeric, _fabbisogno numeric, _ordini numeric, _fido_gamma numeric)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  WITH cfg AS (
    SELECT
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_segnalazione_ordini_quota'),',','.')),'')::numeric, 0.5) AS quota,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='alert_fidi_soglia_1'),',','.')),'')::numeric, 0.80) AS soglia
  ), v AS (
    SELECT COALESCE(_base,0) b, COALESCE(_fabbisogno,0) fab, COALESCE(_ordini,0) ord, COALESCE(_fido_gamma,0) fg FROM cfg
  )
  SELECT array_remove(ARRAY[
    CASE WHEN _regola='cliente_bloccato' THEN 'bloccato' END,
    CASE WHEN _regola='scaduto_non_incassato' THEN 'scaduto_non_incassato' END,
    CASE WHEN v.b>0 AND v.fab>v.b THEN 'impegni_sopra_base' END,
    CASE WHEN v.ord>0 AND v.ord > cfg.quota*v.fab THEN 'ordini_prevalenti' END,
    CASE WHEN v.fg>0 AND v.fab/v.fg >= cfg.soglia AND NOT (v.b>0 AND v.fab>v.b) THEN 'uso_pieno' END
  ], NULL)
  FROM v, cfg
$f$;
REVOKE EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric) TO authenticated, service_role;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.ricalcola_fido_teorico_blocco(uuid,integer)'::regprocedure);
  IF position('segnalazioni_fido' in d) > 0 THEN RAISE EXCEPTION 'blocco: già aggiornata'; END IF;
  IF (length(d) - length(replace(d, $t$ WHERE f.cliente_id=u.id;$t$, ''))) / length($t$ WHERE f.cliente_id=u.id;$t$) <> 1 THEN RAISE EXCEPTION 'blocco: frammento'; END IF;
  d := replace(d, $t$ WHERE f.cliente_id=u.id;$t$, $t$ WHERE f.cliente_id=u.id;
 -- FM55: segnalazioni (fonte unica segnalazioni_fido) sulle colonne appena pubblicate.
 UPDATE public.fido_teorico_cliente f SET
 segnalazioni=public.segnalazioni_fido(f.regola_applicata,f.base,f.fabbisogno,f.ordini_aperti,f.fido_attuale)
 WHERE f.cliente_id=ANY(v_ids);$t$);
  EXECUTE d;

  d := pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure);
  IF (length(d) - length(replace(d, $t$::int AS sc_gg_cfg,$t$, ''))) / length($t$::int AS sc_gg_cfg,$t$) <> 1 THEN RAISE EXCEPTION 'v2: sc_gg_cfg'; END IF;
  d := replace(d, $t$::int AS sc_gg_cfg,$t$, $t$::int AS sc_gg_cfg,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave = 'fido_v2_scaduto_giorni_riba'), ',', '.')), '')::numeric, 5)::int AS sc_gg_riba,$t$);
  IF (length(d) - length(replace(d, $t$' € scaduti da oltre ' || r.sc_gg_cfg || ' giorni (fino a '$t$, ''))) / length($t$' € scaduti da oltre ' || r.sc_gg_cfg || ' giorni (fino a '$t$) <> 1 THEN RAISE EXCEPTION 'v2: testo'; END IF;
  d := replace(d, $t$' € scaduti da oltre ' || r.sc_gg_cfg || ' giorni (fino a '$t$,
    $t$' € scaduti oltre le soglie (' || r.sc_gg_cfg || ' giorni; RiBa ' || r.sc_gg_riba || ' giorni) (fino a '$t$);
  EXECUTE d;
END
$do$;