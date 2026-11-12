DROP FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[], boolean, text[], text[]);
CREATE FUNCTION public.cerca_fornitori(_testo text DEFAULT NULL, _anche_cliente boolean DEFAULT NULL, _con_articoli boolean DEFAULT NULL, _includi_manuali boolean DEFAULT false, _limite integer DEFAULT 100, _offset integer DEFAULT 0, _macrocategorie text[] DEFAULT NULL, _con_email boolean DEFAULT NULL, _tipi text[] DEFAULT NULL, _stati_convenzione text[] DEFAULT NULL, _ordina text DEFAULT 'ragione_sociale', _direzione text DEFAULT 'asc')
 RETURNS TABLE(id uuid, origine text, codice_gestionale integer, ragione_sociale text, alias text, partita_iva text, codice_fiscale text, citta text, provincia text, condizione_pagamento_desc text, persona_fisica boolean, valida boolean, n_articoli integer, n_preferenziale integer, anche_cliente boolean, macrocategoria_cod text, macrocategoria_desc text, email text, tipo_effettivo text, tipo_fonte text, stato_convenzione text, stato_convenzione_fonte text, totale bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  -- FM62: ordinamento solo da whitelist, nessun SQL dinamico; id come secondo criterio.
  _o text := CASE WHEN _ordina IN ('codice','ragione_sociale','citta','partita_iva','tipo','email') THEN _ordina ELSE 'ragione_sociale' END;
  _desc boolean := lower(coalesce(_direzione, 'asc')) = 'desc';
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_fornitori(), false) THEN
    RAISE EXCEPTION 'Accesso non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.*, count(*) OVER ()
  FROM public._fornitori_filtrati(_testo, _anche_cliente, _con_articoli, _includi_manuali, _macrocategorie, _con_email, _tipi, _stati_convenzione) b
  ORDER BY
    CASE WHEN NOT _desc AND _o = 'codice' THEN b.codice_gestionale END ASC NULLS LAST,
    CASE WHEN _desc AND _o = 'codice' THEN b.codice_gestionale END DESC NULLS LAST,
    CASE WHEN NOT _desc AND _o = 'email' THEN (b.email IS NOT NULL AND btrim(b.email) <> '') END DESC,
    CASE WHEN _desc AND _o = 'email' THEN (b.email IS NOT NULL AND btrim(b.email) <> '') END ASC,
    CASE WHEN NOT _desc THEN CASE _o WHEN 'ragione_sociale' THEN lower(b.ragione_sociale) WHEN 'citta' THEN lower(b.citta) WHEN 'partita_iva' THEN b.partita_iva WHEN 'tipo' THEN b.tipo_effettivo END END ASC NULLS LAST,
    CASE WHEN _desc THEN CASE _o WHEN 'ragione_sociale' THEN lower(b.ragione_sociale) WHEN 'citta' THEN lower(b.citta) WHEN 'partita_iva' THEN b.partita_iva WHEN 'tipo' THEN b.tipo_effettivo END END DESC NULLS LAST,
    lower(b.ragione_sociale), b.id
  LIMIT greatest(1, least(coalesce(_limite, 100), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[], boolean, text[], text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_fornitori(text, boolean, boolean, boolean, integer, integer, text[], boolean, text[], text[], text, text) TO authenticated, service_role;