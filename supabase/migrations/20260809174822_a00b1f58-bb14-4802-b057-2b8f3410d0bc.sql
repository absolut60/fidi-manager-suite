CREATE OR REPLACE FUNCTION public.get_semaforo_affidabilita_cliente(p_cliente_id uuid)
RETURNS TABLE(
  stadio text,
  motivo text,
  ritardo_medio_ritardi numeric,
  eur_scaduto_grave numeric,
  n_scaduto_grave int,
  num_insoluti int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bloccato boolean;
  v_legale boolean;
  v_insoluti int;
  v_n_grave int := 0;
  v_eur_grave numeric := 0;
  v_ritardo numeric := 0;
  v_stadio text;
  v_motivo text;
BEGIN
  IF NOT public.user_can_access_cliente(p_cliente_id) THEN
    RAISE EXCEPTION 'Accesso negato al cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(c.bloccato, false), COALESCE(c.in_gestione_legale, false), COALESCE(c.num_insoluti, 0)
    INTO v_bloccato, v_legale, v_insoluti
  FROM public.clienti c WHERE c.id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente % non trovato', p_cliente_id USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::int, COALESCE(SUM(s.importo_scadenza), 0)
    INTO v_n_grave, v_eur_grave
  FROM public.scadenze s
  WHERE s.cliente_id = p_cliente_id
    AND s.stato_contabile = 'Aperta'
    AND s.importo_scadenza > 0
    AND NOT public.is_anticipo(s.numero_documento)
    AND s.tempi_scadenza ILIKE 'Scaduto%'
    AND (s.tempi_scadenza ILIKE '%60-90%' OR s.tempi_scadenza ILIKE '%90-120%' OR s.tempi_scadenza ILIKE '%oltre 120%');

  SELECT COALESCE(ROUND(AVG((s.data_pagamento_effettiva - s.data_scadenza))
           FILTER (WHERE (s.data_pagamento_effettiva - s.data_scadenza) > 0)::numeric, 1), 0)
    INTO v_ritardo
  FROM public.scadenze s
  WHERE s.cliente_id = p_cliente_id
    AND s.data_pagamento_effettiva IS NOT NULL
    AND s.data_scadenza IS NOT NULL
    AND s.importo_pagato IS NOT NULL
    AND s.importo_pagato > 0;

  IF v_bloccato THEN
    v_stadio := 'rosso'; v_motivo := 'Cliente bloccato';
  ELSIF v_legale THEN
    v_stadio := 'rosso'; v_motivo := 'In gestione legale';
  ELSIF v_insoluti > 0 THEN
    v_stadio := 'rosso'; v_motivo := v_insoluti || ' insoluto/i in corso';
  ELSIF v_eur_grave > 10000 THEN
    v_stadio := 'rosso';
    v_motivo := 'Scaduto grave ' || to_char(v_eur_grave, 'FM999G999G990D00') || ' € oltre 60 giorni';
  ELSIF v_n_grave > 0 THEN
    v_stadio := 'arancione';
    v_motivo := 'Scaduto ' || to_char(v_eur_grave, 'FM999G999G990D00') || ' € fermo oltre 60 giorni';
  ELSIF v_ritardo > 15 THEN
    v_stadio := 'giallo';
    v_motivo := 'Ritardo medio ' || ROUND(v_ritardo)::text || ' giorni sui pagamenti';
  ELSE
    v_stadio := 'verde';
    v_motivo := CASE WHEN v_ritardo = 0 THEN 'Sempre puntuale' ELSE 'Pagamenti regolari' END;
  END IF;

  RETURN QUERY SELECT v_stadio, v_motivo, v_ritardo, v_eur_grave, v_n_grave, v_insoluti;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_semaforo_affidabilita_cliente(uuid) TO authenticated;