CREATE OR REPLACE FUNCTION public.sposta_lead_ambito(_lead_ids uuid[], _ambito text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n integer := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  IF _ambito IS NULL OR _ambito NOT IN ('commerciale', 'eventi') THEN
    RAISE EXCEPTION 'Ambito non valido';
  END IF;

  WITH prima AS (
    SELECT l.id, l.ambito AS ambito_prec
      FROM public.lead l
     WHERE l.id = ANY(_lead_ids)
       AND l.ambito IS DISTINCT FROM _ambito
     FOR UPDATE
  ), aggiornati AS (
    UPDATE public.lead l
       SET ambito = _ambito
      FROM prima
     WHERE l.id = prima.id
    RETURNING l.id, l.stato, prima.ambito_prec
  ), storico AS (
    INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
    SELECT a.id, a.stato::text, a.stato::text, v_uid,
           'Ambito: ' || a.ambito_prec || ' → ' || _ambito
      FROM aggiornati a
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM storico;

  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sposta_lead_ambito(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sposta_lead_ambito(uuid[], text) TO authenticated, service_role;
COMMENT ON FUNCTION public.sposta_lead_ambito(uuid[], text) IS 'FM38: unico punto per cambiare l''ambito di uno o più lead (con traccia in lead_storico). Solo ruoli di gestione lead.';