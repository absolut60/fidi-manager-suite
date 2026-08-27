-- 1) UNICO PUNTO per i ruoli a visione globale clienti (estensibile: un ruolo futuro si aggiunge qui)
CREATE OR REPLACE FUNCTION public.auth_ha_ruolo_globale_clienti()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN (
        'amministratore','direzione','amministrazione',
        'approvatore_liv1','approvatore_liv2','approvatore_liv3'
      )
  );
$$;

-- 2a) READ gate — firma ESTESA con 2 parametri OPZIONALI (DEFAULT NULL) per il fast-path senza join.
--     Se i parametri sono NULL ricade sul join su clienti = comportamento invariato.
CREATE OR REPLACE FUNCTION public.user_can_access_cliente(
  _cliente_id uuid,
  _cli_store_id uuid DEFAULT NULL,
  _cli_codice_agente text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _cliente_id IS NOT NULL AND (
    public.auth_ha_ruolo_globale_clienti()
    OR (
      -- FAST-PATH: la policy ha passato store_id della riga → nessun rientro in clienti
      _cli_store_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profili p
        WHERE p.id = auth.uid() AND p.store_id IS NOT NULL AND p.store_id = _cli_store_id
      )
    )
    OR (
      _cli_codice_agente IS NOT NULL AND public.has_role(auth.uid(),'agente'::app_role) AND EXISTS (
        SELECT 1 FROM public.profili p
        WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL AND p.codice_agente = _cli_codice_agente
      )
    )
    OR (
      -- SLOW-PATH retro-compatibile: parametri non passati → join su clienti come prima
      _cli_store_id IS NULL AND _cli_codice_agente IS NULL AND EXISTS (
        SELECT 1 FROM public.clienti c JOIN public.profili p ON p.id = auth.uid()
        WHERE c.id = _cliente_id AND (
          (p.store_id IS NOT NULL AND c.store_id = p.store_id)
          OR (public.has_role(auth.uid(),'agente'::app_role) AND p.codice_agente IS NOT NULL AND c.codice_agente = p.codice_agente)
        )
      )
    )
  );
$$;

-- 2b) Wrapper retro-compatibile a 1 parametro: delega alla firma estesa.
--     Non può essere droppata perché ~28 policy dipendono da essa; resta un thin wrapper.
CREATE OR REPLACE FUNCTION public.user_can_access_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.user_can_access_cliente(_cliente_id, NULL::uuid, NULL::text);
$$;

-- 3) WRITE gate: unifica i due EXISTS in uno (nessun ramo agente). Firma invariata.
CREATE OR REPLACE FUNCTION public.user_can_write_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _cliente_id IS NOT NULL AND (
    public.has_role(auth.uid(),'amministratore'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.clienti c JOIN public.profili p ON p.id = auth.uid()
      WHERE c.id = _cliente_id AND p.store_id IS NOT NULL AND c.store_id = p.store_id
    )
  );
$$;

-- GRANT (dopo CREATE OR REPLACE i grant si perdono)
GRANT EXECUTE ON FUNCTION public.auth_ha_ruolo_globale_clienti() TO authenticated, service_role, supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.user_can_access_cliente(uuid, uuid, text) TO authenticated, service_role, supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.user_can_access_cliente(uuid) TO authenticated, service_role, supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.user_can_write_cliente(uuid) TO authenticated, service_role, supabase_read_only_user;

-- Revoca accesso anon/PUBLIC sulle funzioni gate clienti
REVOKE EXECUTE ON FUNCTION public.auth_ha_ruolo_globale_clienti() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_can_access_cliente(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_can_access_cliente(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_can_write_cliente(uuid) FROM PUBLIC, anon;