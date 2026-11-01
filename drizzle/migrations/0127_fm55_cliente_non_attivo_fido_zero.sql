-- FM55 fetta 6, Andrea 01/11/2026. Cliente NON attivo = fido teorico zero. Nessun ricalcolo.
-- ATTENZIONE: il cutoff e' un anno fisso in configurazioni (cutoff_cliente_attivo_anno). Se a gennaio 2027
-- viene portato a 2027, il giorno stesso tutti i clienti diventano "non attivi" e il fido teorico va a zero
-- per tutti. Non cambiare il cutoff senza decisione di Andrea.

CREATE OR REPLACE FUNCTION public.cliente_attivo_cutoff_anno()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT COALESCE(NULLIF(trim((SELECT valore FROM public.configurazioni WHERE chiave = 'cutoff_cliente_attivo_anno')), '')::int, 2025)
$f$;
REVOKE EXECUTE ON FUNCTION public.cliente_attivo_cutoff_anno() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_attivo_cutoff_anno() TO authenticated, service_role;

-- Gemello SQL di isClienteAttivo (src/hooks/use-config.ts): attivo se doc_da_fatturare > 0
-- oppure ultima fatturazione >= 01/01 dell'anno di cutoff.
CREATE OR REPLACE FUNCTION public.cliente_attivo(_ultima_fatturazione date, _doc_da_fatturare numeric)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT COALESCE(_doc_da_fatturare, 0) > 0
      OR (_ultima_fatturazione IS NOT NULL AND _ultima_fatturazione >= make_date(public.cliente_attivo_cutoff_anno(), 1, 1))
$f$;
REVOKE EXECUTE ON FUNCTION public.cliente_attivo(date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_attivo(date, numeric) TO authenticated, service_role;

DO $migration$
DECLARE d text := pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure);
BEGIN
  IF md5(d) <> '8dba774cd17b96e54688c7777fd1b297' THEN RAISE EXCEPTION 'MD5 inatteso: public.get_fido_teorico_v2(uuid[])'; END IF;
  d := replace(d, $old$      CASE WHEN con_mt AND fp < fa THEN
        LEAST(fa, GREATEST(fp, public.arrotonda_fido_v2(GREATEST(esp_picco, esp + ord) / NULLIF(ms_picco, 0))))
        ELSE fp END AS fp_frenato
    FROM b5_originale
$old$, $new$      -- FM55 fetta 6: cliente NON attivo (public.cliente_attivo, gemello di isClienteAttivo) = fido teorico zero,
      -- dopo il freno; esclusi nuovo_in_attesa e clienti con ordini aperti; solo regola 'calcolo'.
      CASE WHEN na THEN 0::numeric
        WHEN con_mt AND fp < fa THEN
        LEAST(fa, GREATEST(fp, public.arrotonda_fido_v2(GREATEST(esp_picco, esp + ord) / NULLIF(ms_picco, 0))))
        ELSE fp END AS fp_frenato
    FROM (SELECT b5_originale.*,
            (reg = 'calcolo' AND prof <> 'nuovo_in_attesa' AND ord <= 0
              AND NOT public.cliente_attivo(ult_gamma, ddt)) AS na
          FROM b5_originale) b5_originale
$new$);
  d := replace(d, $old$    CASE r.reg
      WHEN 'sede_esclusa' THEN 'Sede esclusa$old$, $new$    CASE WHEN r.na THEN 'Cliente non attivo: nessuna fattura dal 01/01/' || public.cliente_attivo_cutoff_anno() || ', fido teorico zero.'
    ELSE CASE r.reg
      WHEN 'sede_esclusa' THEN 'Sede esclusa$new$);
  d := replace(d, $old$          ) END
    END
    || CASE WHEN r.ord > 0 THEN$old$, $new$          ) END
    END END
    || CASE WHEN r.ord > 0 THEN$new$);
  IF md5(d) <> '34c0a4c4d66108610579505be0b1a21a' THEN RAISE EXCEPTION 'Replace incompleto: public.get_fido_teorico_v2(uuid[])'; END IF;
  EXECUTE d; -- solo CREATE OR REPLACE, firma invariata
END
$migration$;
REVOKE EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) TO authenticated, service_role;