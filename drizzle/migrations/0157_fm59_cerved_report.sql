CREATE TABLE public.cerved_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  id_soggetto bigint NOT NULL,
  request_id text NOT NULL UNIQUE,
  prodotto int NOT NULL DEFAULT 52015,
  acquistato_il timestamptz NOT NULL DEFAULT now(),
  scade_il timestamptz NOT NULL,
  acquistato_da uuid NULL,
  percorso_pdf text NULL,
  ultimo_recupero_il timestamptz NULL,
  ultimo_recupero_da uuid NULL,
  chiamata_acquisto_id uuid NULL REFERENCES public.cerved_chiamate(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX cerved_report_cliente_scade_idx ON public.cerved_report (cliente_id, scade_il DESC);

COMMENT ON TABLE public.cerved_report IS 'FM59: Light Report Cerved per cliente. Modello: acquisto una volta l''anno (scade_il = acquistato_il + 1 anno); nel periodo di validità il report si recupera gratis e aggiornato con request_id. Scrive solo il server (service_role); PDF nel bucket privato cerved-report (<id_soggetto>/<request_id>.pdf), aperti solo via URL firmato dal server.';

GRANT SELECT ON public.cerved_report TO authenticated;
GRANT ALL ON public.cerved_report TO service_role;

ALTER TABLE public.cerved_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY cerved_report_select ON public.cerved_report
  FOR SELECT TO authenticated
  USING ((( SELECT auth_ha_ruolo_globale_clienti() AS auth_ha_ruolo_globale_clienti) OR (cliente_id IN ( SELECT clienti_ambito_utente_ids() AS clienti_ambito_utente_ids))));

CREATE POLICY "Secondo fattore (FM44)" ON public.cerved_report
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (( SELECT auth_mfa_ok() AS auth_mfa_ok));