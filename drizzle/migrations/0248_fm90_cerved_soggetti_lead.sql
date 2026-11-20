ALTER TABLE public.cerved_soggetti ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.cerved_soggetti DROP CONSTRAINT cerved_soggetti_pkey;
ALTER TABLE public.cerved_soggetti ADD CONSTRAINT cerved_soggetti_pkey PRIMARY KEY (id);
ALTER TABLE public.cerved_soggetti ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE public.cerved_soggetti ADD CONSTRAINT cerved_soggetti_cliente_id_key UNIQUE (cliente_id);
ALTER TABLE public.cerved_soggetti ADD COLUMN lead_id uuid NULL REFERENCES public.lead(id) ON DELETE CASCADE;
ALTER TABLE public.cerved_soggetti ADD CONSTRAINT cerved_soggetti_lead_id_key UNIQUE (lead_id);
ALTER TABLE public.cerved_soggetti ADD CONSTRAINT cerved_soggetti_un_soggetto_check CHECK (num_nonnulls(cliente_id, lead_id) = 1);

ALTER TABLE public.cerved_report ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE public.cerved_report ADD COLUMN lead_id uuid NULL REFERENCES public.lead(id) ON DELETE SET NULL;
CREATE INDEX cerved_report_lead_id_idx ON public.cerved_report (lead_id);
CREATE INDEX cerved_report_soggetto_scade_idx ON public.cerved_report (id_soggetto, scade_il DESC);

ALTER TABLE public.cerved_fotografie ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE public.cerved_fotografie ADD COLUMN lead_id uuid NULL REFERENCES public.lead(id) ON DELETE SET NULL;
CREATE INDEX cerved_fotografie_lead_id_idx ON public.cerved_fotografie (lead_id);
CREATE INDEX cerved_fotografie_soggetto_tipo_idx ON public.cerved_fotografie (id_soggetto, tipo, letta_il DESC);

DROP POLICY cerved_soggetti_select ON public.cerved_soggetti;
CREATE POLICY cerved_soggetti_select ON public.cerved_soggetti FOR SELECT TO authenticated
USING ((SELECT public.auth_ha_ruolo_globale_clienti()) OR cliente_id IN (SELECT public.clienti_ambito_utente_ids()) OR lead_id IN (SELECT l.id FROM public.lead l));

DROP POLICY cerved_report_select ON public.cerved_report;
CREATE POLICY cerved_report_select ON public.cerved_report FOR SELECT TO authenticated
USING ((SELECT public.auth_ha_ruolo_globale_clienti()) OR cliente_id IN (SELECT public.clienti_ambito_utente_ids()) OR id_soggetto IN (SELECT s.id_soggetto FROM public.cerved_soggetti s));

DROP POLICY cerved_fotografie_select ON public.cerved_fotografie;
CREATE POLICY cerved_fotografie_select ON public.cerved_fotografie FOR SELECT TO authenticated
USING ((SELECT public.auth_ha_ruolo_globale_clienti()) OR cliente_id IN (SELECT public.clienti_ambito_utente_ids()) OR id_soggetto IN (SELECT s.id_soggetto FROM public.cerved_soggetti s));