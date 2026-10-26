ALTER TABLE public.azioni_recupero ADD COLUMN email_cc text NULL, ADD COLUMN email_bcc text NULL;

CREATE OR REPLACE FUNCTION public.get_destinatari_copia_recupero(_cliente_id uuid)
RETURNS TABLE(user_id uuid, nome text, cognome text, email text, ruolo text, pertinente boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.nome, p.cognome, p.email, ur.role::text AS ruolo,
         CASE
           WHEN ur.role = 'agente' THEN p.id IN (SELECT public.utenti_agente_cliente(_cliente_id))
           ELSE p.store_id IS NOT NULL AND p.store_id = (SELECT c.store_id FROM public.clienti c WHERE c.id = _cliente_id)
         END AS pertinente
  FROM public.profili p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('agente','store_manager')
  WHERE public.auth_puo_inviare_recupero()
    AND p.attivo
    AND nullif(btrim(p.email), '') IS NOT NULL
  ORDER BY pertinente DESC, ruolo, p.cognome, p.nome
$$;

REVOKE EXECUTE ON FUNCTION public.get_destinatari_copia_recupero(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_destinatari_copia_recupero(uuid) TO authenticated;