ALTER TABLE public.preventivi
  ADD COLUMN listino_rif smallint NULL REFERENCES public.listini_gamma(codice),
  ADD COLUMN macrocategoria_rif text NULL,
  ADD COLUMN categoria_rif text NULL;

COMMENT ON COLUMN public.preventivi.listino_rif IS 'Condizioni di riferimento (FM71): quando valorizzate, il motore prezzi usa queste al posto delle condizioni del cliente; gli accordi personali del cliente vengono ignorati.';
COMMENT ON COLUMN public.preventivi.macrocategoria_rif IS 'Condizioni di riferimento (FM71): quando valorizzate, il motore prezzi usa queste al posto delle condizioni del cliente; gli accordi personali del cliente vengono ignorati.';
COMMENT ON COLUMN public.preventivi.categoria_rif IS 'Condizioni di riferimento (FM71): quando valorizzate, il motore prezzi usa queste al posto delle condizioni del cliente; gli accordi personali del cliente vengono ignorati.';

CREATE FUNCTION public.prezzi_preventivo_riferimento(
  _listino smallint, _macrocategoria text, _categoria text, _store_id uuid,
  _codici text[], _data date DEFAULT CURRENT_DATE)
RETURNS TABLE(articolo_codice text, listino smallint, deposito_codice text, prezzo_listino numeric,
  prezzo_base numeric, fonte_prezzo text, sc1 numeric, sc2 numeric, sc3 numeric, sc4 numeric,
  sc5 numeric, sc6 numeric, maggiorazione_perc numeric, prezzo_netto numeric, regole text[],
  avvisi text[], um text, costo_ultimo numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.auth_ha_accesso_preventivi() THEN
    RAISE EXCEPTION 'Permesso negato: prezzi del preventivo' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(_codici), 0) > 500 THEN
    RAISE EXCEPTION 'Troppi articoli: massimo 500 codici per richiesta (ricevuti %)', cardinality(_codici)
      USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT * FROM public._prezzo_preventivo_articoli(
    _listino, _store_id, _macrocategoria, _categoria,
    NULL /* sottocategoria */, NULL /* cliente_codice */, NULL /* listino_piu_articoli */,
    _codici, _data);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prezzi_preventivo_riferimento(smallint, text, text, uuid, text[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prezzi_preventivo_riferimento(smallint, text, text, uuid, text[], date) TO authenticated, service_role;