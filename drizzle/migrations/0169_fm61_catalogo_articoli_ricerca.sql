CREATE FUNCTION public._giacenze_articoli_catalogo(_codice text DEFAULT NULL)
RETURNS TABLE(articolo_codice text, deposito_codice text, store_id uuid, nome text, conta_disponibilita text, giacenza numeric, impegnato_clienti numeric, ordinato_fornitori numeric, disponibilita numeric, conta_totale boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT g.articolo_codice,g.deposito_codice,d.store_id,d.descrizione,d.conta_disponibilita,g.giacenza,g.impegnato_clienti,g.ordinato_fornitori,g.disponibilita,
(d.conta_disponibilita='si' AND d.store_id IS NOT NULL) OR d.conta_disponibilita='logistica_comune'
FROM public.giacenze_gamma g JOIN public.depositi d ON d.codice=g.deposito_codice
WHERE _codice IS NULL OR g.articolo_codice=btrim(_codice);
$$;
REVOKE EXECUTE ON FUNCTION public._giacenze_articoli_catalogo(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._giacenze_articoli_catalogo(text) TO service_role;
CREATE OR REPLACE FUNCTION public.disponibilita_articolo(_codice text)
RETURNS TABLE(livello text,store_id uuid,nome text,deposito_codice text,conta_disponibilita text,giacenza numeric,impegnato_clienti numeric,ordinato_fornitori numeric,disponibilita numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi(),false) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
RETURN QUERY WITH g AS MATERIALIZED (SELECT * FROM public._giacenze_articoli_catalogo(_codice))
SELECT 'sede'::text,g.store_id,st.nome,NULL::text,'si'::text,sum(g.giacenza),sum(g.impegnato_clienti),sum(g.ordinato_fornitori),sum(g.disponibilita)
FROM g LEFT JOIN public.stores st ON st.id=g.store_id WHERE g.conta_totale AND g.conta_disponibilita='si' GROUP BY g.store_id,st.nome
UNION ALL SELECT 'logistica_comune',NULL::uuid,'Logistica comune',NULL,'logistica_comune',sum(g.giacenza),sum(g.impegnato_clienti),sum(g.ordinato_fornitori),sum(g.disponibilita)
FROM g WHERE g.conta_totale AND g.conta_disponibilita='logistica_comune' HAVING count(*)>0
UNION ALL SELECT 'deposito',g.store_id,g.nome,g.deposito_codice,g.conta_disponibilita,g.giacenza,g.impegnato_clienti,g.ordinato_fornitori,g.disponibilita FROM g;
END; $$;
REVOKE EXECUTE ON FUNCTION public.disponibilita_articolo(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.disponibilita_articolo(text) TO authenticated,service_role;
CREATE FUNCTION public.cerca_articoli(testo text DEFAULT '',famiglie text[] DEFAULT NULL,sottofamiglie text[] DEFAULT NULL,marche text[] DEFAULT NULL,fornitori uuid[] DEFAULT NULL,stati text[] DEFAULT NULL,solo_disponibili boolean DEFAULT false,listino smallint DEFAULT 10,limite int DEFAULT 100,"offset" int DEFAULT 0)
RETURNS TABLE(origine text,codice text,preventivatore_id uuid,descrizione text,marca text,famiglia text,sottofamiglia text,um text,um2 text,fattore_conversione numeric,prezzo numeric,disponibilita_totale numeric,stato_gamma text,totale bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi(),false) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
RETURN QUERY WITH stock AS MATERIALIZED (
SELECT s.articolo_codice,sum(s.disponibilita) disponibilita FROM public._giacenze_articoli_catalogo() s WHERE s.conta_totale GROUP BY s.articolo_codice
), candidati AS (
SELECT 'gamma'::text origine,g.codice,(SELECT a.id FROM public.articoli a WHERE btrim(a.cod_gamma)=g.codice ORDER BY a.id LIMIT 1) preventivatore_id,g.descrizione,m.descrizione marca,g.famiglia,g.sottofamiglia,g.um,g.um2,g.fattore_conversione,p.prezzo_vendita prezzo,coalesce(s.disponibilita,0) disponibilita_totale,coalesce(g.stato_gamma,'in_uso') stato_gamma
FROM public.articoli_gamma g LEFT JOIN public.marche m ON m.codice=g.marca_codice
LEFT JOIN public.articoli_gamma_listini p ON p.articolo_codice=g.codice AND p.listino=cerca_articoli.listino
LEFT JOIN stock s ON s.articolo_codice=g.codice
WHERE g.attivo AND (coalesce(cardinality(famiglie),0)=0 OR g.codice_famiglia=ANY(famiglie))
AND (coalesce(cardinality(sottofamiglie),0)=0 OR g.codice_sottofamiglia=ANY(sottofamiglie))
AND (coalesce(cardinality(marche),0)=0 OR g.marca_codice=ANY(marche))
AND (coalesce(cardinality(fornitori),0)=0 OR g.fornitore_pref_id=ANY(fornitori))
AND (coalesce(cardinality(stati),0)=0 OR coalesce(g.stato_gamma,'in_uso')=ANY(stati))
AND (NOT coalesce(solo_disponibili,false) OR coalesce(s.disponibilita,0)>0)
AND (nullif(btrim(testo),'') IS NULL OR g.codice ILIKE '%'||btrim(testo)||'%' OR g.descrizione ILIKE '%'||btrim(testo)||'%' OR g.codice_a_barre=btrim(testo) OR g.codice_articolo_fornitore ILIKE '%'||btrim(testo)||'%' OR EXISTS(SELECT 1 FROM public.articoli_gamma_fornitori f WHERE f.articolo_codice=g.codice AND f.codice_articolo_fornitore ILIKE '%'||btrim(testo)||'%'))
UNION ALL
SELECT 'preventivatore',nullif(btrim(a.cod_gamma),''),a.id,a.descrizione,NULL,NULL,NULL,a.um,NULL,NULL,NULL,NULL,'solo_preventivatore'
FROM public.articoli a WHERE NOT EXISTS(SELECT 1 FROM public.articoli_gamma g WHERE g.codice=btrim(a.cod_gamma))
AND coalesce(cardinality(famiglie),0)=0 AND coalesce(cardinality(sottofamiglie),0)=0 AND coalesce(cardinality(marche),0)=0 AND coalesce(cardinality(fornitori),0)=0
AND (coalesce(cardinality(stati),0)=0 OR 'solo_preventivatore'=ANY(stati)) AND NOT coalesce(solo_disponibili,false)
AND (nullif(btrim(testo),'') IS NULL OR a.cod_gamma ILIKE '%'||btrim(testo)||'%' OR a.descrizione ILIKE '%'||btrim(testo)||'%' OR a.cod_fornitore ILIKE '%'||btrim(testo)||'%')
)
SELECT c.*,count(*) OVER() FROM candidati c ORDER BY c.codice NULLS LAST,c.preventivatore_id LIMIT least(200,greatest(1,coalesce(limite,100))) OFFSET greatest(0,coalesce(cerca_articoli."offset",0));
END; $$;
REVOKE EXECUTE ON FUNCTION public.cerca_articoli(text,text[],text[],text[],uuid[],text[],boolean,smallint,int,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cerca_articoli(text,text[],text[],text[],uuid[],text[],boolean,smallint,int,int) TO authenticated;
CREATE FUNCTION public.facets_articoli() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi(),false) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
RETURN jsonb_build_object('famiglie',(SELECT coalesce(jsonb_agg(x ORDER BY x.descrizione),'[]') FROM (SELECT g.codice_famiglia codice,max(g.famiglia) descrizione,count(*) conteggio FROM articoli_gamma g WHERE g.attivo AND g.codice_famiglia IS NOT NULL GROUP BY 1)x),'sottofamiglie',(SELECT coalesce(jsonb_agg(x ORDER BY x.descrizione),'[]') FROM (SELECT g.codice_sottofamiglia codice,g.codice_famiglia famiglia,max(g.sottofamiglia) descrizione,count(*) conteggio FROM articoli_gamma g WHERE g.attivo AND g.codice_sottofamiglia IS NOT NULL GROUP BY 1,2)x),'marche',(SELECT coalesce(jsonb_agg(x ORDER BY x.descrizione),'[]') FROM (SELECT m.codice,m.descrizione,count(*) conteggio FROM articoli_gamma g JOIN marche m ON m.codice=g.marca_codice WHERE g.attivo GROUP BY m.codice,m.descrizione)x));
END; $$;
REVOKE EXECUTE ON FUNCTION public.facets_articoli() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.facets_articoli() TO authenticated;
CREATE FUNCTION public.cerca_fornitori_articoli(testo text DEFAULT '',selezionati uuid[] DEFAULT NULL) RETURNS TABLE(id uuid,ragione_sociale text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi(),false) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
RETURN QUERY SELECT f.id,f.ragione_sociale FROM fornitori f WHERE f.origine='gamma' AND f.attivo AND (f.id=ANY(selezionati) OR f.id IN (SELECT f2.id FROM fornitori f2 WHERE f2.origine='gamma' AND f2.attivo AND (nullif(btrim(testo),'') IS NULL OR f2.ragione_sociale ILIKE '%'||btrim(testo)||'%' OR f2.codice_gamma::text=btrim(testo)) ORDER BY f2.ragione_sociale LIMIT 50)) ORDER BY f.ragione_sociale;
END; $$;
REVOKE EXECUTE ON FUNCTION public.cerca_fornitori_articoli(text,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cerca_fornitori_articoli(text,uuid[]) TO authenticated;