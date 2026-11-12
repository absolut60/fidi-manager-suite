CREATE OR REPLACE FUNCTION public.cerca_articoli(testo text DEFAULT '',famiglie text[] DEFAULT NULL,sottofamiglie text[] DEFAULT NULL,marche text[] DEFAULT NULL,fornitori uuid[] DEFAULT NULL,stati text[] DEFAULT NULL,solo_disponibili boolean DEFAULT false,listino smallint DEFAULT 10,limite int DEFAULT 100,"offset" int DEFAULT 0)
RETURNS TABLE(origine text,codice text,preventivatore_id uuid,descrizione text,marca text,famiglia text,sottofamiglia text,um text,um2 text,fattore_conversione numeric,prezzo numeric,disponibilita_totale numeric,stato_gamma text,totale bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi(),false) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
RETURN QUERY WITH stock AS MATERIALIZED (
SELECT s.articolo_codice,sum(s.disponibilita) disponibilita FROM public._giacenze_articoli_catalogo() s WHERE s.conta_totale GROUP BY s.articolo_codice
), candidati AS (
SELECT 'gamma'::text origine,g.codice,NULL::uuid preventivatore_id,g.descrizione,m.descrizione marca,g.famiglia,g.sottofamiglia,g.um,g.um2,g.fattore_conversione,p.prezzo_vendita prezzo,coalesce(s.disponibilita,0) disponibilita_totale,coalesce(g.stato_gamma,'in_uso') stato_gamma
FROM public.articoli_gamma g LEFT JOIN public.marche m ON m.codice=g.marca_codice
LEFT JOIN public.articoli_gamma_listini p ON p.articolo_codice=g.codice AND p.listino=cerca_articoli.listino
LEFT JOIN stock s ON s.articolo_codice=g.codice
WHERE g.attivo AND (coalesce(cardinality(famiglie),0)=0 OR g.codice_famiglia=ANY(famiglie))
AND (coalesce(cardinality(sottofamiglie),0)=0 OR g.codice_sottofamiglia=ANY(sottofamiglie))
AND (coalesce(cardinality(marche),0)=0 OR g.marca_codice=ANY(marche))
AND (coalesce(cardinality(fornitori),0)=0 OR g.fornitore_pref_id=ANY(fornitori))
AND (coalesce(cardinality(stati),0)=0 OR coalesce(g.stato_gamma,'in_uso')=ANY(stati))
AND (NOT coalesce(solo_disponibili,false) OR coalesce(s.disponibilita,0)>0)
AND (nullif(btrim(testo),'') IS NULL OR g.codice ILIKE '%'||btrim(testo)||'%' OR g.descrizione ILIKE '%'||btrim(testo)||'%' OR g.codice_a_barre=btrim(testo) OR g.codice_articolo_fornitore ILIKE '%'||btrim(testo)||'%' OR g.codice IN (SELECT f.articolo_codice FROM public.articoli_gamma_fornitori f WHERE f.codice_articolo_fornitore ILIKE '%'||btrim(testo)||'%'))
UNION ALL
SELECT 'preventivatore',nullif(btrim(a.cod_gamma),''),a.id,a.descrizione,NULL,NULL,NULL,a.um,NULL,NULL,NULL,NULL,'solo_preventivatore'
FROM public.articoli a WHERE NOT EXISTS(SELECT 1 FROM public.articoli_gamma g WHERE g.codice=btrim(a.cod_gamma))
AND coalesce(cardinality(famiglie),0)=0 AND coalesce(cardinality(sottofamiglie),0)=0 AND coalesce(cardinality(marche),0)=0 AND coalesce(cardinality(fornitori),0)=0
AND (coalesce(cardinality(stati),0)=0 OR 'solo_preventivatore'=ANY(stati)) AND NOT coalesce(solo_disponibili,false)
AND (nullif(btrim(testo),'') IS NULL OR a.cod_gamma ILIKE '%'||btrim(testo)||'%' OR a.descrizione ILIKE '%'||btrim(testo)||'%' OR a.cod_fornitore ILIKE '%'||btrim(testo)||'%')
)
SELECT pag.origine,pag.codice,coalesce(pag.preventivatore_id,(SELECT a.id FROM public.articoli a WHERE btrim(a.cod_gamma)=pag.codice ORDER BY a.id LIMIT 1)),pag.descrizione,pag.marca,pag.famiglia,pag.sottofamiglia,pag.um,pag.um2,pag.fattore_conversione,pag.prezzo,pag.disponibilita_totale,pag.stato_gamma,pag.totale
FROM (SELECT c.*,count(*) OVER() totale FROM candidati c ORDER BY c.codice NULLS LAST,c.preventivatore_id LIMIT least(200,greatest(1,coalesce(limite,100))) OFFSET greatest(0,coalesce(cerca_articoli."offset",0))) pag ORDER BY pag.codice NULLS LAST,pag.preventivatore_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.cerca_articoli(text,text[],text[],text[],uuid[],text[],boolean,smallint,int,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cerca_articoli(text,text[],text[],text[],uuid[],text[],boolean,smallint,int,int) TO authenticated;
CREATE OR REPLACE FUNCTION public.cerca_fornitori_articoli(testo text DEFAULT '',selezionati uuid[] DEFAULT NULL) RETURNS TABLE(id uuid,ragione_sociale text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi(),false) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
RETURN QUERY SELECT f.id,f.ragione_sociale FROM fornitori f WHERE f.origine='gamma' AND f.attivo AND (f.id=ANY(selezionati) OR f.id IN (SELECT f2.id FROM fornitori f2 WHERE f2.origine='gamma' AND f2.attivo AND (nullif(btrim(testo),'') IS NULL OR f2.ragione_sociale ILIKE '%'||btrim(testo)||'%' OR f2.codice_gestionale::text=btrim(testo)) ORDER BY f2.ragione_sociale LIMIT 50)) ORDER BY f.ragione_sociale;
END; $$;
REVOKE EXECUTE ON FUNCTION public.cerca_fornitori_articoli(text,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cerca_fornitori_articoli(text,uuid[]) TO authenticated;