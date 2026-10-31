-- scaduto_da_incassare solo per clienti valutati dalla regola normale (non bloccati, non in legale, non azzerati per scaduto).
CREATE OR REPLACE FUNCTION public.segnalazioni_fido(
  _regola text, _base numeric, _fabbisogno numeric, _ordini numeric, _fido_gamma numeric,
  _scaduto_oltre numeric, _pagato_12m numeric)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  WITH cfg AS (
    SELECT
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_segnalazione_ordini_quota'),',','.')),'')::numeric, 0.5) AS quota,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='alert_fidi_soglia_1'),',','.')),'')::numeric, 0.80) AS soglia,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_scaduto_importo'),',','.')),'')::numeric, 500) AS sc_imp
  ), v AS (
    SELECT COALESCE(_base,0) b, COALESCE(_fabbisogno,0) fab, COALESCE(_ordini,0) ord, COALESCE(_fido_gamma,0) fg,
           COALESCE(_scaduto_oltre,0) so FROM cfg
  )
  SELECT array_remove(ARRAY[
    CASE WHEN _regola='cliente_bloccato' THEN 'bloccato' END,
    CASE WHEN _regola='scaduto_non_incassato' THEN 'scaduto_non_incassato' END,
    CASE WHEN COALESCE(_regola,'') NOT IN ('scaduto_non_incassato','cliente_bloccato','gestione_legale') AND v.so > cfg.sc_imp THEN 'scaduto_da_incassare' END,
    CASE WHEN v.b>0 AND v.fab>v.b THEN 'impegni_sopra_base' END,
    CASE WHEN v.ord>0 AND v.ord > cfg.quota*v.fab THEN 'ordini_prevalenti' END,
    CASE WHEN v.fg>0 AND v.fab/v.fg >= cfg.soglia AND NOT (v.b>0 AND v.fab>v.b) THEN 'uso_pieno' END
  ], NULL)
  FROM v, cfg
$f$;
REVOKE EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric) TO authenticated, service_role;