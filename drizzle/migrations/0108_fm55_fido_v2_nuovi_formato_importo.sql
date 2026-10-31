-- FM55: formato italiano dell'importo concesso nella spiegazione 'nuovo_in_attesa' (es. "7.500", "1.250,50")
DO $mig$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure);
  IF position($s$replace(to_char(r.base_v, 'FM999,999,990.99'), ',', '.')$s$ IN def) = 0 THEN
    RAISE EXCEPTION 'testo da sostituire non trovato';
  END IF;
  def := replace(def,
    $s$replace(to_char(r.base_v, 'FM999,999,990.99'), ',', '.')$s$,
    $s$translate(rtrim(to_char(r.base_v, 'FM999,999,990.99'), '.'), ',.', '.,')$s$);
  EXECUTE def;
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) TO authenticated, service_role;