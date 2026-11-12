-- FM63 Fetta 5: velocità elenco articoli.
-- Sintesi giacenze per sede/logistica: copia aggregata della fonte unica _giacenze_articoli_catalogo().
CREATE TABLE public.giacenze_articoli_sede (
  articolo_codice text NOT NULL,
  store_id uuid NULL,
  logistica boolean NOT NULL,
  chiave_sede text NOT NULL,
  giacenza numeric NOT NULL DEFAULT 0,
  disponibilita numeric NOT NULL DEFAULT 0,
  importazione_id uuid NULL,
  PRIMARY KEY (articolo_codice, logistica, chiave_sede),
  CONSTRAINT giacenze_articoli_sede_chiave_chk CHECK (chiave_sede = coalesce(store_id::text, 'logistica'))
);
GRANT SELECT ON public.giacenze_articoli_sede TO authenticated;
GRANT ALL ON public.giacenze_articoli_sede TO service_role;
ALTER TABLE public.giacenze_articoli_sede ENABLE ROW LEVEL SECURITY;
CREATE POLICY giacenze_articoli_sede_select ON public.giacenze_articoli_sede FOR SELECT TO authenticated
  USING ((SELECT public.auth_mfa_ok()) AND (SELECT public.auth_consulta_preventivi()));
CREATE INDEX giacenze_articoli_sede_chiave_idx ON public.giacenze_articoli_sede (chiave_sede, articolo_codice);
CREATE INDEX giacenze_articoli_sede_disp_idx ON public.giacenze_articoli_sede (chiave_sede, articolo_codice) WHERE disponibilita > 0;
COMMENT ON TABLE public.giacenze_articoli_sede IS 'Sintesi di _giacenze_articoli_catalogo() (fonte unica) per cerca_articoli; ricostruita solo da ricalcola_giacenze_articoli_sede().';

CREATE OR REPLACE FUNCTION public.ricalcola_giacenze_articoli_sede(_importazione_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.giacenze_articoli_sede WHERE articolo_codice IS NOT NULL;
  INSERT INTO public.giacenze_articoli_sede (articolo_codice, store_id, logistica, chiave_sede, giacenza, disponibilita, importazione_id)
  SELECT s.articolo_codice,
         CASE WHEN s.conta_disponibilita = 'logistica_comune' THEN NULL ELSE s.store_id END,
         s.conta_disponibilita = 'logistica_comune',
         CASE WHEN s.conta_disponibilita = 'logistica_comune' THEN 'logistica' ELSE s.store_id::text END,
         coalesce(sum(s.giacenza), 0), coalesce(sum(s.disponibilita), 0), _importazione_id
  FROM public._giacenze_articoli_catalogo() s
  WHERE s.conta_totale
  GROUP BY 1, 2, 3, 4;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.ricalcola_giacenze_articoli_sede(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ricalcola_giacenze_articoli_sede(uuid) TO service_role;

SELECT public.ricalcola_giacenze_articoli_sede();

-- Prezzo: fonte unica invariata, aggiunto solo il filtro opzionale _codici.
DROP FUNCTION public._prezzo_vendita_articoli(smallint, uuid, text);
CREATE FUNCTION public._prezzo_vendita_articoli(_listino smallint, _store_id uuid, _codice text DEFAULT NULL::text, _codici text[] DEFAULT NULL::text[])
 RETURNS TABLE(articolo_codice text, prezzo_listino numeric, prezzo_deposito numeric, prezzo numeric, fonte text, deposito_codice text)
 LANGUAGE sql STABLE
AS $function$
  WITH l AS (
    SELECT a.articolo_codice AS ac, a.prezzo_vendita AS pv
    FROM public.articoli_gamma_listini a
    WHERE a.listino = _listino AND (_codice IS NULL OR a.articolo_codice = _codice)
      AND (_codici IS NULL OR a.articolo_codice = ANY(_codici))
  ), dep AS (
    SELECT DISTINCT ON (pd.articolo_codice) pd.articolo_codice AS ac, pd.deposito_codice AS dc, pd.prezzo_netto AS pn
    FROM public.prezzi_deposito_gamma pd
    JOIN public.depositi d ON d.codice = pd.deposito_codice
    JOIN public.stores st ON st.id = d.store_id
    WHERE _store_id IS NOT NULL AND d.store_id = _store_id AND pd.listino = _listino
      AND (_codice IS NULL OR pd.articolo_codice = _codice)
      AND (_codici IS NULL OR pd.articolo_codice = ANY(_codici))
    ORDER BY pd.articolo_codice, pd.valido_dal DESC NULLS LAST, pd.deposito_codice
  )
  SELECT coalesce(l.ac, dep.ac), l.pv, dep.pn, coalesce(dep.pn, l.pv),
         CASE WHEN dep.pn IS NOT NULL THEN 'deposito' ELSE 'listino' END, dep.dc
  FROM l FULL JOIN dep ON dep.ac = l.ac
$function$;
REVOKE EXECUTE ON FUNCTION public._prezzo_vendita_articoli(smallint, uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._prezzo_vendita_articoli(smallint, uuid, text, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.cerca_articoli(testo text DEFAULT ''::text, famiglie text[] DEFAULT NULL::text[], sottofamiglie text[] DEFAULT NULL::text[], marche text[] DEFAULT NULL::text[], fornitori uuid[] DEFAULT NULL::uuid[], stati text[] DEFAULT NULL::text[], disponibile_in uuid[] DEFAULT NULL::uuid[], disponibile_logistica boolean DEFAULT false, listino smallint DEFAULT 10, _ordina text DEFAULT 'codice'::text, _direzione text DEFAULT 'asc'::text, limite integer DEFAULT 100, "offset" integer DEFAULT 0)
 RETURNS TABLE(origine text, codice text, preventivatore_id uuid, descrizione text, marca text, famiglia text, sottofamiglia text, um text, um2 text, fattore_conversione numeric, prezzo numeric, fonte_prezzo text, giacenza_sede numeric, giacenza_logistica numeric, stato_gamma text, totale bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v record; _l smallint; _s uuid;
  _o text := CASE WHEN _ordina IN ('codice','descrizione','marca','famiglia','prezzo','giacenza_sede','giacenza_logistica','stato') THEN _ordina ELSE 'codice' END;
  _desc boolean := lower(coalesce(_direzione,'asc')) = 'desc';
  _filtro_disp boolean := coalesce(cardinality(disponibile_in),0) > 0 OR coalesce(disponibile_logistica,false);
  _chiavi text[];
  _t text := nullif(btrim(testo),'');
  _lim integer := least(200,greatest(1,coalesce(limite,100)));
  _off integer := greatest(0,coalesce(cerca_articoli."offset",0));
  _art boolean;
  _nessun_filtro boolean := nullif(btrim(testo),'') IS NULL AND NOT (coalesce(cardinality(disponibile_in),0) > 0 OR coalesce(disponibile_logistica,false)) AND coalesce(cardinality(famiglie),0)=0 AND coalesce(cardinality(sottofamiglie),0)=0 AND coalesce(cardinality(marche),0)=0 AND coalesce(cardinality(fornitori),0)=0 AND coalesce(cardinality(stati),0)=0;
BEGIN
IF NOT coalesce(public.auth_mfa_ok() AND public.auth_consulta_preventivi(),false) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
SELECT * INTO v FROM public.auth_listini_sede();
IF v.globale THEN
  _l := CASE WHEN cerca_articoli.listino IN (10,20,30) THEN cerca_articoli.listino ELSE 10 END; _s := NULL;
ELSE
  _l := v.listino; _s := v.store_id;
END IF;
_chiavi := coalesce((SELECT array_agg(x::text) FROM unnest(disponibile_in) x), '{}'::text[])
        || CASE WHEN coalesce(disponibile_logistica,false) THEN ARRAY['logistica'] ELSE '{}'::text[] END;

_art := _o IN ('codice','descrizione','marca','famiglia','stato');
RETURN QUERY WITH base AS MATERIALIZED (
SELECT 'gamma'::text c_origine,g.codice c_codice,NULL::uuid c_pid,g.descrizione c_descr,m.descrizione c_marca,g.famiglia c_fam,g.sottofamiglia c_sottofam,g.um c_um,g.um2 c_um2,g.fattore_conversione c_fc,coalesce(g.stato_gamma,'in_uso') c_stato
FROM public.articoli_gamma g LEFT JOIN public.marche m ON m.codice=g.marca_codice
WHERE g.attivo AND (coalesce(cardinality(famiglie),0)=0 OR g.codice_famiglia=ANY(famiglie))
AND (coalesce(cardinality(sottofamiglie),0)=0 OR g.codice_sottofamiglia=ANY(sottofamiglie))
AND (coalesce(cardinality(marche),0)=0 OR g.marca_codice=ANY(marche))
AND (coalesce(cardinality(fornitori),0)=0 OR g.fornitore_pref_id=ANY(fornitori))
AND (coalesce(cardinality(stati),0)=0 OR coalesce(g.stato_gamma,'in_uso')=ANY(stati))
AND (NOT _filtro_disp OR EXISTS (SELECT 1 FROM public.giacenze_articoli_sede s WHERE s.disponibilita > 0 AND s.chiave_sede = ANY(_chiavi) AND s.articolo_codice = g.codice))
AND (_t IS NULL OR g.codice IN (
  SELECT g2.codice FROM public.articoli_gamma g2 WHERE g2.descrizione ILIKE '%'||_t||'%'
  UNION SELECT g2.codice FROM public.articoli_gamma g2 WHERE g2.codice ILIKE '%'||_t||'%' OR g2.codice_a_barre=_t OR g2.codice_articolo_fornitore ILIKE '%'||_t||'%'
  UNION SELECT f.articolo_codice FROM public.articoli_gamma_fornitori f WHERE f.codice_articolo_fornitore ILIKE '%'||_t||'%'))
UNION ALL
SELECT 'preventivatore',nullif(btrim(a.cod_gamma),''),a.id,a.descrizione,NULL,NULL,NULL,a.um,NULL,NULL,'solo_preventivatore'
FROM public.articoli a WHERE NOT EXISTS(SELECT 1 FROM public.articoli_gamma g WHERE g.codice=btrim(a.cod_gamma))
AND coalesce(cardinality(famiglie),0)=0 AND coalesce(cardinality(sottofamiglie),0)=0 AND coalesce(cardinality(marche),0)=0 AND coalesce(cardinality(fornitori),0)=0
AND (coalesce(cardinality(stati),0)=0 OR 'solo_preventivatore'=ANY(stati)) AND NOT _filtro_disp
AND (_t IS NULL OR a.cod_gamma ILIKE '%'||_t||'%' OR a.descrizione ILIKE '%'||_t||'%' OR a.cod_fornitore ILIKE '%'||_t||'%')
), tot AS MATERIALIZED (SELECT count(*) n FROM base),
-- ordinamento su colonne dell'articolo: pagina sulla base, poi prezzi/giacenze solo per la pagina
pagina AS MATERIALIZED (
  SELECT b.* FROM base b WHERE _art ORDER BY
    CASE WHEN _o='codice' AND NOT _desc THEN b.c_codice END ASC NULLS LAST,
    CASE WHEN _o='codice' AND _desc THEN b.c_codice END DESC NULLS LAST,
    CASE WHEN _o='descrizione' AND NOT _desc THEN b.c_descr END ASC NULLS LAST,
    CASE WHEN _o='descrizione' AND _desc THEN b.c_descr END DESC NULLS LAST,
    CASE WHEN _o='marca' AND NOT _desc THEN b.c_marca END ASC NULLS LAST,
    CASE WHEN _o='marca' AND _desc THEN b.c_marca END DESC NULLS LAST,
    CASE WHEN _o='famiglia' AND NOT _desc THEN b.c_fam END ASC NULLS LAST,
    CASE WHEN _o='famiglia' AND _desc THEN b.c_fam END DESC NULLS LAST,
    CASE WHEN _o='stato' AND NOT _desc THEN b.c_stato END ASC NULLS LAST,
    CASE WHEN _o='stato' AND _desc THEN b.c_stato END DESC NULLS LAST,
    b.c_codice ASC NULLS LAST, b.c_pid
  LIMIT _lim OFFSET _off
), sel AS MATERIALIZED (
  SELECT * FROM pagina WHERE _art UNION ALL SELECT * FROM base WHERE NOT _art
), codici AS MATERIALIZED (
  SELECT CASE WHEN NOT _art AND _nessun_filtro THEN NULL ELSE coalesce(array_agg(x.c_codice) FILTER (WHERE x.c_origine='gamma'), '{}'::text[]) END arr FROM sel x
), pr AS MATERIALIZED (
  SELECT pv.articolo_codice ac, pv.prezzo p, pv.fonte f FROM public._prezzo_vendita_articoli(_l, _s, NULL, (SELECT arr FROM codici)) pv
), st AS MATERIALIZED (
  SELECT s.articolo_codice ac,
    sum(s.giacenza) FILTER (WHERE NOT s.logistica AND (v.globale OR s.store_id = _s)) g_sede,
    sum(s.giacenza) FILTER (WHERE s.logistica) g_logi
  FROM public.giacenze_articoli_sede s, codici k WHERE k.arr IS NULL OR s.articolo_codice = ANY(k.arr)
  GROUP BY 1
), c AS (
  SELECT x.*,
    CASE WHEN x.c_origine='gamma' THEN pr.p END c_prezzo, CASE WHEN x.c_origine='gamma' AND pr.p IS NOT NULL THEN pr.f END c_fonte,
    CASE WHEN x.c_origine='gamma' THEN coalesce(st.g_sede,0) END c_gs, CASE WHEN x.c_origine='gamma' THEN coalesce(st.g_logi,0) END c_gl
  FROM sel x LEFT JOIN pr ON pr.ac=x.c_codice AND x.c_origine='gamma' LEFT JOIN st ON st.ac=x.c_codice AND x.c_origine='gamma'
), ordinati AS MATERIALIZED (
  SELECT c.* FROM c ORDER BY
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
    c.c_codice ASC NULLS LAST, c.c_pid
  LIMIT CASE WHEN _art THEN NULL ELSE _lim END OFFSET CASE WHEN _art THEN 0 ELSE _off END
)
SELECT o.c_origine,o.c_codice,coalesce(o.c_pid,(SELECT a.id FROM public.articoli a WHERE btrim(a.cod_gamma)=o.c_codice ORDER BY a.id LIMIT 1)),o.c_descr,o.c_marca,o.c_fam,o.c_sottofam,o.c_um,o.c_um2,o.c_fc,
  o.c_prezzo,o.c_fonte,o.c_gs,o.c_gl,o.c_stato,(SELECT n FROM tot)
FROM ordinati o;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.cerca_articoli(text,text[],text[],text[],uuid[],text[],uuid[],boolean,smallint,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_articoli(text,text[],text[],text[],uuid[],text[],uuid[],boolean,smallint,text,text,integer,integer) TO authenticated, service_role;