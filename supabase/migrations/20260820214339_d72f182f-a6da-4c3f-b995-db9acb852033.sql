DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.prossimo_numero_preventivo(integer)',
    'public.anteprima_numero_preventivo(integer)',
    'public.prossimo_numero_ordine(integer)',
    'public.anteprima_numero_ordine(integer)',
    'public.trasforma_preventivo_in_ordine(uuid, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;