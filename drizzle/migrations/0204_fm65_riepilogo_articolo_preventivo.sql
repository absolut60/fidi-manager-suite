CREATE OR REPLACE FUNCTION public.riepilogo_articolo_preventivo(_cliente_id uuid, _codice text)
RETURNS TABLE(
  codice text, descrizione text, marca text, famiglia text, sottofamiglia text,
  attivo boolean, stato_gamma text, um text, um2 text, fattore_conversione numeric,
  listino_cliente smallint, sede_cliente_id uuid, sede_cliente_nome text,
  acq_prezzo numeric, acq_sc1 numeric, acq_sc2 numeric, acq_sc3 numeric,
  acq_trasporto_perc numeric, acq_trasporto_euro numeric, costo_acquisto numeric, costo_ultimo numeric,
  giacenza_sede_cliente numeric, giacenza_logistica numeric, giacenza_totale_sedi numeric, ordinato_fornitori numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE v_listino smallint; v_store uuid; v_sede text;
BEGIN
  IF NOT public.auth_ha_accesso_preventivi() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;
  -- Listino del cliente: stessa fonte del preventivo (condizioni_preventivo_cliente).
  SELECT c.listino INTO v_listino FROM public.condizioni_preventivo_cliente(_cliente_id) c LIMIT 1;
  SELECT cl.store_id, s.nome INTO v_store, v_sede
  FROM public.clienti cl LEFT JOIN public.stores s ON s.id = cl.store_id WHERE cl.id = _cliente_id;

  RETURN QUERY
  WITH g AS MATERIALIZED (
    SELECT * FROM public._giacenze_articoli_catalogo(_codice) x WHERE x.conta_totale
  )
  SELECT ag.codice, ag.descrizione, coalesce(m.descrizione, ag.marca_codice), ag.famiglia, ag.sottofamiglia,
         ag.attivo, ag.stato_gamma, ag.um, ag.um2, ag.fattore_conversione,
         v_listino, v_store, v_sede,
         l.acq_prezzo, l.acq_sc1, l.acq_sc2, l.acq_sc3, l.acq_trasporto_perc, l.acq_trasporto_euro, l.costo_acquisto,
         ag.costo_ultimo,
         CASE WHEN v_store IS NULL THEN NULL
              ELSE coalesce((SELECT sum(g.giacenza) FROM g WHERE g.conta_disponibilita = 'si' AND g.store_id = v_store), 0) END,
         (SELECT sum(g.giacenza) FROM g WHERE g.conta_disponibilita = 'logistica_comune'),
         coalesce((SELECT sum(g.giacenza) FROM g WHERE g.conta_disponibilita = 'si'), 0),
         coalesce((SELECT sum(g.ordinato_fornitori) FROM g), 0)
  FROM public.articoli_gamma ag
  LEFT JOIN public.marche m ON m.codice = ag.marca_codice
  LEFT JOIN public.articoli_gamma_listini l ON l.articolo_codice = ag.codice AND l.listino = v_listino
  WHERE ag.codice = btrim(_codice);
END;
$function$;

REVOKE ALL ON FUNCTION public.riepilogo_articolo_preventivo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.riepilogo_articolo_preventivo(uuid, text) TO authenticated, service_role;