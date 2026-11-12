-- FM63 Fetta 3: fonte unica prezzo di vendita, elenco articoli per sede, fornitori obsoleti esclusi.

-- a) Fonte unica del prezzo di vendita (listino o prezzo per deposito della sede).
-- Interna: SQL non SECURITY DEFINER per essere espansa nei chiamanti; _codice opzionale restringe a un articolo.
CREATE OR REPLACE FUNCTION public._prezzo_vendita_articoli(_listino smallint, _store_id uuid, _codice text DEFAULT NULL)
RETURNS TABLE(articolo_codice text, prezzo_listino numeric, prezzo_deposito numeric, prezzo numeric, fonte text, deposito_codice text)
LANGUAGE sql STABLE
AS $$
  WITH l AS (
    SELECT a.articolo_codice AS ac, a.prezzo_vendita AS pv
    FROM public.articoli_gamma_listini a
    WHERE a.listino = _listino AND (_codice IS NULL OR a.articolo_codice = _codice)
  ), dep AS (
    SELECT DISTINCT ON (pd.articolo_codice) pd.articolo_codice AS ac, pd.deposito_codice AS dc, pd.prezzo_netto AS pn
    FROM public.prezzi_deposito_gamma pd
    JOIN public.depositi d ON d.codice = pd.deposito_codice
    JOIN public.stores st ON st.id = d.store_id
    WHERE _store_id IS NOT NULL AND d.store_id = _store_id AND pd.listino = _listino
      AND (_codice IS NULL OR pd.articolo_codice = _codice)
    ORDER BY pd.articolo_codice, pd.valido_dal DESC NULLS LAST, pd.deposito_codice
  )
  SELECT coalesce(l.ac, dep.ac), l.pv, dep.pn, coalesce(dep.pn, l.pv),
         CASE WHEN dep.pn IS NOT NULL THEN 'deposito' ELSE 'listino' END, dep.dc
  FROM l FULL JOIN dep ON dep.ac = l.ac
$$;
REVOKE EXECUTE ON FUNCTION public._prezzo_vendita_articoli(smallint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._prezzo_vendita_articoli(smallint, uuid, text) TO service_role;

-- listini_articolo_visibili riscritta sulla fonte unica (stesse righe di prima).
CREATE OR REPLACE FUNCTION public.listini_articolo_visibili(_codice text)
 RETURNS TABLE(listino smallint, listino_descrizione text, store_id uuid, sede_nome text, deposito_codice text, prezzo_listino numeric, prezzo_deposito numeric, prezzo numeric, fonte text, acq_prezzo numeric, acq_sc1 numeric, acq_sc2 numeric, acq_sc3 numeric, acq_trasporto_perc numeric, acq_trasporto_euro numeric, costo_acquisto numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v record;
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_consulta_preventivi(), false) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.auth_listini_sede();
  RETURN QUERY
  WITH vis AS MATERIALIZED (
    SELECT DISTINCT s.listino_riferimento AS l FROM public.stores s
    WHERE s.listino_riferimento IS NOT NULL AND (v.globale OR s.listino_riferimento = v.listino)
  ), base AS MATERIALIZED (
    SELECT vis.l, lg.descrizione, a.acq_prezzo, a.acq_sc1, a.acq_sc2, a.acq_sc3, a.acq_trasporto_perc, a.acq_trasporto_euro, a.costo_acquisto
    FROM vis
    JOIN public.listini_gamma lg ON lg.codice = vis.l
    LEFT JOIN public.articoli_gamma_listini a ON a.articolo_codice = _codice AND a.listino = vis.l
  ), righe AS (
    SELECT b.l, b.descrizione, NULL::uuid AS sid, NULL::text AS nome, NULL::text AS dc, pv.prezzo_listino AS pl, NULL::numeric AS pd, pv.prezzo_listino AS p, 'listino'::text AS f,
           b.acq_prezzo, b.acq_sc1, b.acq_sc2, b.acq_sc3, b.acq_trasporto_perc, b.acq_trasporto_euro, b.costo_acquisto
    FROM base b LEFT JOIN LATERAL public._prezzo_vendita_articoli(b.l, NULL, _codice) pv ON true
    WHERE v.globale
    UNION ALL
    SELECT b.l, b.descrizione, st.id, st.nome, pv.deposito_codice, pv.prezzo_listino, pv.prezzo_deposito, pv.prezzo_deposito, 'deposito'::text,
           b.acq_prezzo, b.acq_sc1, b.acq_sc2, b.acq_sc3, b.acq_trasporto_perc, b.acq_trasporto_euro, b.costo_acquisto
    FROM base b CROSS JOIN public.stores st
    JOIN LATERAL public._prezzo_vendita_articoli(b.l, st.id, _codice) pv ON pv.deposito_codice IS NOT NULL
    WHERE v.globale
    UNION ALL
    SELECT b.l, b.descrizione, v.store_id, st.nome, pv.deposito_codice, pv.prezzo_listino, pv.prezzo_deposito, pv.prezzo,
           coalesce(pv.fonte, 'listino'),
           b.acq_prezzo, b.acq_sc1, b.acq_sc2, b.acq_sc3, b.acq_trasporto_perc, b.acq_trasporto_euro, b.costo_acquisto
    FROM base b LEFT JOIN public.stores st ON st.id = v.store_id
    LEFT JOIN LATERAL public._prezzo_vendita_articoli(b.l, v.store_id, _codice) pv ON true
    WHERE NOT v.globale
  )
  SELECT r.l, r.descrizione, r.sid, r.nome, r.dc, r.pl, r.pd, r.p, r.f,
         r.acq_prezzo, r.acq_sc1, r.acq_sc2, r.acq_sc3, r.acq_trasporto_perc, r.acq_trasporto_euro, r.costo_acquisto
  FROM righe r ORDER BY r.l, r.sid IS NOT NULL, r.nome;
END $function$;

-- b) cerca_articoli: una sola versione, disponibilità per sede/logistica, prezzo della sede, ordinamento in whitelist.
DROP FUNCTION public.cerca_articoli(text, text[], text[], text[], uuid[], text[], boolean, smallint, integer, integer);
CREATE FUNCTION public.cerca_articoli(
  testo text DEFAULT '', famiglie text[] DEFAULT NULL, sottofamiglie text[] DEFAULT NULL, marche text[] DEFAULT NULL,
  fornitori uuid[] DEFAULT NULL, stati text[] DEFAULT NULL, disponibile_in uuid[] DEFAULT NULL, disponibile_logistica boolean DEFAULT false,
  listino smallint DEFAULT 10, _ordina text DEFAULT 'codice', _direzione text DEFAULT 'asc',
  limite integer DEFAULT 100, "offset" integer DEFAULT 0)
 RETURNS TABLE(origine text, codice text, preventivatore_id uuid, descrizione text, marca text, famiglia text, sottofamiglia text, um text, um2 text, fattore_conversione numeric, prezzo numeric, fonte_prezzo text, giacenza_sede numeric, giacenza_logistica numeric, stato_gamma text, totale bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v record; _l smallint; _s uuid;
  _o text := CASE WHEN _ordina IN ('codice','descrizione','marca','famiglia','prezzo','giacenza_sede','giacenza_logistica','stato') THEN _ordina ELSE 'codice' END;
  _desc boolean := lower(coalesce(_direzione,'asc')) = 'desc';
  _filtro_disp boolean := coalesce(cardinality(disponibile_in),0) > 0 OR coalesce(disponibile_logistica,false);
BEGIN
IF NOT coalesce(public.auth_mfa_ok() AND public.auth_consulta_preventivi(),false) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
SELECT * INTO v FROM public.auth_listini_sede();
IF v.globale THEN
  _l := CASE WHEN cerca_articoli.listino IN (10,20,30) THEN cerca_articoli.listino ELSE 10 END; _s := NULL;
ELSE
  _l := v.listino; _s := v.store_id;
END IF;
RETURN QUERY WITH per_sede AS MATERIALIZED (
  SELECT s.articolo_codice ac, (s.conta_disponibilita='logistica_comune') logi,
         CASE WHEN s.conta_disponibilita='logistica_comune' THEN NULL ELSE s.store_id END sid,
         sum(s.giacenza) giac, sum(s.disponibilita) disp
  FROM public._giacenze_articoli_catalogo() s WHERE s.conta_totale GROUP BY 1,2,3
), stock AS MATERIALIZED (
  SELECT ps.ac,
    sum(ps.giac) FILTER (WHERE NOT ps.logi AND (v.globale OR ps.sid = _s)) g_sede,
    sum(ps.giac) FILTER (WHERE ps.logi) g_logi,
    coalesce(bool_or(NOT ps.logi AND ps.disp > 0 AND ps.sid = ANY(disponibile_in)), false) d_sedi,
    coalesce(bool_or(ps.logi AND ps.disp > 0), false) d_logi
  FROM per_sede ps GROUP BY ps.ac
), prezzi AS MATERIALIZED (
  SELECT pv.articolo_codice ac, pv.prezzo p, pv.fonte f FROM public._prezzo_vendita_articoli(_l, _s) pv
), corrispondenze AS MATERIALIZED (
SELECT g.codice FROM public.articoli_gamma g WHERE nullif(btrim(testo),'') IS NOT NULL AND g.descrizione ILIKE '%'||btrim(testo)||'%'
UNION SELECT g.codice FROM public.articoli_gamma g WHERE nullif(btrim(testo),'') IS NOT NULL AND (g.codice ILIKE '%'||btrim(testo)||'%' OR g.codice_a_barre=btrim(testo) OR g.codice_articolo_fornitore ILIKE '%'||btrim(testo)||'%')
UNION SELECT f.articolo_codice FROM public.articoli_gamma_fornitori f WHERE nullif(btrim(testo),'') IS NOT NULL AND f.codice_articolo_fornitore ILIKE '%'||btrim(testo)||'%'
), candidati AS (
SELECT 'gamma'::text c_origine,g.codice c_codice,NULL::uuid c_pid,g.descrizione c_descr,m.descrizione c_marca,g.famiglia c_fam,g.sottofamiglia c_sottofam,g.um c_um,g.um2 c_um2,g.fattore_conversione c_fc,
  pr.p c_prezzo, CASE WHEN pr.p IS NULL THEN NULL ELSE pr.f END c_fonte, coalesce(s.g_sede,0) c_gs, coalesce(s.g_logi,0) c_gl, coalesce(g.stato_gamma,'in_uso') c_stato
FROM public.articoli_gamma g LEFT JOIN public.marche m ON m.codice=g.marca_codice
LEFT JOIN prezzi pr ON pr.ac=g.codice
LEFT JOIN stock s ON s.ac=g.codice
WHERE g.attivo AND (coalesce(cardinality(famiglie),0)=0 OR g.codice_famiglia=ANY(famiglie))
AND (coalesce(cardinality(sottofamiglie),0)=0 OR g.codice_sottofamiglia=ANY(sottofamiglie))
AND (coalesce(cardinality(marche),0)=0 OR g.marca_codice=ANY(marche))
AND (coalesce(cardinality(fornitori),0)=0 OR g.fornitore_pref_id=ANY(fornitori))
AND (coalesce(cardinality(stati),0)=0 OR coalesce(g.stato_gamma,'in_uso')=ANY(stati))
AND (NOT _filtro_disp OR coalesce(s.d_sedi,false) OR (coalesce(disponibile_logistica,false) AND coalesce(s.d_logi,false)))
AND (nullif(btrim(testo),'') IS NULL OR g.codice IN (SELECT c.codice FROM corrispondenze c))
UNION ALL
SELECT 'preventivatore',nullif(btrim(a.cod_gamma),''),a.id,a.descrizione,NULL,NULL,NULL,a.um,NULL,NULL,NULL,NULL,NULL,NULL,'solo_preventivatore'
FROM public.articoli a WHERE NOT EXISTS(SELECT 1 FROM public.articoli_gamma g WHERE g.codice=btrim(a.cod_gamma))
AND coalesce(cardinality(famiglie),0)=0 AND coalesce(cardinality(sottofamiglie),0)=0 AND coalesce(cardinality(marche),0)=0 AND coalesce(cardinality(fornitori),0)=0
AND (coalesce(cardinality(stati),0)=0 OR 'solo_preventivatore'=ANY(stati)) AND NOT _filtro_disp
AND (nullif(btrim(testo),'') IS NULL OR a.cod_gamma ILIKE '%'||btrim(testo)||'%' OR a.descrizione ILIKE '%'||btrim(testo)||'%' OR a.cod_fornitore ILIKE '%'||btrim(testo)||'%')
), ordinati AS (
SELECT c.*, count(*) OVER() c_totale, row_number() OVER (ORDER BY
  CASE WHEN _o='codice' AND NOT _desc THEN c.c_codice END ASC NULLS LAST,
  CASE WHEN _o='codice' AND _desc THEN c.c_codice END DESC NULLS LAST,
  CASE WHEN _o='descrizione' AND NOT _desc THEN c.c_descr END ASC NULLS LAST,
  CASE WHEN _o='descrizione' AND _desc THEN c.c_descr END DESC NULLS LAST,
  CASE WHEN _o='marca' AND NOT _desc THEN c.c_marca END ASC NULLS LAST,
  CASE WHEN _o='marca' AND _desc THEN c.c_marca END DESC NULLS LAST,
  CASE WHEN _o='famiglia' AND NOT _desc THEN c.c_fam END ASC NULLS LAST,
  CASE WHEN _o='famiglia' AND _desc THEN c.c_fam END DESC NULLS LAST,
  CASE WHEN _o='stato' AND NOT _desc THEN c.c_stato END ASC NULLS LAST,
  CASE WHEN _o='stato' AND _desc THEN c.c_stato END DESC NULLS LAST,
  CASE WHEN _o='prezzo' AND NOT _desc THEN c.c_prezzo END ASC NULLS LAST,
  CASE WHEN _o='prezzo' AND _desc THEN c.c_prezzo END DESC NULLS LAST,
  CASE WHEN _o='giacenza_sede' AND NOT _desc THEN c.c_gs END ASC NULLS LAST,
  CASE WHEN _o='giacenza_sede' AND _desc THEN c.c_gs END DESC NULLS LAST,
  CASE WHEN _o='giacenza_logistica' AND NOT _desc THEN c.c_gl END ASC NULLS LAST,
  CASE WHEN _o='giacenza_logistica' AND _desc THEN c.c_gl END DESC NULLS LAST,
  c.c_codice ASC NULLS LAST, c.c_pid) rn
FROM candidati c
)
SELECT o.c_origine,o.c_codice,coalesce(o.c_pid,(SELECT a.id FROM public.articoli a WHERE btrim(a.cod_gamma)=o.c_codice ORDER BY a.id LIMIT 1)),o.c_descr,o.c_marca,o.c_fam,o.c_sottofam,o.c_um,o.c_um2,o.c_fc,o.c_prezzo,o.c_fonte,o.c_gs,o.c_gl,o.c_stato,o.c_totale
FROM ordinati o ORDER BY o.rn
LIMIT least(200,greatest(1,coalesce(limite,100))) OFFSET greatest(0,coalesce(cerca_articoli."offset",0));
END; $function$;
REVOKE EXECUTE ON FUNCTION public.cerca_articoli(text, text[], text[], text[], uuid[], text[], uuid[], boolean, smallint, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_articoli(text, text[], text[], text[], uuid[], text[], uuid[], boolean, smallint, text, text, integer, integer) TO authenticated, service_role;

-- c) facets_articoli: aggiunge sedi per il filtro "Disponibile in" e contesto listino dell'utente.
CREATE OR REPLACE FUNCTION public.facets_articoli()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v record;
BEGIN
IF NOT coalesce(public.auth_mfa_ok() AND public.auth_consulta_preventivi(),false) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
SELECT * INTO v FROM public.auth_listini_sede();
RETURN jsonb_build_object(
'famiglie',(SELECT coalesce(jsonb_agg(x ORDER BY x.descrizione),'[]') FROM (SELECT g.codice_famiglia codice,max(g.famiglia) descrizione,count(*) conteggio FROM articoli_gamma g WHERE g.attivo AND g.codice_famiglia IS NOT NULL GROUP BY 1)x),
'sottofamiglie',(SELECT coalesce(jsonb_agg(x ORDER BY x.descrizione),'[]') FROM (SELECT g.codice_sottofamiglia codice,g.codice_famiglia famiglia,max(g.sottofamiglia) descrizione,count(*) conteggio FROM articoli_gamma g WHERE g.attivo AND g.codice_sottofamiglia IS NOT NULL GROUP BY 1,2)x),
'marche',(SELECT coalesce(jsonb_agg(x ORDER BY x.descrizione),'[]') FROM (SELECT m.codice,m.descrizione,count(*) conteggio FROM articoli_gamma g JOIN marche m ON m.codice=g.marca_codice WHERE g.attivo GROUP BY m.codice,m.descrizione)x),
'sedi',(SELECT coalesce(jsonb_agg(x ORDER BY x.propria DESC, x.nome),'[]') FROM (SELECT st.id, st.nome, (NOT v.globale AND st.id = v.store_id) propria FROM stores st WHERE EXISTS (SELECT 1 FROM depositi d WHERE d.store_id = st.id AND d.conta_disponibilita = 'si'))x),
'globale', v.globale,
'listino_sede', v.listino);
END; $function$;

-- d) cerca_fornitori_articoli: fornitori obsoleti esclusi (fonte unica fornitore_obsoleto), tranne i già selezionati.
CREATE OR REPLACE FUNCTION public.cerca_fornitori_articoli(testo text DEFAULT ''::text, selezionati uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, ragione_sociale text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
IF NOT coalesce(public.auth_mfa_ok() AND public.auth_consulta_preventivi(),false) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
RETURN QUERY SELECT f.id,f.ragione_sociale FROM fornitori f WHERE f.origine='gamma' AND f.attivo AND (f.id=ANY(selezionati) OR f.id IN (SELECT f2.id FROM fornitori f2 WHERE f2.origine='gamma' AND f2.attivo AND NOT public.fornitore_obsoleto(f2) AND (nullif(btrim(testo),'') IS NULL OR f2.ragione_sociale ILIKE '%'||btrim(testo)||'%' OR f2.codice_gestionale::text=btrim(testo)) ORDER BY f2.ragione_sociale LIMIT 50)) ORDER BY f.ragione_sociale;
END; $function$;