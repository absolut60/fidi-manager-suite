CREATE TABLE public.cerved_soggetti (
  cliente_id uuid PRIMARY KEY REFERENCES public.clienti(id) ON DELETE CASCADE,
  id_soggetto bigint NOT NULL,
  partita_iva text,
  denominazione_cerved text,
  collegato_il timestamptz NOT NULL DEFAULT now(),
  collegato_da uuid,
  ultimo_aggiornamento timestamptz,
  aggiornato_da uuid
);
CREATE INDEX idx_cerved_soggetti_id_soggetto ON public.cerved_soggetti(id_soggetto);
GRANT SELECT ON public.cerved_soggetti TO authenticated;
GRANT ALL ON public.cerved_soggetti TO service_role;
ALTER TABLE public.cerved_soggetti ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cerved_soggetti_select" ON public.cerved_soggetti FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_ruolo_globale_clienti()) OR cliente_id IN (SELECT public.clienti_ambito_utente_ids()));
CREATE POLICY "Secondo fattore (FM44)" ON public.cerved_soggetti AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));

CREATE TABLE public.cerved_fotografie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  id_soggetto bigint NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('ricerca','profilo','score','light_report')),
  dati jsonb NOT NULL,
  chiamata_id uuid NULL REFERENCES public.cerved_chiamate(id) ON DELETE SET NULL,
  letta_il timestamptz NOT NULL DEFAULT now(),
  letta_da uuid
);
CREATE INDEX idx_cerved_fotografie_cliente_tipo ON public.cerved_fotografie(cliente_id, tipo, letta_il DESC);
GRANT SELECT ON public.cerved_fotografie TO authenticated;
GRANT ALL ON public.cerved_fotografie TO service_role;
ALTER TABLE public.cerved_fotografie ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cerved_fotografie_select" ON public.cerved_fotografie FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_ruolo_globale_clienti()) OR cliente_id IN (SELECT public.clienti_ambito_utente_ids()));
CREATE POLICY "Secondo fattore (FM44)" ON public.cerved_fotografie AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));

CREATE OR REPLACE FUNCTION public.auth_puo_aggiornare_cerved()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'amministratore')
      OR public.has_role(auth.uid(),'amministrazione')
      OR public.has_role(auth.uid(),'recupero_crediti')
$$;
REVOKE EXECUTE ON FUNCTION public.auth_puo_aggiornare_cerved() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_aggiornare_cerved() TO authenticated, service_role;