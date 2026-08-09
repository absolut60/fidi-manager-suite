CREATE OR REPLACE FUNCTION public.refresh_fatturato_mensile()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND NOT public.has_role(auth.uid(), 'amministratore')
     AND NOT public.has_role(auth.uid(), 'direzione') THEN
    RAISE EXCEPTION 'Operazione non consentita';
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.fatturato_mensile_cliente;

  INSERT INTO public.configurazioni (chiave, valore, descrizione)
  VALUES ('fatturato_mensile_ultimo_refresh', v_now::text, 'Ultimo aggiornamento del precalcolo fatturato mensile (fido teorico)')
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;

  RETURN v_now;
END;
$$;