CREATE OR REPLACE FUNCTION public.condizioni_preventivo_cliente(_cliente_id uuid)
 RETURNS TABLE(listino smallint, listino_descrizione text, macrocategoria text, macrocategoria_label text, categoria text, categoria_label text, sottocategoria text, sede_nome text, store_id uuid)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.auth_consulta_preventivi() THEN
    RAISE EXCEPTION 'Permesso negato: condizioni del preventivo' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT cg.listino, lg.descrizione,
         cg.macrocategoria, coalesce(m.label, '—'),
         cg.categoria, coalesce(cc.label, '—'),
         cg.sottocategoria, s.nome, cl.store_id
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

CREATE OR REPLACE FUNCTION public.get_cantiere_preventivo(_id uuid)
 RETURNS TABLE(id uuid, cliente_id uuid, nome text, indirizzo text, cap text, citta text, provincia text, attivo boolean, provvisorio boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.id, c.cliente_id, c.nome, c.indirizzo, c.cap, c.citta, c.provincia, c.attivo, c.provvisorio
  FROM public.cantieri c
  WHERE c.id = _id
    AND c.cliente_id IS NOT NULL
    AND (public.auth_consulta_preventivi() OR (public.user_can_access_cliente(c.cliente_id) AND NOT (SELECT public.auth_solo_showroom())));
$function$;
REVOKE EXECUTE ON FUNCTION public.get_cantiere_preventivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cantiere_preventivo(uuid) TO authenticated, service_role;

DROP FUNCTION public.crea_cantiere_lite(uuid,text,text,text,text,text,boolean);

CREATE FUNCTION public.cantieri_modificabili(_ids uuid[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$
 SELECT c.id FROM public.cantieri c
 WHERE c.id = ANY(_ids)
 AND public.auth_puo_modificare_cantiere(c.cliente_id,c.lead_id,c.agente_codice,c.created_by);
$function$;
REVOKE EXECUTE ON FUNCTION public.cantieri_modificabili(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cantieri_modificabili(uuid[]) TO authenticated, service_role;