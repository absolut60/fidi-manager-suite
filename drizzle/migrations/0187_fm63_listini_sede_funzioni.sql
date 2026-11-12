-- FM63 Fetta 1: listino di riferimento per sede e prezzi visibili nella scheda articolo.
-- (La migrazione 0186_fm63_listini_sede è vuota per errore: contiene solo un commento.)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS listino_riferimento smallint NULL REFERENCES public.listini_gamma(codice);
COMMENT ON COLUMN public.stores.listino_riferimento IS 'Listino Gamma di vendita e d''acquisto della sede (FM63)';
UPDATE public.stores SET listino_riferimento = CASE WHEN codice IN ('1','2','3','5','6') THEN 10 WHEN codice IN ('4','7','9') THEN 20 WHEN codice = '8' THEN 30 ELSE NULL END
  WHERE listino_riferimento IS DISTINCT FROM CASE WHEN codice IN ('1','2','3','5','6') THEN 10 WHEN codice IN ('4','7','9') THEN 20 WHEN codice = '8' THEN 30 ELSE NULL END;

-- Regola di visibilità listini (unica): amministratore, utente senza sede o sede senza listino → globale.
CREATE OR REPLACE FUNCTION public.auth_listini_sede()
RETURNS TABLE(globale boolean, store_id uuid, listino smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.has_role(auth.uid(), 'amministratore') OR p.sid IS NULL OR s.listino_riferimento IS NULL) AS globale,
         p.sid, s.listino_riferimento
  FROM (SELECT public.profilo_store_id_corrente() AS sid) p
  LEFT JOIN public.stores s ON s.id = p.sid
$$;
REVOKE EXECUTE ON FUNCTION public.auth_listini_sede() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_listini_sede() TO authenticated, service_role;

-- Unica fonte del prezzo mostrato nella scheda articolo: il prezzo per deposito (priorità 55) sostituisce il listino.
CREATE OR REPLACE FUNCTION public.listini_articolo_visibili(_codice text)
RETURNS TABLE(listino smallint, listino_descrizione text, store_id uuid, sede_nome text, deposito_codice text,
  prezzo_listino numeric, prezzo_deposito numeric, prezzo numeric, fonte text,
  acq_prezzo numeric, acq_sc1 numeric, acq_sc2 numeric, acq_sc3 numeric, acq_trasporto_perc numeric, acq_trasporto_euro numeric, costo_acquisto numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  IF NOT coalesce(public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi(), false) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.auth_listini_sede();
  RETURN QUERY
  WITH vis AS MATERIALIZED (
    SELECT DISTINCT s.listino_riferimento AS l FROM public.stores s
    WHERE s.listino_riferimento IS NOT NULL AND (v.globale OR s.listino_riferimento = v.listino)
  ), dep AS MATERIALIZED (
    SELECT DISTINCT ON (pd.listino, d.store_id) pd.listino AS l, d.store_id AS sid, st.nome, pd.deposito_codice AS dc, pd.prezzo_netto
    FROM public.prezzi_deposito_gamma pd
    JOIN public.depositi d ON d.codice = pd.deposito_codice
    JOIN public.stores st ON st.id = d.store_id
    WHERE pd.articolo_codice = _codice AND pd.listino IN (SELECT vis.l FROM vis)
      AND (v.globale OR d.store_id = v.store_id)
    ORDER BY pd.listino, d.store_id, pd.valido_dal DESC NULLS LAST, pd.deposito_codice
  ), base AS MATERIALIZED (
    SELECT vis.l, lg.descrizione, a.prezzo_vendita, a.acq_prezzo, a.acq_sc1, a.acq_sc2, a.acq_sc3, a.acq_trasporto_perc, a.acq_trasporto_euro, a.costo_acquisto
    FROM vis
    JOIN public.listini_gamma lg ON lg.codice = vis.l
    LEFT JOIN public.articoli_gamma_listini a ON a.articolo_codice = _codice AND a.listino = vis.l
  ), righe AS (
    SELECT b.l, b.descrizione, NULL::uuid AS sid, NULL::text AS nome, NULL::text AS dc, b.prezzo_vendita AS pl, NULL::numeric AS pd, b.prezzo_vendita AS p, 'listino'::text AS f,
           b.acq_prezzo, b.acq_sc1, b.acq_sc2, b.acq_sc3, b.acq_trasporto_perc, b.acq_trasporto_euro, b.costo_acquisto
    FROM base b WHERE v.globale
    UNION ALL
    SELECT b.l, b.descrizione, dep.sid, dep.nome, dep.dc, b.prezzo_vendita, dep.prezzo_netto, dep.prezzo_netto, 'deposito'::text,
           b.acq_prezzo, b.acq_sc1, b.acq_sc2, b.acq_sc3, b.acq_trasporto_perc, b.acq_trasporto_euro, b.costo_acquisto
    FROM base b JOIN dep ON dep.l = b.l WHERE v.globale
    UNION ALL
    SELECT b.l, b.descrizione, v.store_id, st.nome, dep.dc, b.prezzo_vendita, dep.prezzo_netto, coalesce(dep.prezzo_netto, b.prezzo_vendita),
           CASE WHEN dep.prezzo_netto IS NOT NULL THEN 'deposito' ELSE 'listino' END,
           b.acq_prezzo, b.acq_sc1, b.acq_sc2, b.acq_sc3, b.acq_trasporto_perc, b.acq_trasporto_euro, b.costo_acquisto
    FROM base b LEFT JOIN public.stores st ON st.id = v.store_id LEFT JOIN dep ON dep.l = b.l AND dep.sid = v.store_id
    WHERE NOT v.globale
  )
  SELECT r.l, r.descrizione, r.sid, r.nome, r.dc, r.pl, r.pd, r.p, r.f,
         r.acq_prezzo, r.acq_sc1, r.acq_sc2, r.acq_sc3, r.acq_trasporto_perc, r.acq_trasporto_euro, r.costo_acquisto
  FROM righe r ORDER BY r.l, r.sid IS NOT NULL, r.nome;
END $$;
REVOKE EXECUTE ON FUNCTION public.listini_articolo_visibili(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listini_articolo_visibili(text) TO authenticated, service_role;