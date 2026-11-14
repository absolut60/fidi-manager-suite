CREATE FUNCTION public.articoli_picker_apertura(_cantiere_id uuid DEFAULT NULL, _sede_giacenza uuid DEFAULT NULL)
RETURNS TABLE(gruppo text, codice text, descrizione text, marca text, um text, giacenza_sede numeric, giacenza_logistica numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_consulta_preventivi(),false) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH cantiere AS MATERIALIZED (
    SELECT DISTINCT g.codice
    FROM public.cantiere_listini_speciali l
    JOIN public.articoli_gamma g ON g.codice=l.cod_gamma AND g.attivo
    WHERE _cantiere_id IS NOT NULL AND l.cantiere_id=_cantiere_id
      AND EXISTS (SELECT 1 FROM public.cantieri c WHERE c.id=_cantiere_id)
  ), recenti AS MATERIALIZED (
    SELECT r.articolo_codice AS codice, max(r.created_at) AS usato_il
    FROM public.righe_preventivo r
    JOIN public.blocchi_preventivo b ON b.id=r.blocco_id
    JOIN public.preventivi p ON p.id=b.preventivo_id
    JOIN public.articoli_gamma g ON g.codice=r.articolo_codice AND g.attivo
    WHERE p.creato_da=(SELECT auth.uid())
      AND NOT EXISTS (SELECT 1 FROM cantiere c WHERE c.codice=r.articolo_codice)
    GROUP BY r.articolo_codice
    ORDER BY max(r.created_at) DESC, r.articolo_codice ASC
    LIMIT 15
  ), scelti AS (
    SELECT 'cantiere'::text AS gruppo, c.codice, NULL::timestamptz AS usato_il FROM cantiere c
    UNION ALL
    SELECT 'recente'::text, r.codice, r.usato_il FROM recenti r
  )
  SELECT x.gruppo,g.codice,g.descrizione,m.descrizione,g.um,
    CASE WHEN _sede_giacenza IS NOT NULL THEN coalesce(st.gs,0) END,
    CASE WHEN _sede_giacenza IS NOT NULL THEN coalesce(st.gl,0) END
  FROM scelti x
  JOIN public.articoli_gamma g ON g.codice=x.codice
  LEFT JOIN public.marche m ON m.codice=g.marca_codice
  LEFT JOIN LATERAL (
    SELECT sum(s.giacenza) FILTER (WHERE NOT s.logistica AND s.store_id=_sede_giacenza) AS gs,
           sum(s.giacenza) FILTER (WHERE s.logistica) AS gl
    FROM public.giacenze_articoli_sede s
    WHERE s.articolo_codice=g.codice AND _sede_giacenza IS NOT NULL
  ) st ON true
  ORDER BY CASE x.gruppo WHEN 'cantiere' THEN 0 ELSE 1 END,
    CASE WHEN x.gruppo='cantiere' THEN g.descrizione END ASC,
    x.usato_il DESC NULLS LAST,g.codice ASC;
END;
$function$;
-- PostgreSQL requires CREATE on the schema for ownership transfer. Grant only
-- inside this transaction and revoke immediately; no caller privilege survives.
GRANT CREATE ON SCHEMA public TO authenticated;
ALTER FUNCTION public.articoli_picker_apertura(uuid,uuid) OWNER TO authenticated;
REVOKE CREATE ON SCHEMA public FROM authenticated;
-- Non-BYPASSRLS owner: the EXISTS really uses existing caller-based cantieri RLS.
REVOKE EXECUTE ON FUNCTION public.articoli_picker_apertura(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.articoli_picker_apertura(uuid,uuid) TO authenticated, service_role;