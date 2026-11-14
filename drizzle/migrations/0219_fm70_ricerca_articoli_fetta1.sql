CREATE FUNCTION public.normalizza_testo_ricerca(_t text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE
  _r text := lower(coalesce(_t,''));
  _m text[]; _n numeric; _p numeric;
BEGIN
  _r := regexp_replace(_r, '([0-9]),(?=[0-9])', '\1.', 'g');
  _r := regexp_replace(_r, '([0-9])[[:space:]]*x[[:space:]]*(?=[0-9])', '\1x', 'g');
  _r := btrim(regexp_replace(_r, '[[:space:]]+', ' ', 'g'));
  FOR _m IN SELECT regexp_matches(_r, '(?<![0-9.])([0-9]+)x([0-9]+)(?![0-9.])', 'g') LOOP
    _n := _m[1]::numeric; _p := _m[2]::numeric;
    IF _n>=100 AND _p>=100 AND mod(_n,10)=0 AND mod(_p,10)=0 THEN
      _r := _r||' '||trunc(_n/10)::text||'x'||trunc(_p/10)::text;
    END IF;
  END LOOP;
  RETURN _r;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.normalizza_testo_ricerca(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalizza_testo_ricerca(text) TO authenticated, service_role;

ALTER TABLE public.articoli_gamma ADD COLUMN testo_ricerca text;
CREATE FUNCTION public.articoli_gamma_testo_ricerca() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  NEW.testo_ricerca := public.normalizza_testo_ricerca(
    coalesce(NEW.codice,'')||' '||coalesce(NEW.descrizione,'')||' '||coalesce(NEW.descrizione_estesa,'')||' '||
    coalesce(NEW.marca_codice,'')||' '||coalesce((SELECT m.descrizione FROM public.marche m WHERE m.codice=NEW.marca_codice),'')||' '||
    coalesce(NEW.codice_articolo_fornitore,'')||' '||coalesce(NEW.codice_a_barre,''));
  RETURN NEW;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.articoli_gamma_testo_ricerca() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.articoli_gamma_testo_ricerca() TO authenticated, service_role;
CREATE TRIGGER trg_articoli_gamma_testo_ricerca BEFORE INSERT OR UPDATE ON public.articoli_gamma
FOR EACH ROW EXECUTE FUNCTION public.articoli_gamma_testo_ricerca();
UPDATE public.articoli_gamma SET testo_ricerca=public.normalizza_testo_ricerca(codice);
CREATE INDEX articoli_gamma_testo_ricerca_trgm ON public.articoli_gamma USING gin (testo_ricerca gin_trgm_ops);

DROP FUNCTION public.cerca_articoli(text, text[], text[], text[], uuid[], text[], uuid[], boolean, smallint, text, text, integer, integer, text[], boolean);
CREATE FUNCTION public.cerca_articoli(testo text DEFAULT ''::text, famiglie text[] DEFAULT NULL::text[], sottofamiglie text[] DEFAULT NULL::text[], marche text[] DEFAULT NULL::text[], fornitori uuid[] DEFAULT NULL::uuid[], stati text[] DEFAULT NULL::text[], disponibile_in uuid[] DEFAULT NULL::uuid[], disponibile_logistica boolean DEFAULT false, listino smallint DEFAULT 10, _ordina text DEFAULT 'codice'::text, _direzione text DEFAULT 'asc'::text, limite integer DEFAULT 100, "offset" integer DEFAULT 0, coppie text[] DEFAULT '{}'::text[], solo_gamma boolean DEFAULT false, _sede_giacenza uuid DEFAULT NULL)
 RETURNS TABLE(origine text, codice text, preventivatore_id uuid, descrizione text, marca text, famiglia text, sottofamiglia text, um text, um2 text, fattore_conversione numeric, prezzo numeric, fonte_prezzo text, giacenza_sede numeric, giacenza_logistica numeric, stato_gamma text, totale bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '24MB'
AS $function$
DECLARE
  v record; _l smallint; _s uuid;
  _o text := CASE WHEN _ordina IN ('codice','descrizione','marca','famiglia','prezzo','giacenza_sede','giacenza_logistica','stato','rilevanza') THEN _ordina ELSE 'codice' END;
  _desc boolean := lower(coalesce(_direzione,'asc')) = 'desc';
  _filtro_disp boolean := coalesce(cardinality(disponibile_in),0) > 0 OR coalesce(disponibile_logistica,false);
  _chiavi text[];
  _t text := nullif(btrim(testo),'');
  _norm text := btrim(public.normalizza_testo_ricerca(testo));
  _tokens text[];
  _patterns text[];
  _prefix text;
  _lim integer := least(200,greatest(1,coalesce(limite,100)));
  _off integer := greatest(0,coalesce(cerca_articoli."offset",0));
  _art boolean;
  _nessun_filtro boolean := nullif(btrim(testo),'') IS NULL AND NOT (coalesce(cardinality(disponibile_in),0) > 0 OR coalesce(disponibile_logistica,false)) AND coalesce(cardinality(famiglie),0)=0 AND coalesce(cardinality(sottofamiglie),0)=0 AND coalesce(cardinality(marche),0)=0 AND coalesce(cardinality(fornitori),0)=0 AND coalesce(cardinality(stati),0)=0 AND coalesce(cardinality(coppie),0)=0;
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

_tokens := CASE WHEN _norm='' THEN '{}'::text[] ELSE string_to_array(_norm,' ') END;
SELECT coalesce(array_agg(replace(replace(replace(t, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') ORDER BY n), '{}'::text[])
INTO _patterns FROM unnest(_tokens) WITH ORDINALITY AS token(t,n);
_prefix := replace(replace(replace(lower(coalesce(_t,'')), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
_art := _o IN ('codice','descrizione','marca','famiglia','stato','rilevanza');
RETURN QUERY WITH base AS MATERIALIZED (
SELECT 'gamma'::text o, g.codice cod, NULL::uuid pid,
  CASE _o WHEN 'descrizione' THEN g.descrizione WHEN 'marca' THEN m.descrizione WHEN 'famiglia' THEN g.famiglia WHEN 'stato' THEN coalesce(g.stato_gamma,'in_uso') END k,
  CASE WHEN _o='rilevanza' THEN CASE
    WHEN lower(g.codice)=lower(_t) OR g.codice_a_barre=testo THEN 0
    WHEN _t IS NOT NULL AND lower(g.codice) LIKE _prefix||'%' ESCAPE E'\\' THEN 1
    WHEN g.testo_ricerca LIKE _patterns[1]||'%' ESCAPE E'\\' THEN 2 ELSE 3 END END tier,
  CASE WHEN _o='rilevanza' THEN coalesce(g.stato_gamma='in_esaurimento',false) END esaurimento,
  CASE WHEN _o='rilevanza' THEN EXISTS (SELECT 1 FROM public.giacenze_articoli_sede s
    WHERE s.articolo_codice=g.codice AND s.disponibilita>0
    AND (_sede_giacenza IS NULL OR (s.store_id=_sede_giacenza AND NOT s.logistica))) END disponibile,
  CASE WHEN _o='rilevanza' THEN similarity(g.testo_ricerca,_norm) END sim
FROM public.articoli_gamma g LEFT JOIN public.marche m ON m.codice=g.marca_codice
WHERE g.attivo AND (coalesce(cardinality(famiglie),0)=0 OR g.codice_famiglia=ANY(famiglie) OR (g.codice_famiglia IS NULL AND '__none__'=ANY(famiglie)))
AND (coalesce(cardinality(sottofamiglie),0)=0 OR g.codice_sottofamiglia=ANY(sottofamiglie))
AND (coalesce(cardinality(marche),0)=0 OR g.marca_codice=ANY(marche) OR (g.marca_codice IS NULL AND '__none__'=ANY(marche)))
AND (coalesce(cardinality(coppie),0)=0 OR (coalesce(g.codice_famiglia,'')||'|'||coalesce(g.codice_sottofamiglia,''))=ANY(coppie))
AND (coalesce(cardinality(fornitori),0)=0 OR g.fornitore_pref_id=ANY(fornitori))
AND (coalesce(cardinality(stati),0)=0 OR coalesce(g.stato_gamma,'in_uso')=ANY(stati))
AND (NOT _filtro_disp OR EXISTS (SELECT 1 FROM public.giacenze_articoli_sede s WHERE s.disponibilita > 0 AND s.chiave_sede = ANY(_chiavi) AND s.articolo_codice = g.codice))
AND (_norm='' OR g.codice_a_barre=testo OR NOT EXISTS (
  SELECT 1 FROM unnest(_patterns) token(pat)
  WHERE NOT (g.testo_ricerca LIKE '%'||token.pat||'%' ESCAPE E'\\'
    OR EXISTS (SELECT 1 FROM public.articoli_gamma_fornitori f WHERE f.articolo_codice=g.codice
      AND f.codice_articolo_fornitore ILIKE '%'||token.pat||'%' ESCAPE E'\\'))))
UNION ALL
SELECT 'preventivatore', nullif(btrim(a.cod_gamma),''), a.id,
  CASE _o WHEN 'descrizione' THEN a.descrizione WHEN 'stato' THEN 'solo_preventivatore' END,
  CASE WHEN _o='rilevanza' THEN CASE WHEN lower(a.cod_gamma)=lower(_t) THEN 0
    WHEN _t IS NOT NULL AND lower(a.cod_gamma) LIKE _prefix||'%' ESCAPE E'\\' THEN 1
    WHEN lower(coalesce(a.cod_gamma,'')||' '||a.descrizione||' '||coalesce(a.cod_fornitore,'')) LIKE _patterns[1]||'%' ESCAPE E'\\' THEN 2 ELSE 3 END END,
  CASE WHEN _o='rilevanza' THEN false END, CASE WHEN _o='rilevanza' THEN false END,
  CASE WHEN _o='rilevanza' THEN similarity(lower(coalesce(a.cod_gamma,'')||' '||a.descrizione||' '||coalesce(a.cod_fornitore,'')),_norm) END
FROM public.articoli a WHERE NOT coalesce(solo_gamma,false) AND coalesce(cardinality(coppie),0)=0 AND NOT EXISTS(SELECT 1 FROM public.articoli_gamma g WHERE g.codice=btrim(a.cod_gamma))
AND coalesce(cardinality(famiglie),0)=0 AND coalesce(cardinality(sottofamiglie),0)=0 AND coalesce(cardinality(marche),0)=0 AND coalesce(cardinality(fornitori),0)=0
AND (coalesce(cardinality(stati),0)=0 OR 'solo_preventivatore'=ANY(stati)) AND NOT _filtro_disp
AND (_norm='' OR NOT EXISTS (SELECT 1 FROM unnest(_patterns) token(pat)
  WHERE lower(coalesce(a.cod_gamma,'')||' '||a.descrizione||' '||coalesce(a.cod_fornitore,'')) NOT LIKE '%'||token.pat||'%' ESCAPE E'\\'))
), tot AS MATERIALIZED (SELECT count(*) n FROM base),
pagina AS MATERIALIZED (
  SELECT b.o, b.cod, b.pid, b.k, b.tier, b.esaurimento, b.disponibile, b.sim FROM base b WHERE _art ORDER BY
    CASE WHEN _o='rilevanza' THEN b.tier END ASC,
    CASE WHEN _o='rilevanza' THEN b.esaurimento END ASC,
    CASE WHEN _o='rilevanza' THEN b.disponibile END DESC,
    CASE WHEN _o='rilevanza' THEN b.sim END DESC,
    CASE WHEN NOT _desc THEN b.k END ASC NULLS LAST,
    CASE WHEN _desc THEN b.k END DESC NULLS LAST,
    CASE WHEN _o='codice' AND NOT _desc THEN b.cod END ASC NULLS LAST,
    CASE WHEN _o='codice' AND _desc THEN b.cod END DESC NULLS LAST,
    b.cod ASC NULLS LAST, b.pid
  LIMIT _lim OFFSET _off
), cand AS (
  SELECT x.o, x.cod, x.pid, x.k, x.tier, x.esaurimento, x.disponibile, x.sim FROM pagina x WHERE _art UNION ALL SELECT b.o, b.cod, b.pid, b.k, b.tier, b.esaurimento, b.disponibile, b.sim FROM base b WHERE NOT _art
), codici AS MATERIALIZED (
  SELECT CASE WHEN NOT _art AND _nessun_filtro THEN NULL ELSE coalesce(array_agg(x.cod) FILTER (WHERE x.o='gamma'), '{}'::text[]) END arr FROM cand x
), pr AS MATERIALIZED (
  SELECT pv.articolo_codice ac, pv.prezzo p, pv.fonte f FROM public._prezzo_vendita_articoli(_l, _s, NULL, (SELECT arr FROM codici)) pv
), st AS MATERIALIZED (
  SELECT s.articolo_codice ac,
    sum(s.giacenza) FILTER (WHERE NOT s.logistica AND ((_sede_giacenza IS NOT NULL AND s.store_id=_sede_giacenza) OR (_sede_giacenza IS NULL AND (v.globale OR s.store_id = _s)))) g_sede,
    sum(s.giacenza) FILTER (WHERE s.logistica) g_logi
  FROM public.giacenze_articoli_sede s
  WHERE (SELECT k.arr IS NULL FROM codici k) OR s.articolo_codice IN (SELECT unnest(k.arr) FROM codici k)
  GROUP BY 1
), c AS (
  SELECT x.o, x.cod, x.pid, x.k, x.tier, x.esaurimento, x.disponibile, x.sim,
    CASE WHEN x.o='gamma' THEN pr.p END p, CASE WHEN x.o='gamma' AND pr.p IS NOT NULL THEN pr.f END f,
    CASE WHEN x.o='gamma' THEN coalesce(st.g_sede,0) END gs, CASE WHEN x.o='gamma' THEN coalesce(st.g_logi,0) END gl
  FROM cand x LEFT JOIN pr ON pr.ac=x.cod AND x.o='gamma' LEFT JOIN st ON st.ac=x.cod AND x.o='gamma'
), ordinati AS MATERIALIZED (
  SELECT c.* FROM c ORDER BY
    CASE WHEN _o='rilevanza' THEN c.tier END ASC,
    CASE WHEN _o='rilevanza' THEN c.esaurimento END ASC,
    CASE WHEN _o='rilevanza' THEN c.disponibile END DESC,
    CASE WHEN _o='rilevanza' THEN c.sim END DESC,
    CASE WHEN _art AND NOT _desc THEN c.k END ASC NULLS LAST,
    CASE WHEN _art AND _desc THEN c.k END DESC NULLS LAST,
    CASE WHEN _o='codice' AND NOT _desc THEN c.cod END ASC NULLS LAST,
    CASE WHEN _o='codice' AND _desc THEN c.cod END DESC NULLS LAST,
    CASE WHEN _o='prezzo' AND NOT _desc THEN c.p END ASC NULLS LAST,
    CASE WHEN _o='prezzo' AND _desc THEN c.p END DESC NULLS LAST,
    CASE WHEN _o='giacenza_sede' AND NOT _desc THEN c.gs END ASC NULLS LAST,
    CASE WHEN _o='giacenza_sede' AND _desc THEN c.gs END DESC NULLS LAST,
    CASE WHEN _o='giacenza_logistica' AND NOT _desc THEN c.gl END ASC NULLS LAST,
    CASE WHEN _o='giacenza_logistica' AND _desc THEN c.gl END DESC NULLS LAST,
    c.cod ASC NULLS LAST, c.pid
  LIMIT CASE WHEN _art THEN NULL ELSE _lim END OFFSET CASE WHEN _art THEN 0 ELSE _off END
)
SELECT r.o, r.cod,
  coalesce(r.pid,(SELECT a2.id FROM public.articoli a2 WHERE btrim(a2.cod_gamma)=r.cod ORDER BY a2.id LIMIT 1)),
  CASE WHEN r.o='gamma' THEN g.descrizione ELSE a.descrizione END,
  CASE WHEN r.o='gamma' THEN m.descrizione END,
  g.famiglia, g.sottofamiglia,
  CASE WHEN r.o='gamma' THEN g.um ELSE a.um END,
  g.um2, g.fattore_conversione,
  r.p, r.f, r.gs, r.gl,
  CASE WHEN r.o='gamma' THEN coalesce(g.stato_gamma,'in_uso') ELSE 'solo_preventivatore' END,
  (SELECT t.n FROM tot t)
FROM ordinati r
LEFT JOIN public.articoli_gamma g ON r.o='gamma' AND g.codice=r.cod
LEFT JOIN public.marche m ON m.codice=g.marca_codice
LEFT JOIN public.articoli a ON r.o='preventivatore' AND a.id=r.pid
ORDER BY CASE WHEN _o='rilevanza' THEN r.tier END ASC,
    CASE WHEN _o='rilevanza' THEN r.esaurimento END ASC,
    CASE WHEN _o='rilevanza' THEN r.disponibile END DESC,
    CASE WHEN _o='rilevanza' THEN r.sim END DESC,
    CASE WHEN _art AND NOT _desc THEN r.k END ASC NULLS LAST,
    CASE WHEN _art AND _desc THEN r.k END DESC NULLS LAST,
    CASE WHEN _o='codice' AND NOT _desc THEN r.cod END ASC NULLS LAST,
    CASE WHEN _o='codice' AND _desc THEN r.cod END DESC NULLS LAST,
    CASE WHEN _o='prezzo' AND NOT _desc THEN r.p END ASC NULLS LAST,
    CASE WHEN _o='prezzo' AND _desc THEN r.p END DESC NULLS LAST,
    CASE WHEN _o='giacenza_sede' AND NOT _desc THEN r.gs END ASC NULLS LAST,
    CASE WHEN _o='giacenza_sede' AND _desc THEN r.gs END DESC NULLS LAST,
    CASE WHEN _o='giacenza_logistica' AND NOT _desc THEN r.gl END ASC NULLS LAST,
    CASE WHEN _o='giacenza_logistica' AND _desc THEN r.gl END DESC NULLS LAST,
    r.cod ASC NULLS LAST, r.pid;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.cerca_articoli(text, text[], text[], text[], uuid[], text[], uuid[], boolean, smallint, text, text, integer, integer, text[], boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_articoli(text, text[], text[], text[], uuid[], text[], uuid[], boolean, smallint, text, text, integer, integer, text[], boolean, uuid) TO authenticated, service_role;