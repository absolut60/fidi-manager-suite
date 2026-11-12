-- FM62: fornitori obsoleti nascosti, marca del fornitore, sottocategoria servizi.

CREATE TABLE public.sottocategorie_servizi_fornitore (
  codice text PRIMARY KEY,
  descrizione text NOT NULL,
  ordine integer NOT NULL DEFAULT 0,
  attiva boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sottocategorie_servizi_fornitore TO authenticated;
GRANT ALL ON public.sottocategorie_servizi_fornitore TO service_role;
ALTER TABLE public.sottocategorie_servizi_fornitore ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Secondo fattore (FM44)" ON public.sottocategorie_servizi_fornitore AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY sottocategorie_servizi_select ON public.sottocategorie_servizi_fornitore FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_accesso_fornitori()));
CREATE POLICY sottocategorie_servizi_admin ON public.sottocategorie_servizi_fornitore FOR ALL TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'amministratore'))) WITH CHECK ((SELECT public.has_role(auth.uid(), 'amministratore')));
INSERT INTO public.sottocategorie_servizi_fornitore (codice, descrizione, ordine) VALUES
  ('TRASPORTI','Trasporti e logistica',10),('CONSULENZE','Consulenze e studi professionali',20),
  ('LEGALI','Legali e recupero crediti',30),('TECNICI','Tecnici e progettisti',40),
  ('UTENZE','Utenze (energia, gas, acqua, telefonia)',50),('ASSICURAZIONI','Assicurazioni',60),
  ('BANCHE','Banche, leasing e finanziamenti',70),('MEZZI','Mezzi: officine, noleggi, carburanti',80),
  ('INFORMATICA','Informatica e software',90),('MARKETING','Marketing, pubblicità e stampa',100),
  ('MANUTENZIONI','Manutenzioni e lavori',110),('SICUREZZA','Sicurezza, formazione e medicina del lavoro',120),
  ('COLLABORATORI','Agenti e collaboratori',130),('ALTRO','Altri servizi',140)
ON CONFLICT (codice) DO NOTHING;

ALTER TABLE public.fornitori
  ADD COLUMN marca_codice text REFERENCES public.marche(codice),
  ADD COLUMN marca_fonte text CHECK (marca_fonte IN ('automatica','manuale')),
  ADD COLUMN marca_da uuid,
  ADD COLUMN marca_il timestamptz,
  ADD COLUMN sottocategoria_app text REFERENCES public.sottocategorie_servizi_fornitore(codice),
  ADD COLUMN sottocategoria_app_da uuid,
  ADD COLUMN sottocategoria_app_il timestamptz,
  ADD COLUMN sottocategoria_gamma_cod text,
  ADD COLUMN sottocategoria_gamma_desc text;
COMMENT ON COLUMN public.fornitori.sottocategoria_gamma_cod IS 'FM62: predisposta per import Gamma futuro (oggi vuota).';
CREATE INDEX fornitori_marca_codice_idx ON public.fornitori (marca_codice);

CREATE FUNCTION public.fornitore_obsoleto(f public.fornitori) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT f.origine = 'gamma' AND (coalesce(f.ragione_sociale, f.nome) LIKE '%*%' OR f.valida IS FALSE);
$$;
REVOKE EXECUTE ON FUNCTION public.fornitore_obsoleto(public.fornitori) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fornitore_obsoleto(public.fornitori) TO authenticated, service_role;

CREATE FUNCTION public.sottocategoria_fornitore_effettiva(f public.fornitori)
RETURNS TABLE(codice text, descrizione text, fonte text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT x.codice, x.descrizione, x.fonte FROM (
    SELECT CASE WHEN nullif(btrim(f.sottocategoria_gamma_desc), '') IS NOT NULL THEN nullif(btrim(f.sottocategoria_gamma_cod), '') ELSE s.codice END AS codice,
      CASE WHEN nullif(btrim(f.sottocategoria_gamma_desc), '') IS NOT NULL THEN btrim(f.sottocategoria_gamma_desc) ELSE s.descrizione END AS descrizione,
      CASE WHEN nullif(btrim(f.sottocategoria_gamma_desc), '') IS NOT NULL THEN 'gamma' WHEN s.codice IS NOT NULL THEN 'app' END AS fonte
    FROM (SELECT 1) one
    LEFT JOIN public.sottocategorie_servizi_fornitore s ON s.codice = f.sottocategoria_app
    WHERE (SELECT te.tipo FROM public.tipo_fornitore_effettivo(f) te) = 'servizi'
  ) x WHERE x.fonte IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.sottocategoria_fornitore_effettiva(public.fornitori) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sottocategoria_fornitore_effettiva(public.fornitori) TO authenticated, service_role;

CREATE FUNCTION public.marca_prevalente_fornitore(_fornitore_id uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH m AS (
    SELECT a.marca_codice, count(*) AS n, sum(count(*)) OVER () AS tot
    FROM public.articoli_gamma_fornitori af
    JOIN public.articoli_gamma a ON a.codice = af.articolo_codice AND a.attivo
    WHERE af.fornitore_id = _fornitore_id AND a.marca_codice IS NOT NULL
    GROUP BY a.marca_codice
  )
  SELECT m.marca_codice FROM m WHERE m.n >= 0.6 * m.tot ORDER BY m.n DESC, m.marca_codice LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.marca_prevalente_fornitore(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marca_prevalente_fornitore(uuid) TO service_role;

CREATE FUNCTION public.ricalcola_marche_fornitori() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  WITH calc AS (
    SELECT f.id, public.marca_prevalente_fornitore(f.id) AS marca
    FROM public.fornitori f WHERE f.marca_fonte IS NULL OR f.marca_fonte = 'automatica'
  )
  UPDATE public.fornitori f SET marca_codice = c.marca, marca_fonte = 'automatica', marca_il = now(), marca_da = NULL
  FROM calc c WHERE f.id = c.id
    AND (f.marca_codice IS DISTINCT FROM c.marca OR f.marca_fonte IS NULL);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN jsonb_build_object('aggiornati', _n,
    'con_marca', (SELECT count(*) FROM public.fornitori WHERE marca_codice IS NOT NULL));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ricalcola_marche_fornitori() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ricalcola_marche_fornitori() TO service_role;

CREATE FUNCTION public.imposta_marca_fornitori(_ids uuid[], _marca_codice text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int; _m text := nullif(btrim(_marca_codice), '');
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.has_role(auth.uid(), 'amministratore'), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  IF _m IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.marche WHERE codice = _m) THEN
    RAISE EXCEPTION 'Marca inesistente: %', _m USING ERRCODE = '22023';
  END IF;
  IF coalesce(cardinality(_ids), 0) = 0 OR cardinality(_ids) > 5000 THEN
    RAISE EXCEPTION 'Selezione non valida (1-5000 fornitori)' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fornitori SET marca_codice = _m, marca_fonte = 'manuale', marca_da = auth.uid(), marca_il = now()
  WHERE id = ANY(_ids);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN jsonb_build_object('aggiornati', _n);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.imposta_marca_fornitori(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imposta_marca_fornitori(uuid[], text) TO authenticated, service_role;

CREATE FUNCTION public.imposta_sottocategoria_fornitori(_ids uuid[], _codice text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int; _c text := nullif(btrim(_codice), ''); _non int;
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.has_role(auth.uid(), 'amministratore'), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(_ids), 0) = 0 OR cardinality(_ids) > 5000 THEN
    RAISE EXCEPTION 'Selezione non valida (1-5000 fornitori)' USING ERRCODE = '22023';
  END IF;
  IF _c IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sottocategorie_servizi_fornitore WHERE codice = _c AND attiva) THEN
    RAISE EXCEPTION 'Sottocategoria inesistente: %', _c USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO _non FROM public.fornitori f CROSS JOIN LATERAL public.tipo_fornitore_effettivo(f) te
  WHERE f.id = ANY(_ids) AND te.tipo <> 'servizi';
  IF _non > 0 THEN
    RAISE EXCEPTION '% fornitori selezionati non sono di tipo Servizi', _non USING ERRCODE = '22023';
  END IF;
  UPDATE public.fornitori SET sottocategoria_app = _c, sottocategoria_app_da = auth.uid(), sottocategoria_app_il = now()
  WHERE id = ANY(_ids);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN jsonb_build_object('aggiornati', _n);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.imposta_sottocategoria_fornitori(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imposta_sottocategoria_fornitori(uuid[], text) TO authenticated, service_role;

CREATE FUNCTION public.opzioni_fornitori() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'marche', coalesce((SELECT jsonb_agg(jsonb_build_object('codice', m.codice, 'descrizione', m.descrizione) ORDER BY m.descrizione, m.codice)
      FROM public.marche m WHERE m.attivo IS NOT FALSE OR EXISTS (SELECT 1 FROM public.fornitori f WHERE f.marca_codice = m.codice)), '[]'::jsonb),
    'sottocategorie', coalesce((SELECT jsonb_agg(jsonb_build_object('codice', s.codice, 'descrizione', s.descrizione) ORDER BY s.ordine, s.codice)
      FROM public.sottocategorie_servizi_fornitore s WHERE s.attiva), '[]'::jsonb));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.opzioni_fornitori() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.opzioni_fornitori() TO authenticated, service_role;

DROP FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[], boolean, text[], text[], text, text);
DROP FUNCTION public.cerca_fornitori_ids(text, boolean, boolean, boolean, text[], boolean, text[], text[]);
DROP FUNCTION public._fornitori_filtrati(text, boolean, boolean, boolean, text[], boolean, text[], text[]);

CREATE FUNCTION public._fornitori_filtrati(_testo text, _anche_cliente boolean, _con_articoli boolean, _includi_manuali boolean, _macrocategorie text[], _con_email boolean, _tipi text[], _stati_convenzione text[], _includi_obsoleti boolean, _marche text[], _sottocategorie text[])
 RETURNS TABLE(id uuid, origine text, codice_gestionale integer, ragione_sociale text, alias text, partita_iva text, codice_fiscale text, citta text, provincia text, condizione_pagamento_desc text, persona_fisica boolean, valida boolean, n_articoli integer, n_preferenziale integer, anche_cliente boolean, macrocategoria_cod text, macrocategoria_desc text, email text, tipo_effettivo text, tipo_fonte text, stato_convenzione text, stato_convenzione_fonte text, obsoleto boolean, marca_codice text, marca_descrizione text, marca_fonte text, sottocategoria_codice text, sottocategoria_descrizione text, sottocategoria_fonte text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH conteggi AS MATERIALIZED (
    SELECT af.fornitore_id, count(*)::int AS n_articoli,
      count(*) FILTER (WHERE af.preferenziale)::int AS n_preferenziale
    FROM public.articoli_gamma_fornitori af
    JOIN public.articoli_gamma a ON a.codice = af.articolo_codice AND a.attivo
    GROUP BY af.fornitore_id
  ), base AS (
    SELECT f.id, f.origine, f.codice_gestionale,
      coalesce(f.ragione_sociale, f.nome) AS ragione_sociale,
      f.alias, f.partita_iva, f.codice_fiscale, f.citta, f.provincia,
      f.condizione_pagamento_desc, f.persona_fisica, f.valida,
      coalesce(c.n_articoli, 0) AS n_articoli, coalesce(c.n_preferenziale, 0) AS n_preferenziale,
      EXISTS (SELECT 1 FROM public.fornitore_cliente fc WHERE fc.fornitore_id = f.id) AS anche_cliente,
      nullif(btrim(f.macrocategoria_cod), '') AS macrocategoria_cod, nullif(btrim(f.macrocategoria_desc), '') AS macrocategoria_desc,
      CASE WHEN btrim(f.email) ~* '^[^@\s;,]+@[^@\s;,]+\.[a-z]{2,}$' THEN btrim(f.email) END AS email,
      te.tipo AS tipo_effettivo, te.fonte AS tipo_fonte, f.stato_convenzione, f.stato_convenzione_fonte,
      public.fornitore_obsoleto(f) AS obsoleto,
      f.marca_codice, m.descrizione AS marca_descrizione, f.marca_fonte,
      sc.codice AS sottocategoria_codice, sc.descrizione AS sottocategoria_descrizione, sc.fonte AS sottocategoria_fonte
    FROM public.fornitori f
    LEFT JOIN conteggi c ON c.fornitore_id = f.id
    LEFT JOIN public.marche m ON m.codice = f.marca_codice
    CROSS JOIN LATERAL public.tipo_fornitore_effettivo(f) te
    LEFT JOIN LATERAL public.sottocategoria_fornitore_effettiva(f) sc ON true
    WHERE ((f.origine = 'gamma' AND f.attivo) OR (coalesce(_includi_manuali, false) AND f.origine = 'manuale'))
      AND (coalesce(_includi_obsoleti, false) OR NOT public.fornitore_obsoleto(f))
      AND (nullif(btrim(_testo), '') IS NULL OR
        f.ragione_sociale ILIKE '%' || btrim(_testo) || '%' OR
        f.nome ILIKE '%' || btrim(_testo) || '%' OR
        f.alias ILIKE '%' || btrim(_testo) || '%' OR
        f.codice_gestionale::text ILIKE '%' || btrim(_testo) || '%' OR
        f.partita_iva ILIKE '%' || btrim(_testo) || '%' OR
        f.codice_fiscale ILIKE '%' || btrim(_testo) || '%' OR
        f.citta ILIKE '%' || btrim(_testo) || '%')
  )
  SELECT b.* FROM base b
  WHERE (_anche_cliente IS NULL OR b.anche_cliente = _anche_cliente)
    AND (_con_articoli IS NULL OR (b.n_articoli > 0) = _con_articoli)
    AND (_con_email IS NULL OR (b.email IS NOT NULL) = _con_email)
    AND (_macrocategorie IS NULL OR cardinality(_macrocategorie) = 0
      OR b.macrocategoria_cod = ANY(_macrocategorie)
      OR ('nd' = ANY(_macrocategorie) AND b.macrocategoria_cod IS NULL))
    AND (_tipi IS NULL OR cardinality(_tipi) = 0 OR b.tipo_effettivo = ANY(_tipi))
    AND (_stati_convenzione IS NULL OR cardinality(_stati_convenzione) = 0 OR b.stato_convenzione = ANY(_stati_convenzione))
    AND (_marche IS NULL OR cardinality(_marche) = 0 OR b.marca_codice = ANY(_marche)
      OR ('__nessuna__' = ANY(_marche) AND b.marca_codice IS NULL))
    AND (_sottocategorie IS NULL OR cardinality(_sottocategorie) = 0 OR b.sottocategoria_codice = ANY(_sottocategorie)
      OR ('__nessuna__' = ANY(_sottocategorie) AND b.sottocategoria_codice IS NULL));
$function$;
REVOKE EXECUTE ON FUNCTION public._fornitori_filtrati(text, boolean, boolean, boolean, text[], boolean, text[], text[], boolean, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fornitori_filtrati(text, boolean, boolean, boolean, text[], boolean, text[], text[], boolean, text[], text[]) TO service_role;

CREATE FUNCTION public.cerca_fornitori(_testo text DEFAULT NULL, _anche_cliente boolean DEFAULT NULL, _con_articoli boolean DEFAULT NULL, _includi_manuali boolean DEFAULT false, _limite integer DEFAULT 100, _offset integer DEFAULT 0, _macrocategorie text[] DEFAULT NULL, _con_email boolean DEFAULT NULL, _tipi text[] DEFAULT NULL, _stati_convenzione text[] DEFAULT NULL, _ordina text DEFAULT 'ragione_sociale', _direzione text DEFAULT 'asc', _includi_obsoleti boolean DEFAULT false, _marche text[] DEFAULT NULL, _sottocategorie text[] DEFAULT NULL)
 RETURNS TABLE(id uuid, origine text, codice_gestionale integer, ragione_sociale text, alias text, partita_iva text, codice_fiscale text, citta text, provincia text, condizione_pagamento_desc text, persona_fisica boolean, valida boolean, n_articoli integer, n_preferenziale integer, anche_cliente boolean, macrocategoria_cod text, macrocategoria_desc text, email text, tipo_effettivo text, tipo_fonte text, stato_convenzione text, stato_convenzione_fonte text, obsoleto boolean, marca_codice text, marca_descrizione text, marca_fonte text, sottocategoria_codice text, sottocategoria_descrizione text, sottocategoria_fonte text, totale bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  -- FM62: ordinamento solo da whitelist, nessun SQL dinamico; id come secondo criterio.
  _o text := CASE WHEN _ordina IN ('codice','ragione_sociale','citta','partita_iva','tipo','email','marca','sottocategoria') THEN _ordina ELSE 'ragione_sociale' END;
  _desc boolean := lower(coalesce(_direzione, 'asc')) = 'desc';
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.*, count(*) OVER ()
  FROM public._fornitori_filtrati(_testo, _anche_cliente, _con_articoli, _includi_manuali, _macrocategorie, _con_email, _tipi, _stati_convenzione, _includi_obsoleti, _marche, _sottocategorie) b
  ORDER BY
    CASE WHEN NOT _desc AND _o = 'codice' THEN b.codice_gestionale END ASC NULLS LAST,
    CASE WHEN _desc AND _o = 'codice' THEN b.codice_gestionale END DESC NULLS LAST,
    CASE WHEN NOT _desc AND _o = 'email' THEN (b.email IS NOT NULL AND btrim(b.email) <> '') END DESC,
    CASE WHEN _desc AND _o = 'email' THEN (b.email IS NOT NULL AND btrim(b.email) <> '') END ASC,
    CASE WHEN NOT _desc THEN CASE _o WHEN 'ragione_sociale' THEN lower(b.ragione_sociale) WHEN 'citta' THEN lower(b.citta) WHEN 'partita_iva' THEN b.partita_iva WHEN 'tipo' THEN b.tipo_effettivo WHEN 'marca' THEN lower(b.marca_descrizione) WHEN 'sottocategoria' THEN lower(b.sottocategoria_descrizione) END END ASC NULLS LAST,
    CASE WHEN _desc THEN CASE _o WHEN 'ragione_sociale' THEN lower(b.ragione_sociale) WHEN 'citta' THEN lower(b.citta) WHEN 'partita_iva' THEN b.partita_iva WHEN 'tipo' THEN b.tipo_effettivo WHEN 'marca' THEN lower(b.marca_descrizione) WHEN 'sottocategoria' THEN lower(b.sottocategoria_descrizione) END END DESC NULLS LAST,
    lower(b.ragione_sociale), b.id
  LIMIT greatest(1, least(coalesce(_limite, 100), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[], boolean, text[], text[], text, text, boolean, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[], boolean, text[], text[], text, text, boolean, text[], text[]) TO authenticated, service_role;

CREATE FUNCTION public.cerca_fornitori_ids(_testo text DEFAULT NULL, _anche_cliente boolean DEFAULT NULL, _con_articoli boolean DEFAULT NULL, _includi_manuali boolean DEFAULT false, _macrocategorie text[] DEFAULT NULL, _con_email boolean DEFAULT NULL, _tipi text[] DEFAULT NULL, _stati_convenzione text[] DEFAULT NULL, _includi_obsoleti boolean DEFAULT false, _marche text[] DEFAULT NULL, _sottocategorie text[] DEFAULT NULL)
 RETURNS uuid[]
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT array_agg(b.id ORDER BY b.ragione_sociale, b.id)
    FROM public._fornitori_filtrati(_testo, _anche_cliente, _con_articoli, _includi_manuali, _macrocategorie, _con_email, _tipi, _stati_convenzione, _includi_obsoleti, _marche, _sottocategorie) b), '{}');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.cerca_fornitori_ids(text, boolean, boolean, boolean, text[], boolean, text[], text[], boolean, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_fornitori_ids(text, boolean, boolean, boolean, text[], boolean, text[], text[], boolean, text[], text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dettaglio_fornitore(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE risultato jsonb;
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'id', f.id, 'origine', f.origine, 'codice_gestionale', f.codice_gestionale,
    'codice_anagrafica_generale', f.codice_anagrafica_generale, 'codice_cliente_gamma', f.codice_cliente_gamma,
    'ragione_sociale', coalesce(f.ragione_sociale, f.nome), 'alias', f.alias,
    'partita_iva', f.partita_iva, 'codice_fiscale', f.codice_fiscale, 'indirizzo', f.indirizzo,
    'cap', f.cap, 'citta', f.citta, 'provincia', f.provincia, 'stato', f.stato,
    'telefono', f.telefono, 'telefono_2', f.telefono_2, 'cellulare', f.cellulare, 'fax', f.fax,
    'email', f.email, 'sito', f.sito, 'pec', f.pec, 'persona_fisica', f.persona_fisica,
    'valida', f.valida, 'condizione_pagamento_cod', f.condizione_pagamento_cod,
    'condizione_pagamento_desc', f.condizione_pagamento_desc, 'attivo', f.attivo, 'note', f.note,
    'macrocategoria_cod', nullif(btrim(f.macrocategoria_cod), ''), 'macrocategoria_desc', nullif(btrim(f.macrocategoria_desc), ''),
    'tipo_effettivo', te.tipo, 'tipo_fonte', te.fonte, 'tipo_app_il', f.tipo_app_il,
    'stato_convenzione', f.stato_convenzione, 'stato_convenzione_fonte', f.stato_convenzione_fonte, 'stato_convenzione_il', f.stato_convenzione_il,
    'stato_convenzione_da_nome', (SELECT nullif(btrim(concat_ws(' ', p.nome, p.cognome)), '') FROM public.profili p WHERE p.id = f.stato_convenzione_da),
    'tipo_conflitto_convenzione', (f.stato_convenzione = 'convenzionato' AND btrim(f.macrocategoria_cod) = '03'),
    'puo_cambiare_convenzione', coalesce(public.has_role(auth.uid(), 'amministratore'), false),
    'ultima_modifica_gamma', f.ultima_modifica_gamma, 'ultima_sincronizzazione', f.ultima_sincronizzazione,
    'clienti', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'cliente_id', c.id, 'codice_gestionale', c.codice_gestionale, 'ragione_sociale', c.ragione_sociale,
      'store_nome', s.nome, 'bloccato', c.bloccato, 'in_gestione_legale', c.in_gestione_legale,
      'origine_legame', fc.origine, 'coincide_su', fc.coincide_su
    ) ORDER BY c.ragione_sociale, c.id)
    FROM public.fornitore_cliente fc JOIN public.clienti c ON c.id = fc.cliente_id
    LEFT JOIN public.stores s ON s.id = c.store_id WHERE fc.fornitore_id = f.id), '[]'::jsonb),
    'n_articoli', (SELECT count(*)::int FROM public.articoli_gamma_fornitori af
      JOIN public.articoli_gamma a ON a.codice = af.articolo_codice AND a.attivo WHERE af.fornitore_id = f.id),
    'n_preferenziale', (SELECT count(*)::int FROM public.articoli_gamma_fornitori af
      JOIN public.articoli_gamma a ON a.codice = af.articolo_codice AND a.attivo WHERE af.fornitore_id = f.id AND af.preferenziale),
    'puo_modificare_note', coalesce(public.auth_puo_gestire_fornitori(), false),
    'puo_vedere_articoli', coalesce(public.auth_ha_accesso_preventivi(), false)
  ) || jsonb_build_object('obsoleto', public.fornitore_obsoleto(f),
    'marca_codice', f.marca_codice, 'marca_descrizione', (SELECT m.descrizione FROM public.marche m WHERE m.codice = f.marca_codice), 'marca_fonte', f.marca_fonte, 'marca_il', f.marca_il,
    'sottocategoria_codice', sc.codice, 'sottocategoria_descrizione', sc.descrizione, 'sottocategoria_fonte', sc.fonte) INTO risultato FROM public.fornitori f CROSS JOIN LATERAL public.tipo_fornitore_effettivo(f) te LEFT JOIN LATERAL public.sottocategoria_fornitore_effettiva(f) sc ON true WHERE f.id = _id;
  RETURN risultato;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.dettaglio_fornitore(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dettaglio_fornitore(uuid) TO authenticated, service_role;

SELECT public.ricalcola_marche_fornitori();