-- Fotografia: si ripopola al prossimo import.
DELETE FROM public.articoli_gamma_fornitori WHERE importazione_id IS NOT NULL OR importazione_id IS NULL;
UPDATE public.articoli_gamma_fornitori SET codice_articolo_fornitore = '' WHERE codice_articolo_fornitore IS NULL;
ALTER TABLE public.articoli_gamma_fornitori ALTER COLUMN codice_articolo_fornitore SET DEFAULT '';
ALTER TABLE public.articoli_gamma_fornitori ALTER COLUMN codice_articolo_fornitore SET NOT NULL;
ALTER TABLE public.articoli_gamma_fornitori DROP CONSTRAINT articoli_gamma_fornitori_pkey;
ALTER TABLE public.articoli_gamma_fornitori ADD PRIMARY KEY (articolo_codice, fornitore_codice, codice_articolo_fornitore);

CREATE OR REPLACE FUNCTION public.import_articoli_fornitori_gamma_lotto(_righe jsonb, _importazione uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ins integer := 0; v_upd integer := 0; v_nc integer := 0; v_nf integer := 0;
BEGIN
  IF _importazione IS NULL THEN RAISE EXCEPTION 'Importazione mancante'; END IF;
  CREATE TEMP TABLE _af ON COMMIT DROP AS
  SELECT DISTINCT ON (btrim(articolo_codice), fornitore_codice, COALESCE(btrim(codice_articolo_fornitore), ''))
    btrim(articolo_codice) AS articolo_codice, fornitore_codice, COALESCE(preferenziale, false) AS preferenziale,
    COALESCE(btrim(codice_articolo_fornitore), '') AS codice_articolo_fornitore
  FROM jsonb_to_recordset(_righe) AS r(articolo_codice text, fornitore_codice integer, preferenziale boolean, codice_articolo_fornitore text)
  WHERE articolo_codice IS NOT NULL AND btrim(articolo_codice) <> '' AND fornitore_codice IS NOT NULL
  ORDER BY btrim(articolo_codice), fornitore_codice, COALESCE(btrim(codice_articolo_fornitore), ''), COALESCE(preferenziale, false) DESC;

  SELECT count(*) INTO v_nc FROM _af s WHERE NOT EXISTS (SELECT 1 FROM public.articoli_gamma a WHERE a.codice = s.articolo_codice);

  WITH up AS (
    INSERT INTO public.articoli_gamma_fornitori AS t (articolo_codice, fornitore_codice, fornitore_id, preferenziale, codice_articolo_fornitore, importazione_id)
    SELECT s.articolo_codice, s.fornitore_codice, f.id, s.preferenziale, s.codice_articolo_fornitore, _importazione
    FROM _af s LEFT JOIN public.fornitori f ON f.codice_gestionale = s.fornitore_codice
    ON CONFLICT (articolo_codice, fornitore_codice, codice_articolo_fornitore) DO UPDATE SET fornitore_id = EXCLUDED.fornitore_id,
      preferenziale = EXCLUDED.preferenziale, importazione_id = EXCLUDED.importazione_id
    RETURNING (xmax = 0) AS inserito, fornitore_id
  )
  SELECT count(*) FILTER (WHERE inserito), count(*) FILTER (WHERE NOT inserito), count(*) FILTER (WHERE fornitore_id IS NULL)
  INTO v_ins, v_upd, v_nf FROM up;

  RETURN jsonb_build_object('inseriti', v_ins, 'aggiornati', v_upd, 'non_in_catalogo', v_nc, 'fornitore_sconosciuto', v_nf);
END;
$$;

CREATE OR REPLACE FUNCTION public.disattiva_depositi_gamma_assenti(_codici text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer;
BEGIN
  IF _codici IS NULL OR cardinality(_codici) = 0 THEN
    RAISE EXCEPTION 'Elenco codici vuoto: disattivazione annullata';
  END IF;
  UPDATE public.depositi SET attivo = false
  WHERE attivo = true AND NOT (codice = ANY (_codici));
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_articoli_fornitori_gamma_lotto(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_articoli_fornitori_gamma_lotto(jsonb, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.disattiva_depositi_gamma_assenti(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disattiva_depositi_gamma_assenti(text[]) TO service_role;
