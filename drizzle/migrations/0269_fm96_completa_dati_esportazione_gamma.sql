CREATE OR REPLACE FUNCTION public.completa_dati_esportazione_gamma(_ordine_id uuid, _listino smallint, _macrocategoria text, _categoria text, _codice_sdi text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ordine public.preventivi%ROWTYPE;
BEGIN
  IF NOT COALESCE(public.auth_puo_esportare_gamma(), false) THEN
    RAISE EXCEPTION 'Esportazione Gamma non autorizzata' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(public.auth_vede_preventivo_id(_ordine_id), false) THEN
    RAISE EXCEPTION 'Ordine non visibile' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ordine FROM public.preventivi WHERE id = _ordine_id FOR UPDATE;
  IF NOT FOUND OR v_ordine.tipo <> 'ordine' OR v_ordine.lead_id IS NULL THEN
    RAISE EXCEPTION 'Sono ammessi solo ordini a lead';
  END IF;
  IF v_ordine.esportato_gamma_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ordine già esportato in Gamma: riaprilo per modificarlo';
  END IF;
  IF _codice_sdi IS NOT NULL AND (_codice_sdi !~ '^[A-Z0-9]{0,7}$') THEN
    RAISE EXCEPTION 'Codice SDI non valido: usa al massimo 7 caratteri maiuscoli, senza spazi';
  END IF;
  UPDATE public.preventivi SET listino_rif = COALESCE(_listino, listino_rif),
    macrocategoria_rif = COALESCE(_macrocategoria, macrocategoria_rif),
    categoria_rif = COALESCE(_categoria, categoria_rif) WHERE id = _ordine_id;
  IF _codice_sdi IS NOT NULL THEN
    UPDATE public.lead SET codice_sdi = _codice_sdi WHERE id = v_ordine.lead_id;
  END IF;
END;
$$;
COMMENT ON FUNCTION public.completa_dati_esportazione_gamma(uuid,smallint,text,text,text) IS 'FM96 4b: gate auth_puo_esportare_gamma gemello RUOLI_ESPORTAZIONE_GAMMA; NULL lascia invariato. Normalizzazione SDI solo in codice-sdi.ts.';
REVOKE EXECUTE ON FUNCTION public.completa_dati_esportazione_gamma(uuid,smallint,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completa_dati_esportazione_gamma(uuid,smallint,text,text,text) TO authenticated;