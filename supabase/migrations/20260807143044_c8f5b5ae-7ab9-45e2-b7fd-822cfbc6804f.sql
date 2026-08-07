DO $mig$
DECLARE def text; newdef text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE proname = 'get_fido_teorico' AND pronamespace = 'public'::regnamespace;

  newdef := replace(def,
    'THEN ceil(t.esp / 500.0) * 500',
    'THEN CASE WHEN t.esp <= 5000 THEN ceil(t.esp / 500.0) * 500 ELSE ceil(t.esp / 5000.0) * 5000 END');

  IF newdef = def THEN
    RAISE EXCEPTION 'pattern del pavimento non trovato';
  END IF;

  EXECUTE newdef;
END
$mig$;