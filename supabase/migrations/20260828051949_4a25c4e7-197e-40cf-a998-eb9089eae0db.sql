CREATE OR REPLACE FUNCTION public.get_sinistri_da_aprire()
RETURNS TABLE(
  cliente_id uuid,
  ragione_sociale text,
  store_nome text,
  scaduto_eur numeric,
  data_scadenza_piu_vecchia date,
  giorni_da_scadenza int,
  giorni_residui_30 int,
  finestra text,
  promessa_data date,
  polizza_id uuid,
  numero_polizza text,
  importo_assicurato numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH cls AS (
    SELECT s.cliente_id, s.importo_scadenza, s.data_scadenza,
      public.is_anticipo(s.numero_documento) AS is_anticipo
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta'
      AND s.data_scadenza IS NOT NULL
      AND s.data_scadenza < CURRENT_DATE
      AND upper(COALESCE(s.codice_pagamento,'')) <> 'BOS'
  ),
  agg AS (
    SELECT cls.cliente_id,
      public.calcola_scaduto(
        COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE NOT cls.is_anticipo),0),
        COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.is_anticipo),0)) AS tot_s,
      MIN(cls.data_scadenza) AS min_scad
    FROM cls GROUP BY cls.cliente_id
  ),
  pol AS (
    SELECT DISTINCT ON (ac.cliente_id)
      ac.cliente_id, ac.id AS polizza_id, ac.numero_polizza, ac.importo_assicurato
    FROM public.assicurazioni_credito ac
    WHERE ac.assicuratore = 'POUEY' AND ac.stato = 'attiva'
    ORDER BY ac.cliente_id, ac.data_inizio DESC NULLS LAST, ac.created_at DESC
  ),
  prom AS (
    SELECT ar.cliente_id, MAX(ar.data_promessa_pagamento) AS promessa_data
    FROM public.azioni_recupero ar
    WHERE ar.esito = 'promessa_pagamento' AND ar.data_promessa_pagamento IS NOT NULL
    GROUP BY ar.cliente_id
  )
  SELECT
    cl.id,
    cl.ragione_sociale,
    st.nome,
    a.tot_s,
    a.min_scad,
    (CURRENT_DATE - a.min_scad)::int,
    (30 - (CURRENT_DATE - a.min_scad))::int,
    CASE
      WHEN (30 - (CURRENT_DATE - a.min_scad)) < 0 THEN 'scaduta'
      WHEN (30 - (CURRENT_DATE - a.min_scad)) <= 7 THEN 'urgente'
      ELSE 'ok'
    END,
    pr.promessa_data,
    p.polizza_id,
    p.numero_polizza,
    p.importo_assicurato
  FROM agg a
  JOIN public.clienti cl ON cl.id = a.cliente_id
  JOIN pol p ON p.cliente_id = cl.id
  LEFT JOIN public.stores st ON st.id = cl.store_id
  LEFT JOIN prom pr ON pr.cliente_id = cl.id
  WHERE a.tot_s > 0
    AND NOT COALESCE(cl.in_gestione_legale, false)
  ORDER BY (30 - (CURRENT_DATE - a.min_scad)) ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sinistri_da_aprire() TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.apri_sinistro_pouey(_polizza_id uuid, _importo_sinistro numeric, _nota text DEFAULT NULL)
RETURNS public.assicurazioni_credito
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pol public.assicurazioni_credito;
BEGIN
  IF NOT (public.has_role(auth.uid(),'amministratore'::app_role)
          OR public.has_role(auth.uid(),'amministrazione'::app_role)) THEN
    RAISE EXCEPTION 'Non autorizzato ad aprire sinistri';
  END IF;

  SELECT * INTO v_pol FROM public.assicurazioni_credito WHERE id = _polizza_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Polizza non trovata';
  END IF;
  IF v_pol.assicuratore <> 'POUEY' THEN
    RAISE EXCEPTION 'La polizza non e'' POUEY';
  END IF;
  IF v_pol.stato = 'sinistro_aperto' THEN
    RAISE EXCEPTION 'Sinistro già aperto per questa polizza';
  END IF;

  UPDATE public.assicurazioni_credito
  SET stato = 'sinistro_aperto',
      sinistro_aperto = true,
      data_apertura_sinistro = CURRENT_DATE,
      importo_sinistro = _importo_sinistro,
      note_sinistro = COALESCE(_nota, note_sinistro),
      updated_at = now()
  WHERE id = _polizza_id
  RETURNING * INTO v_pol;

  INSERT INTO public.azioni_recupero (cliente_id, tipo, esito, data_azione, importo_riferimento, note)
  VALUES (v_pol.cliente_id, 'sinistro_assicurazione', 'fatto', now(), _importo_sinistro,
          concat('Apertura sinistro POUEY. ', COALESCE(_nota,'')));

  RETURN v_pol;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apri_sinistro_pouey(uuid, numeric, text) TO authenticated, service_role, supabase_read_only_user;