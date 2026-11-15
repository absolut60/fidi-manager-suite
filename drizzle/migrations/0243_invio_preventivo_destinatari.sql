CREATE OR REPLACE FUNCTION public.email_cliente_preventivo(_preventivo_id uuid)
RETURNS TABLE(email text, email_2 text, email_3 text, pec text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.email, c.email_2, c.email_3, c.pec
  FROM public.preventivi p
  JOIN public.clienti c ON c.id = p.cliente_id
  WHERE p.id = _preventivo_id
    AND public.auth_puo_scrivere_preventivo_id(_preventivo_id)
$$;
REVOKE EXECUTE ON FUNCTION public.email_cliente_preventivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_cliente_preventivo(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_destinatari_copia_preventivo(_preventivo_id uuid)
RETURNS TABLE(user_id uuid, nome text, cognome text, email text, ruolo text, pertinente boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT pr.id, pr.nome, pr.cognome, pr.email, ur.role::text,
         CASE WHEN ur.role = 'agente' THEN pr.codice_agente IS NOT NULL AND pr.codice_agente = pv.agente_codice
              ELSE pr.store_id IS NOT NULL AND pr.store_id = pv.store_id END
  FROM public.preventivi pv
  JOIN public.profili pr ON pr.attivo AND nullif(btrim(pr.email), '') IS NOT NULL
  JOIN public.user_roles ur ON ur.user_id = pr.id AND ur.role IN ('agente','store_manager')
  WHERE pv.id = _preventivo_id
    AND public.auth_puo_scrivere_preventivo_id(_preventivo_id)
  ORDER BY 6 DESC, 5, 3, 2
$$;
REVOKE EXECUTE ON FUNCTION public.get_destinatari_copia_preventivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_destinatari_copia_preventivo(uuid) TO authenticated, service_role;