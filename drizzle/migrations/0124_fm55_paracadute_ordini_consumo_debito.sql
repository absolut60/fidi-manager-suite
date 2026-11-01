-- FM55 fetta 4, Andrea 01/11/2026. Paracadute ordini sulle riduzioni; consumo solo sul debito. Nessun ricalcolo.
DO $migration$
DECLARE d text := pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure);
BEGIN
  IF md5(d) <> '248ecf914f845cb16fea74109980f22e' THEN RAISE EXCEPTION 'MD5 inatteso: public.get_fido_teorico_v2(uuid[])'; END IF;
  d := replace(d, $old$        LEAST(fa, GREATEST(fp, public.arrotonda_fido_v2(esp_picco / NULLIF(ms_picco, 0))))
$old$, $new$        LEAST(fa, GREATEST(fp, public.arrotonda_fido_v2(GREATEST(esp_picco, esp + ord) / NULLIF(ms_picco, 0))))
$new$);
  d := replace(d, $old$    CASE WHEN r.fa > 0 THEN round((r.esp + r.ord) / r.fa, 4) END,
$old$, $new$    CASE WHEN r.fa > 0 THEN round(r.esp / r.fa, 4) END,
$new$);
  d := replace(d, $old$    || CASE WHEN r.fp_frenato > r.fp THEN ' Negli ultimi 30 giorni è arrivato a doverci '
$old$, $new$    || CASE WHEN r.fp_frenato > r.fp AND r.esp + r.ord > r.esp_picco THEN ' Ha ordini aperti per '
         || replace(to_char(round(r.ord), 'FM999,999,999'), ',', '.')
         || ' €: per consegnarli senza bloccarlo il fido non scende sotto '
         || replace(to_char(r.fp_frenato, 'FM999,999,999'), ',', '.') || ' €.'
         WHEN r.fp_frenato > r.fp THEN ' Negli ultimi 30 giorni è arrivato a doverci '
$new$);
  IF md5(d) <> '8dba774cd17b96e54688c7777fd1b297' THEN RAISE EXCEPTION 'Replace incompleto: public.get_fido_teorico_v2(uuid[])'; END IF;
  EXECUTE d; -- solo CREATE OR REPLACE
END
$migration$;
REVOKE EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) TO authenticated, service_role;

DO $migration$
DECLARE d text := pg_get_functiondef('public.aggiorna_alert_fidi()'::regprocedure);
BEGIN
  IF md5(d) <> 'e038ef1707f4243265f94a1bff5b8e62' THEN RAISE EXCEPTION 'MD5 inatteso: public.aggiorna_alert_fidi()'; END IF;
  d := replace(d, $old$              THEN (COALESCE(v.esposizione,0) + COALESCE(v.ordini_aperti,0)) / c.fido_gestionale END AS consumo,
$old$, $new$              THEN COALESCE(v.esposizione,0) / c.fido_gestionale END AS consumo, -- FM55: solo debito, ordini esclusi
$new$);
  IF md5(d) <> 'd6685a6e4f9c9160c691b79c69f79b27' THEN RAISE EXCEPTION 'Replace incompleto: public.aggiorna_alert_fidi()'; END IF;
  EXECUTE d; -- solo CREATE OR REPLACE
END
$migration$;
REVOKE EXECUTE ON FUNCTION public.aggiorna_alert_fidi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aggiorna_alert_fidi() TO authenticated, service_role;