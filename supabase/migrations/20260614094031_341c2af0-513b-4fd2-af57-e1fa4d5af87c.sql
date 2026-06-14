
-- Snapshot storico mensile dello scaduto
CREATE TABLE public.snapshot_scaduto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_snapshot date NOT NULL UNIQUE,
  totale_scaduto numeric NOT NULL DEFAULT 0,
  totale_a_scadere numeric NOT NULL DEFAULT 0,
  n_clienti_con_scaduto int NOT NULL DEFAULT 0,
  n_fatture_scadute int NOT NULL DEFAULT 0,
  scaduto_1_30 numeric NOT NULL DEFAULT 0,
  scaduto_31_60 numeric NOT NULL DEFAULT 0,
  scaduto_oltre_60 numeric NOT NULL DEFAULT 0,
  ritardo_medio_tot numeric,
  ritardo_mediano_tot numeric,
  ritardo_ponderato_tot numeric,
  ritardo_medio_solare numeric,
  ritardo_mediano_solare numeric,
  ritardo_ponderato_solare numeric,
  scaduto_solare numeric NOT NULL DEFAULT 0,
  ritardo_medio_mobile numeric,
  ritardo_mediano_mobile numeric,
  ritardo_ponderato_mobile numeric,
  scaduto_mobile numeric NOT NULL DEFAULT 0,
  n_clienti_stadio_0 int NOT NULL DEFAULT 0,
  n_clienti_stadio_1 int NOT NULL DEFAULT 0,
  n_clienti_stadio_2 int NOT NULL DEFAULT 0,
  n_clienti_stadio_mora int NOT NULL DEFAULT 0,
  n_azioni_aperte int NOT NULL DEFAULT 0,
  n_azioni_in_ritardo int NOT NULL DEFAULT 0,
  n_promesse_pagamento int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snapshot_scaduto TO authenticated;
GRANT ALL ON public.snapshot_scaduto TO service_role;
ALTER TABLE public.snapshot_scaduto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshot leggibile da utenti autenticati"
  ON public.snapshot_scaduto FOR SELECT TO authenticated USING (true);
CREATE POLICY "Snapshot scrivibile da amministratori"
  ON public.snapshot_scaduto FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'amministratore'::app_role));

CREATE TABLE public.snapshot_scaduto_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_snapshot date NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  totale_scaduto numeric NOT NULL DEFAULT 0,
  totale_a_scadere numeric NOT NULL DEFAULT 0,
  n_fatture_scadute int NOT NULL DEFAULT 0,
  ritardo_medio_tot numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(data_snapshot, store_id)
);
CREATE INDEX idx_snap_store_data ON public.snapshot_scaduto_store(data_snapshot);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snapshot_scaduto_store TO authenticated;
GRANT ALL ON public.snapshot_scaduto_store TO service_role;
ALTER TABLE public.snapshot_scaduto_store ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snap store leggibile" ON public.snapshot_scaduto_store FOR SELECT TO authenticated USING (true);
CREATE POLICY "Snap store scrivibile admin" ON public.snapshot_scaduto_store FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'amministratore'::app_role));

CREATE TABLE public.snapshot_scaduto_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_snapshot date NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  totale_scaduto numeric NOT NULL DEFAULT 0,
  totale_a_scadere numeric NOT NULL DEFAULT 0,
  n_fatture_scadute int NOT NULL DEFAULT 0,
  ritardo_medio_tot numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(data_snapshot, cliente_id)
);
CREATE INDEX idx_snap_cli_data ON public.snapshot_scaduto_cliente(data_snapshot);
CREATE INDEX idx_snap_cli_cliente ON public.snapshot_scaduto_cliente(cliente_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snapshot_scaduto_cliente TO authenticated;
GRANT ALL ON public.snapshot_scaduto_cliente TO service_role;
ALTER TABLE public.snapshot_scaduto_cliente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snap cliente leggibile" ON public.snapshot_scaduto_cliente FOR SELECT TO authenticated USING (true);
CREATE POLICY "Snap cliente scrivibile admin" ON public.snapshot_scaduto_cliente FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'amministratore'::app_role));

-- Funzione genera_snapshot idempotente
CREATE OR REPLACE FUNCTION public.genera_snapshot(_data date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  -- Idempotenza: ripulisci snapshot esistenti per la data
  DELETE FROM public.snapshot_scaduto_cliente WHERE data_snapshot = _data;
  DELETE FROM public.snapshot_scaduto_store WHERE data_snapshot = _data;
  DELETE FROM public.snapshot_scaduto WHERE data_snapshot = _data;

  -- CTE comune: classificazione (riusa la logica di classificaScadenza)
  WITH cls AS (
    SELECT
      s.id, s.cliente_id, s.importo_scadenza, s.data_scadenza,
      CASE
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%a scadere%' THEN 'a_scadere'
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%scadut%' THEN 'scaduto'
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%pagat%' THEN 'pagato'
        WHEN s.stato_contabile = 'Aperta' AND COALESCE(s.giorni_ritardo,0) > 0 THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' AND COALESCE(s.giorni_ritardo,0) <= 0 THEN 'a_scadere'
        ELSE 'pagato'
      END AS categoria
    FROM public.scadenze s
  ),
  -- Aperte e gia scadute alla data snapshot (data_scadenza < _data)
  scadute AS (
    SELECT id, cliente_id, importo_scadenza, data_scadenza,
           (_data - data_scadenza)::int AS ritardo
    FROM cls
    WHERE categoria = 'scaduto'
      AND data_scadenza IS NOT NULL
      AND data_scadenza < _data
  ),
  scadute_solare AS (
    SELECT * FROM scadute WHERE data_scadenza >= date_trunc('year', _data)::date
  ),
  scadute_mobile AS (
    SELECT * FROM scadute WHERE data_scadenza >= (_data - INTERVAL '365 days')::date
  ),
  a_scadere AS (
    SELECT cliente_id, importo_scadenza FROM cls WHERE categoria = 'a_scadere'
  ),
  -- stadio sollecito su scadenze aperte non pagate
  aperte_non_pagate AS (
    SELECT id, cliente_id FROM cls WHERE categoria IN ('scaduto','a_scadere')
  ),
  email_aperte AS (
    SELECT DISTINCT a.cliente_id, a.livello_sollecito
    FROM public.azioni_recupero a
    JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
    JOIN aperte_non_pagate ap ON ap.id = ars.scadenza_id
    WHERE a.tipo = 'email' AND a.livello_sollecito BETWEEN 1 AND 3
  ),
  stadio_cli AS (
    SELECT cliente_id, MAX(livello_sollecito)::smallint AS stadio
    FROM email_aperte GROUP BY cliente_id
  ),
  clienti_scaduti AS (
    SELECT DISTINCT cliente_id FROM scadute
  )
  INSERT INTO public.snapshot_scaduto (
    data_snapshot,
    totale_scaduto, totale_a_scadere,
    n_clienti_con_scaduto, n_fatture_scadute,
    scaduto_1_30, scaduto_31_60, scaduto_oltre_60,
    ritardo_medio_tot, ritardo_mediano_tot, ritardo_ponderato_tot,
    ritardo_medio_solare, ritardo_mediano_solare, ritardo_ponderato_solare, scaduto_solare,
    ritardo_medio_mobile, ritardo_mediano_mobile, ritardo_ponderato_mobile, scaduto_mobile,
    n_clienti_stadio_0, n_clienti_stadio_1, n_clienti_stadio_2, n_clienti_stadio_mora,
    n_azioni_aperte, n_azioni_in_ritardo, n_promesse_pagamento
  )
  SELECT
    _data,
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute),0),
    COALESCE((SELECT SUM(importo_scadenza) FROM a_scadere),0),
    (SELECT COUNT(*) FROM clienti_scaduti),
    (SELECT COUNT(*) FROM scadute),
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute WHERE ritardo BETWEEN 1 AND 30),0),
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute WHERE ritardo BETWEEN 31 AND 60),0),
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute WHERE ritardo > 60),0),
    (SELECT AVG(ritardo) FROM scadute),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ritardo) FROM scadute),
    (SELECT CASE WHEN SUM(importo_scadenza)>0 THEN SUM(ritardo*importo_scadenza)/SUM(importo_scadenza) END FROM scadute),
    (SELECT AVG(ritardo) FROM scadute_solare),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ritardo) FROM scadute_solare),
    (SELECT CASE WHEN SUM(importo_scadenza)>0 THEN SUM(ritardo*importo_scadenza)/SUM(importo_scadenza) END FROM scadute_solare),
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute_solare),0),
    (SELECT AVG(ritardo) FROM scadute_mobile),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ritardo) FROM scadute_mobile),
    (SELECT CASE WHEN SUM(importo_scadenza)>0 THEN SUM(ritardo*importo_scadenza)/SUM(importo_scadenza) END FROM scadute_mobile),
    COALESCE((SELECT SUM(importo_scadenza) FROM scadute_mobile),0),
    (SELECT COUNT(*) FROM clienti_scaduti cs WHERE NOT EXISTS (SELECT 1 FROM stadio_cli sc WHERE sc.cliente_id = cs.cliente_id)),
    (SELECT COUNT(*) FROM stadio_cli WHERE stadio = 1),
    (SELECT COUNT(*) FROM stadio_cli WHERE stadio = 2),
    (SELECT COUNT(*) FROM stadio_cli WHERE stadio = 3),
    (SELECT COUNT(*) FROM public.azioni_recupero WHERE esito = 'da_fare' AND tipo <> 'promemoria_scadenza'),
    (SELECT COUNT(*) FROM public.azioni_recupero WHERE esito = 'da_fare' AND tipo <> 'promemoria_scadenza' AND data_azione < (_data + INTERVAL '1 day')::timestamptz),
    (SELECT COUNT(*) FROM public.azioni_recupero WHERE esito = 'promessa_pagamento')
  RETURNING id INTO _id;

  -- Per store
  INSERT INTO public.snapshot_scaduto_store (data_snapshot, store_id, totale_scaduto, totale_a_scadere, n_fatture_scadute, ritardo_medio_tot)
  WITH cls AS (
    SELECT s.id, s.cliente_id, s.importo_scadenza, s.data_scadenza,
      CASE
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%a scadere%' THEN 'a_scadere'
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%scadut%' THEN 'scaduto'
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%pagat%' THEN 'pagato'
        WHEN s.stato_contabile = 'Aperta' AND COALESCE(s.giorni_ritardo,0) > 0 THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' AND COALESCE(s.giorni_ritardo,0) <= 0 THEN 'a_scadere'
        ELSE 'pagato'
      END AS categoria
    FROM public.scadenze s
  )
  SELECT _data, c.store_id,
    COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.categoria='scaduto' AND cls.data_scadenza < _data),0),
    COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.categoria='a_scadere'),0),
    COUNT(*) FILTER (WHERE cls.categoria='scaduto' AND cls.data_scadenza < _data)::int,
    AVG((_data - cls.data_scadenza)::int) FILTER (WHERE cls.categoria='scaduto' AND cls.data_scadenza < _data)
  FROM cls
  JOIN public.clienti c ON c.id = cls.cliente_id
  GROUP BY c.store_id
  HAVING COUNT(*) FILTER (WHERE cls.categoria IN ('scaduto','a_scadere')) > 0;

  -- Per cliente (solo con scaduto)
  INSERT INTO public.snapshot_scaduto_cliente (data_snapshot, cliente_id, totale_scaduto, totale_a_scadere, n_fatture_scadute, ritardo_medio_tot)
  WITH cls AS (
    SELECT s.cliente_id, s.importo_scadenza, s.data_scadenza,
      CASE
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%a scadere%' THEN 'a_scadere'
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%scadut%' THEN 'scaduto'
        WHEN lower(coalesce(s.tempi_scadenza,'')) LIKE '%pagat%' THEN 'pagato'
        WHEN s.stato_contabile = 'Aperta' AND COALESCE(s.giorni_ritardo,0) > 0 THEN 'scaduto'
        WHEN s.stato_contabile = 'Aperta' AND COALESCE(s.giorni_ritardo,0) <= 0 THEN 'a_scadere'
        ELSE 'pagato'
      END AS categoria
    FROM public.scadenze s
  )
  SELECT _data, cls.cliente_id,
    COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.categoria='scaduto' AND cls.data_scadenza < _data),0),
    COALESCE(SUM(cls.importo_scadenza) FILTER (WHERE cls.categoria='a_scadere'),0),
    COUNT(*) FILTER (WHERE cls.categoria='scaduto' AND cls.data_scadenza < _data)::int,
    AVG((_data - cls.data_scadenza)::int) FILTER (WHERE cls.categoria='scaduto' AND cls.data_scadenza < _data)
  FROM cls
  GROUP BY cls.cliente_id
  HAVING COUNT(*) FILTER (WHERE cls.categoria='scaduto' AND cls.data_scadenza < _data) > 0;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.genera_snapshot(date) TO authenticated, service_role;
