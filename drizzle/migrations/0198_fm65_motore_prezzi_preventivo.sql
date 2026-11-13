-- FM65 fetta 1: motore prezzi del preventivo (catena Gamma LI01). Il prezzo segue il cliente.
CREATE OR REPLACE FUNCTION public._prezzo_preventivo_articoli(
  _listino smallint, _store_id uuid, _macrocategoria text, _categoria text, _sottocategoria text,
  _cliente_codice integer, _listino_piu_articoli text, _codici text[], _data date)
RETURNS TABLE(articolo_codice text, listino smallint, deposito_codice text, prezzo_listino numeric,
  prezzo_base numeric, fonte_prezzo text, sc1 numeric, sc2 numeric, sc3 numeric, sc4 numeric,
  sc5 numeric, sc6 numeric, maggiorazione_perc numeric, prezzo_netto numeric, regole text[],
  avvisi text[], um text, costo_ultimo numeric)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH k AS (
    SELECT DISTINCT ON (u.c) u.c, u.o FROM unnest(_codici) WITH ORDINALITY u(c, o)
    WHERE u.c IS NOT NULL ORDER BY u.c, u.o
  ), pv AS (
    SELECT x.* FROM public._prezzo_vendita_articoli(_listino, _store_id, NULL, _codici) x
    WHERE _listino IS NOT NULL
  ), cat AS (
    SELECT s.*, (nullif(s.sottocategoria, '') IS NOT DISTINCT FROM nullif(_sottocategoria, '')) AS esatta
    FROM public.sconti_categoria_gamma s
    WHERE s.macrocategoria = _macrocategoria AND s.categoria = _categoria
      AND (nullif(s.sottocategoria, '') IS NOT DISTINCT FROM nullif(_sottocategoria, '')
           OR nullif(s.sottocategoria, '') IS NULL)
      AND (s.listino IS NULL OR s.listino = _listino)
      AND (s.valido_dal IS NULL OR s.valido_dal <= _data)
      AND (s.valido_al IS NULL OR s.valido_al >= _data)
    ORDER BY esatta DESC, (s.listino IS NOT NULL) DESC, s.valido_dal DESC NULLS LAST, s.id DESC
    LIMIT 1
  ), famv AS (
    SELECT f.*,
      ((f.da_famiglia IS NOT NULL AND f.a_famiglia IS NOT NULL AND f.da_famiglia <> f.a_famiglia)
       OR (nullif(f.da_sottofamiglia, '') IS NOT NULL AND nullif(f.a_sottofamiglia, '') IS NOT NULL
           AND f.da_sottofamiglia <> f.a_sottofamiglia)) AS intervallo
    FROM public.sconti_cliente_famiglia_gamma f
    WHERE _cliente_codice IS NOT NULL AND f.cliente_codice = _cliente_codice
      AND (f.valido_dal IS NULL OR f.valido_dal <= _data)
      AND (f.valido_al IS NULL OR f.valido_al >= _data)
  ), rng AS (SELECT EXISTS (SELECT 1 FROM famv WHERE intervallo) AS c)
  SELECT k.c, _listino, pv.deposito_codice, pv.prezzo_listino, l6.p, l6.fonte,
         l6.s[1], l6.s[2], l6.s[3], l6.s[4], l6.s[5], l6.s[6], l6.m,
         round(l6.p * (1 - l6.s[1]/100) * (1 - l6.s[2]/100) * (1 - l6.s[3]/100)
               * (1 - l6.s[4]/100) * (1 - l6.s[5]/100) * (1 - l6.s[6]/100) * (1 + l6.m/100), 4),
         array_remove(ARRAY[
           CASE WHEN cat.id IS NOT NULL THEN 'categoria ' || cat.macrocategoria || '/' || cat.categoria
             || CASE WHEN cat.esatta AND nullif(cat.sottocategoria, '') IS NOT NULL THEN '/' || cat.sottocategoria
                     WHEN NOT cat.esatta THEN ' (sottocategoria ' || _sottocategoria || ' senza regola)' ELSE '' END END,
           CASE WHEN f.id IS NOT NULL THEN 'famiglia ' || coalesce(f.a_famiglia, f.da_famiglia)
             || coalesce('/' || nullif(coalesce(f.a_sottofamiglia, f.da_sottofamiglia), ''), '') || ' '
             || trim_scale(coalesce(f.sc1, 0)) || '%' END,
           CASE WHEN pv.prezzo_deposito IS NOT NULL THEN 'deposito ' || pv.deposito_codice END,
           CASE WHEN p.id IS NOT NULL THEN 'più articoli ' || _listino_piu_articoli END,
           CASE WHEN ca.id IS NOT NULL THEN 'cliente/articolo' END], NULL),
         array_remove(ARRAY[
           CASE WHEN pv.prezzo_listino IS NULL THEN 'articolo_senza_prezzo_su_listino' END,
           CASE WHEN rng.c THEN 'intervallo_famiglia_non_gestito' END,
           CASE WHEN coalesce(cat.sconto_importo, 0) <> 0 OR coalesce(cat.magg_importo, 0) <> 0
                  OR coalesce(ca.sconto_importo, 0) <> 0 THEN 'importo_non_gestito' END], NULL),
         ag.um, ag.costo_ultimo
  FROM k
  CROSS JOIN rng
  LEFT JOIN public.articoli_gamma ag ON ag.codice = k.c
  LEFT JOIN pv ON pv.articolo_codice = k.c
  LEFT JOIN cat ON true
  LEFT JOIN LATERAL (
    SELECT fv.* FROM famv fv
    WHERE NOT fv.intervallo AND coalesce(fv.a_famiglia, fv.da_famiglia) = ag.codice_famiglia
      AND (nullif(coalesce(fv.a_sottofamiglia, fv.da_sottofamiglia), '') IS NULL
           OR coalesce(fv.a_sottofamiglia, fv.da_sottofamiglia) = ag.codice_sottofamiglia)
    ORDER BY (nullif(coalesce(fv.a_sottofamiglia, fv.da_sottofamiglia), '') IS NOT NULL) DESC,
             fv.valido_dal DESC NULLS LAST, fv.id DESC LIMIT 1) f ON true
  LEFT JOIN LATERAL (
    SELECT x.* FROM public.listino_piu_articoli_gamma x
    WHERE _listino_piu_articoli IS NOT NULL AND x.codice_listino = _listino_piu_articoli AND x.articolo_codice = k.c
      AND (x.valido_dal IS NULL OR x.valido_dal <= _data) AND (x.valido_al IS NULL OR x.valido_al >= _data)
    ORDER BY x.valido_dal DESC NULLS LAST, x.id DESC LIMIT 1) p ON true
  LEFT JOIN LATERAL (
    SELECT x.* FROM public.prezzi_cliente_articolo_gamma x
    WHERE _cliente_codice IS NOT NULL AND x.cliente_codice = _cliente_codice AND x.articolo_codice = k.c
      AND (x.valido_dal IS NULL OR x.valido_dal <= _data) AND (x.valido_al IS NULL OR x.valido_al >= _data)
    ORDER BY x.valido_dal DESC NULLS LAST, x.id DESC LIMIT 1) ca ON true
  -- livello 2: categoria (sconti nei primi slot liberi, maggiorazioni sommate)
  CROSS JOIN LATERAL (SELECT
    (ARRAY(SELECT z.v FROM unnest(ARRAY[cat.sc1, cat.sc2, cat.sc4]) WITH ORDINALITY z(v, i)
           WHERE coalesce(z.v, 0) <> 0 ORDER BY z.i) || array_fill(0::numeric, ARRAY[6]))[1:6] AS s,
    coalesce(cat.mag1, 0) + coalesce(cat.mag2, 0) AS m) l2
  -- livello 3: cliente/famiglia (sostituisce slot 1..6)
  CROSS JOIN LATERAL (SELECT CASE WHEN f.id IS NULL THEN l2.s ELSE ARRAY[coalesce(f.sc1, 0), coalesce(f.sc2, 0),
    coalesce(f.sc3, 0), coalesce(f.sc4, 0), coalesce(f.sc5, 0), coalesce(f.sc6, 0)] END AS s) l3
  -- livello 4: deposito (prezzo e slot 1..5 sostituiti, maggiorazione invariata)
  CROSS JOIN LATERAL (SELECT coalesce(pv.prezzo_deposito, pv.prezzo_listino) AS p,
    CASE WHEN pv.prezzo_deposito IS NOT NULL THEN array_fill(0::numeric, ARRAY[5]) || l3.s[6] ELSE l3.s END AS s) l4
  -- livello 5: listino più articoli
  CROSS JOIN LATERAL (SELECT CASE WHEN coalesce(p.prezzo, 0) <> 0 THEN p.prezzo ELSE l4.p END AS p,
    CASE WHEN p.id IS NOT NULL THEN ARRAY[coalesce(p.sc1, 0), 0, 0, 0, 0, l4.s[6]] ELSE l4.s END AS s) l5
  -- livello 6: cliente/articolo
  CROSS JOIN LATERAL (SELECT CASE WHEN coalesce(ca.prezzo, 0) <> 0 THEN ca.prezzo ELSE l5.p END AS p,
    CASE WHEN ca.id IS NOT NULL THEN ARRAY[coalesce(ca.sc1, 0), coalesce(ca.sc2, 0), coalesce(ca.sc3, 0),
      coalesce(ca.sc4, 0), coalesce(ca.sc5, 0), coalesce(ca.sc6, 0)] ELSE l5.s END AS s,
    l2.m + coalesce(ca.mag1, 0) AS m) l6x
  CROSS JOIN LATERAL (SELECT l6x.p, l6x.s, l6x.m,
    CASE WHEN l6x.p IS NULL THEN NULL
         WHEN coalesce(ca.prezzo, 0) <> 0 THEN 'cliente_articolo'
         WHEN coalesce(p.prezzo, 0) <> 0 THEN 'piu_articoli'
         WHEN pv.prezzo_deposito IS NOT NULL THEN 'deposito' ELSE 'listino' END AS fonte) l6
  ORDER BY k.o
$$;
REVOKE EXECUTE ON FUNCTION public._prezzo_preventivo_articoli(smallint, uuid, text, text, text, integer, text, text[], date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._prezzo_preventivo_articoli(smallint, uuid, text, text, text, integer, text, text[], date) TO service_role;

CREATE OR REPLACE FUNCTION public.prezzi_preventivo_cliente(_cliente_id uuid, _codici text[], _data date DEFAULT current_date)
RETURNS TABLE(articolo_codice text, listino smallint, deposito_codice text, prezzo_listino numeric,
  prezzo_base numeric, fonte_prezzo text, sc1 numeric, sc2 numeric, sc3 numeric, sc4 numeric,
  sc5 numeric, sc6 numeric, maggiorazione_perc numeric, prezzo_netto numeric, regole text[],
  avvisi text[], um text, costo_ultimo numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_store uuid; v_trovato boolean; c record;
BEGIN
  IF NOT public.auth_ha_accesso_preventivi() THEN
    RAISE EXCEPTION 'Permesso negato: prezzi del preventivo' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(_codici), 0) > 500 THEN
    RAISE EXCEPTION 'Troppi articoli: massimo 500 codici per richiesta (ricevuti %)', cardinality(_codici)
      USING ERRCODE = '22023';
  END IF;
  SELECT cl.store_id, true INTO v_store, v_trovato FROM public.clienti cl WHERE cl.id = _cliente_id;
  IF NOT coalesce(v_trovato, false) THEN
    RAISE EXCEPTION 'Cliente non trovato' USING ERRCODE = 'P0002';
  END IF;
  SELECT cg.* INTO c FROM public.clienti_condizioni_gamma cg
  WHERE cg.cliente_id = _cliente_id ORDER BY cg.cliente_codice LIMIT 1;

  IF c.listino IS NULL THEN
    RETURN QUERY
    SELECT u.c, NULL::smallint, NULL::text, NULL::numeric, NULL::numeric, NULL::text,
           NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
           NULL::numeric, NULL::numeric, ARRAY[]::text[], ARRAY['cliente_senza_listino']::text[],
           ag.um, ag.costo_ultimo
    FROM (SELECT DISTINCT ON (x.c) x.c, x.o FROM unnest(_codici) WITH ORDINALITY x(c, o)
          WHERE x.c IS NOT NULL ORDER BY x.c, x.o) u
    LEFT JOIN public.articoli_gamma ag ON ag.codice = u.c
    ORDER BY u.o;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.articolo_codice, a.listino, a.deposito_codice, a.prezzo_listino, a.prezzo_base, a.fonte_prezzo,
         a.sc1, a.sc2, a.sc3, a.sc4, a.sc5, a.sc6, a.maggiorazione_perc, a.prezzo_netto, a.regole,
         CASE WHEN v_store IS NULL THEN a.avvisi || 'cliente_senza_sede'::text ELSE a.avvisi END,
         a.um, a.costo_ultimo
  FROM public._prezzo_preventivo_articoli(c.listino, v_store, c.macrocategoria, c.categoria, c.sottocategoria,
         c.cliente_codice, c.listino_piu_articoli, _codici, _data) a;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prezzi_preventivo_cliente(uuid, text[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prezzi_preventivo_cliente(uuid, text[], date) TO authenticated, service_role;