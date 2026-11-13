-- FM65 fetta 2b-1: condizioni Gamma del cliente da mostrare nella testata del preventivo (sola lettura).
CREATE OR REPLACE FUNCTION public.condizioni_preventivo_cliente(_cliente_id uuid)
RETURNS TABLE(listino smallint, listino_descrizione text, macrocategoria text, macrocategoria_label text,
              categoria text, categoria_label text, sottocategoria text, sede_nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.auth_ha_accesso_preventivi() THEN
    RAISE EXCEPTION 'Permesso negato: condizioni del preventivo' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT cg.listino, lg.descrizione,
         cg.macrocategoria, coalesce(m.label, '—'),
         cg.categoria, coalesce(cc.label, '—'),
         cg.sottocategoria, s.nome
  FROM public.clienti cl
  LEFT JOIN LATERAL (
    SELECT x.* FROM public.clienti_condizioni_gamma x
    WHERE x.cliente_id = cl.id ORDER BY x.cliente_codice LIMIT 1
  ) cg ON true
  LEFT JOIN public.listini_gamma lg ON lg.codice = cg.listino
  LEFT JOIN public.macrocategorie m ON m.codice = cg.macrocategoria
  LEFT JOIN public.categorie_cliente cc ON cc.codice = cg.categoria
  LEFT JOIN public.stores s ON s.id = cl.store_id
  WHERE cl.id = _cliente_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.condizioni_preventivo_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.condizioni_preventivo_cliente(uuid) TO authenticated, service_role;
