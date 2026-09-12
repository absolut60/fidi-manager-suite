CREATE OR REPLACE FUNCTION public.elenco_persone_whatsapp_segmento(
  _filtri jsonb,
  _solo_contattabili boolean DEFAULT true
)
RETURNS TABLE(
  contatto_id uuid,
  cliente_id uuid,
  ragione_sociale text,
  nome text,
  cognome text,
  cellulare text,
  cellulare_valido boolean,
  consenso_whatsapp boolean,
  contattabile boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _publico uuid[];
  _contatti_ids uuid[];
BEGIN
  SELECT array_agg(p.id)
  INTO _publico
  FROM public.risolvi_pubblico_segmento(_filtri) p;

  IF coalesce(array_length(_publico, 1), 0) = 0 THEN
    RETURN;
  END IF;

  SELECT array_agg(ct.id)
  INTO _contatti_ids
  FROM public.contatti ct
  WHERE ct.cliente_id = ANY(_publico);

  IF coalesce(array_length(_contatti_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH contatti_pubblico AS MATERIALIZED (
    SELECT
      ct.id AS ct_id,
      ct.cliente_id AS ct_cliente_id,
      ct.nome AS ct_nome,
      ct.cognome AS ct_cognome,
      ct.cellulare AS ct_cellulare
    FROM public.contatti ct
    WHERE ct.id = ANY(_contatti_ids)
  ),
  stati_consensi AS MATERIALIZED (
    SELECT
      sc.contatto_id AS sc_contatto_id,
      sc.whatsapp AS sc_whatsapp
    FROM public.get_stato_consensi(_contatti_ids) sc
  )
  SELECT
    cp.ct_id AS contatto_id,
    cp.ct_cliente_id AS cliente_id,
    cl.ragione_sociale AS ragione_sociale,
    cp.ct_nome AS nome,
    cp.ct_cognome AS cognome,
    cp.ct_cellulare AS cellulare,
    public.fn_telefono_valido(cp.ct_cellulare) AS cellulare_valido,
    COALESCE(sc.sc_whatsapp, false) AS consenso_whatsapp,
    (public.fn_telefono_valido(cp.ct_cellulare) AND COALESCE(sc.sc_whatsapp, false)) AS contattabile
  FROM contatti_pubblico cp
  JOIN public.clienti cl ON cl.id = cp.ct_cliente_id
  LEFT JOIN stati_consensi sc ON sc.sc_contatto_id = cp.ct_id
  WHERE NOT _solo_contattabili
     OR (public.fn_telefono_valido(cp.ct_cellulare) AND COALESCE(sc.sc_whatsapp, false))
  ORDER BY cl.ragione_sociale NULLS LAST, cp.ct_cognome NULLS LAST, cp.ct_nome NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.elenco_persone_whatsapp_segmento(jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.elenco_persone_whatsapp_segmento(jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.elenco_persone_whatsapp_segmento(jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.elenco_persone_whatsapp_segmento(jsonb, boolean) TO supabase_read_only_user;