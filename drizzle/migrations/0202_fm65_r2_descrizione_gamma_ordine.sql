DO $migration$
DECLARE definizione text;
BEGIN
  definizione := pg_get_functiondef('public.trasforma_preventivo_in_ordine(uuid,jsonb)'::regprocedure);
  IF strpos(definizione, 'v_src_riga.articolo_id, v_src_riga.descrizione, v_src_riga.um') = 0 THEN
    RAISE EXCEPTION 'Definizione trasformazione non riconosciuta: nessuna modifica applicata';
  END IF;
  definizione := replace(definizione, 'v_src_riga.articolo_id, v_src_riga.descrizione, v_src_riga.um', 'v_src_riga.articolo_id, CASE WHEN v_src_riga.articolo_codice IS NOT NULL THEN (SELECT a.descrizione FROM public.articoli_gamma a WHERE a.codice = v_src_riga.articolo_codice) ELSE v_src_riga.descrizione END, v_src_riga.um');
  EXECUTE definizione;
END;
$migration$;
REVOKE EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid,jsonb) TO authenticated, service_role;