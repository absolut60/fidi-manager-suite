-- FM62 G5: filtro "con email", id filtrati per la selezione multipla, invii a più fornitori.

-- Base filtrata unica per elenco e selezione (nessun controllo accesso: lo fanno i chiamanti).
CREATE OR REPLACE FUNCTION public._fornitori_filtrati(
  _testo text, _anche_cliente boolean, _con_articoli boolean, _includi_manuali boolean,
  _macrocategorie text[], _con_email boolean)
RETURNS TABLE(id uuid, origine text, codice_gestionale integer, ragione_sociale text, alias text, partita_iva text,
  codice_fiscale text, citta text, provincia text, condizione_pagamento_desc text, persona_fisica boolean, valida boolean,
  n_articoli integer, n_preferenziale integer, anche_cliente boolean, macrocategoria_cod text, macrocategoria_desc text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      CASE WHEN btrim(f.email) ~* '^[^@\s;,]+@[^@\s;,]+\.[a-z]{2,}$' THEN btrim(f.email) END AS email
    FROM public.fornitori f LEFT JOIN conteggi c ON c.fornitore_id = f.id
    WHERE ((f.origine = 'gamma' AND f.attivo) OR (coalesce(_includi_manuali, false) AND f.origine = 'manuale'))
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
      OR ('nd' = ANY(_macrocategorie) AND b.macrocategoria_cod IS NULL));
$$;
REVOKE EXECUTE ON FUNCTION public._fornitori_filtrati(text, boolean, boolean, boolean, text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fornitori_filtrati(text, boolean, boolean, boolean, text[], boolean) TO service_role;

DROP FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[]);
CREATE FUNCTION public.cerca_fornitori(_testo text DEFAULT NULL, _anche_cliente boolean DEFAULT NULL,
  _con_articoli boolean DEFAULT NULL, _includi_manuali boolean DEFAULT false, _limite integer DEFAULT 100,
  _offset integer DEFAULT 0, _macrocategorie text[] DEFAULT NULL, _con_email boolean DEFAULT NULL)
RETURNS TABLE(id uuid, origine text, codice_gestionale integer, ragione_sociale text, alias text, partita_iva text,
  codice_fiscale text, citta text, provincia text, condizione_pagamento_desc text, persona_fisica boolean, valida boolean,
  n_articoli integer, n_preferenziale integer, anche_cliente boolean, macrocategoria_cod text, macrocategoria_desc text,
  email text, totale bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.*, count(*) OVER ()
  FROM public._fornitori_filtrati(_testo, _anche_cliente, _con_articoli, _includi_manuali, _macrocategorie, _con_email) b
  ORDER BY b.ragione_sociale, b.id
  LIMIT greatest(1, least(coalesce(_limite, 100), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[], boolean) TO authenticated, service_role;

-- Solo gli id dei fornitori filtrati (selezione "tutti i filtrati").
CREATE OR REPLACE FUNCTION public.cerca_fornitori_ids(_testo text DEFAULT NULL, _anche_cliente boolean DEFAULT NULL,
  _con_articoli boolean DEFAULT NULL, _includi_manuali boolean DEFAULT false, _macrocategorie text[] DEFAULT NULL,
  _con_email boolean DEFAULT NULL)
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT array_agg(b.id ORDER BY b.ragione_sociale, b.id)
    FROM public._fornitori_filtrati(_testo, _anche_cliente, _con_articoli, _includi_manuali, _macrocategorie, _con_email) b), '{}');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cerca_fornitori_ids(text, boolean, boolean, boolean, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_fornitori_ids(text, boolean, boolean, boolean, text[], boolean) TO authenticated, service_role;

-- Invii email a più fornitori (scritture solo lato server).
CREATE TABLE public.invii_fornitori (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chiave_invio uuid NOT NULL UNIQUE,
  oggetto text NOT NULL,
  corpo_html text NOT NULL,
  allegati jsonb NOT NULL DEFAULT '[]'::jsonb,
  creato_da uuid,
  creato_il timestamptz NOT NULL DEFAULT now(),
  stato text NOT NULL DEFAULT 'in_corso' CHECK (stato IN ('in_corso', 'completato', 'con_errori')),
  totale integer NOT NULL DEFAULT 0,
  inviati integer NOT NULL DEFAULT 0,
  errori integer NOT NULL DEFAULT 0,
  saltati integer NOT NULL DEFAULT 0,
  completato_il timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invii_fornitori TO authenticated;
GRANT ALL ON public.invii_fornitori TO service_role;
ALTER TABLE public.invii_fornitori ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Secondo fattore (FM44)" ON public.invii_fornitori AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY invii_fornitori_select ON public.invii_fornitori FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_accesso_fornitori()));
CREATE INDEX invii_fornitori_creato_il_idx ON public.invii_fornitori (creato_da, creato_il DESC);

ALTER TABLE public.attivita_fornitore ADD COLUMN invio_id uuid REFERENCES public.invii_fornitori(id) ON DELETE SET NULL;
-- Anti-doppione per fornitore: una sola riga (e un solo invio) per fornitore in ogni invio multiplo.
CREATE UNIQUE INDEX attivita_fornitore_invio_fornitore_uq ON public.attivita_fornitore (invio_id, fornitore_id) WHERE invio_id IS NOT NULL;
