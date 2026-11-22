CREATE OR REPLACE FUNCTION public.blocca_ordine_esportato_gamma()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_old uuid;
  v_new uuid;
  v_p public.preventivi%ROWTYPE;
  v_servizio text[] := ARRAY['esportato_gamma_at','esportato_gamma_da','esportazione_gamma_id','updated_at','cliente_id','lead_id','lead_origine_id'];
BEGIN
  IF current_setting('role', true) = 'service_role' OR COALESCE(auth.role(), '') = 'service_role'
     OR (current_setting('app.gamma_scrittura', true) = 'rpc' AND COALESCE(public.auth_puo_esportare_gamma(), false)) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME = 'preventivi' THEN
    -- L'eccezione di servizio non deve permettere riaperture fuori dai ruoli Gamma.
    IF TG_OP = 'UPDATE' AND OLD.tipo = 'ordine'
       AND (NEW.esportato_gamma_at, NEW.esportato_gamma_da, NEW.esportazione_gamma_id)
           IS DISTINCT FROM (OLD.esportato_gamma_at, OLD.esportato_gamma_da, OLD.esportazione_gamma_id)
       AND NOT COALESCE(public.auth_puo_esportare_gamma(), false) THEN
      RAISE EXCEPTION 'Ordine già esportato in Gamma: riaprilo per modificarlo' USING ERRCODE = '42501';
    END IF;
    IF OLD.tipo = 'ordine' AND OLD.esportato_gamma_at IS NOT NULL THEN
      IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - v_servizio) IS NOT DISTINCT FROM (to_jsonb(OLD) - v_servizio) THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Ordine già esportato in Gamma: riaprilo per modificarlo' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'blocchi_preventivo' THEN
      IF TG_OP <> 'INSERT' THEN v_old := OLD.preventivo_id; END IF;
      IF TG_OP <> 'DELETE' THEN v_new := NEW.preventivo_id; END IF;
    ELSE
      IF TG_OP <> 'INSERT' THEN SELECT preventivo_id INTO v_old FROM public.blocchi_preventivo WHERE id = OLD.blocco_id; END IF;
      IF TG_OP <> 'DELETE' THEN SELECT preventivo_id INTO v_new FROM public.blocchi_preventivo WHERE id = NEW.blocco_id; END IF;
    END IF;
    FOR v_p IN SELECT p.* FROM public.preventivi p WHERE p.id IN (v_old, v_new) ORDER BY p.id FOR UPDATE LOOP
      IF v_p.tipo = 'ordine' AND v_p.esportato_gamma_at IS NOT NULL THEN
        RAISE EXCEPTION 'Ordine già esportato in Gamma: riaprilo per modificarlo' USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.blocca_ordine_esportato_gamma() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blocca_ordine_esportato_gamma() TO service_role;
