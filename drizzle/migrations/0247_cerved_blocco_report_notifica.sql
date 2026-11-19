CREATE FUNCTION public.blocca_report_cerved_e_notifica(_report_id uuid, _ruoli public.app_role[])
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r public.cerved_report%ROWTYPE;
  nome_cliente text;
BEGIN
  UPDATE public.cerved_report
  SET stato = 'bloccato'
  WHERE id = _report_id AND stato = 'in_attesa' AND acquistato_il < now() - interval '48 hours'
  RETURNING * INTO r;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT ragione_sociale INTO nome_cliente FROM public.clienti WHERE id = r.cliente_id;
  INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
  SELECT DISTINCT p.id, 'cerved_report_bloccato', 'Report Cerved non consegnato',
    'Cerved non ha consegnato il report di ' || coalesce(nome_cliente, '—') || ' (richiesta n. ' || r.request_id || ') entro 48 ore: contattare Cerved',
    '/clienti/' || r.cliente_id || '?tab=cerved',
    jsonb_build_object('report_id', r.id, 'cliente_id', r.cliente_id, 'request_id', r.request_id, 'gruppo_etichetta', 'Cerved')
  FROM public.profili p JOIN public.user_roles u ON u.user_id = p.id
  WHERE p.attivo AND u.role = ANY(_ruoli);
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.blocca_report_cerved_e_notifica(uuid, public.app_role[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blocca_report_cerved_e_notifica(uuid, public.app_role[]) TO service_role;