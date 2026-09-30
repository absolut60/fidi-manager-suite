CREATE OR REPLACE FUNCTION public.clienti_scaduto_oltre_60()
RETURNS TABLE(cliente_id uuid, tot_scaduto numeric, max_gg int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH cls AS (
    SELECT s.cliente_id, s.importo_scadenza, s.giorni_ritardo,
      public.is_anticipo(s.numero_documento) AS is_anticipo,
      public.categoria_scadenza(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, CURRENT_DATE) AS cat
    FROM public.scadenze s
    WHERE (s.stato_contabile = 'Aperta' OR s.data_pagamento_effettiva IS NULL)
      AND upper(COALESCE(s.codice_pagamento, '')) <> 'BOS'
  ),
  agg AS (
    SELECT c.cliente_id,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat='scaduto' AND NOT c.is_anticipo), 0) AS ssa,
      COALESCE(SUM(c.importo_scadenza) FILTER (WHERE c.cat='scaduto' AND c.is_anticipo), 0) AS ant,
      COALESCE(MAX(c.giorni_ritardo) FILTER (WHERE c.cat='scaduto'), 0)::int AS max_gg
    FROM cls c
    WHERE c.cat <> 'pagato'
    GROUP BY c.cliente_id
    HAVING COUNT(*) FILTER (WHERE c.cat='scaduto') > 0
  ),
  fin AS (
    SELECT a.cliente_id, public.calcola_scaduto(a.ssa, a.ant) AS tot_scaduto, a.max_gg
    FROM agg a
    JOIN public.clienti cl ON cl.id = a.cliente_id
    WHERE COALESCE(cl.in_gestione_legale, false) = false
  )
  SELECT f.cliente_id, f.tot_scaduto, f.max_gg FROM fin f
  WHERE f.tot_scaduto > 0 AND f.max_gg > 60;
$$;
REVOKE EXECUTE ON FUNCTION public.clienti_scaduto_oltre_60() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clienti_scaduto_oltre_60() TO service_role;
COMMENT ON FUNCTION public.clienti_scaduto_oltre_60() IS 'FM36 — gemello della fascia oltre_60 di get_scadenziario_ids (default: esclusi BOS e legale, anticipi scalati, scaduto reale > 0). Se cambia la regola dello scadenziario va aggiornata anche qui.';

CREATE TABLE public.clienti_scaduto60_stato (
  cliente_id uuid PRIMARY KEY REFERENCES public.clienti(id) ON DELETE CASCADE,
  oltre60 boolean NOT NULL,
  aggiornato_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.clienti_scaduto60_stato TO service_role;
ALTER TABLE public.clienti_scaduto60_stato ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.clienti_scaduto60_ingressi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  codice_gestionale text,
  ragione_sociale text,
  tot_scaduto numeric NOT NULL,
  max_gg int NOT NULL,
  rilevato_at timestamptz NOT NULL DEFAULT now(),
  azione_id uuid REFERENCES public.azioni_recupero(id) ON DELETE SET NULL,
  importazione_id uuid REFERENCES public.importazioni(id) ON DELETE SET NULL,
  notificato_at timestamptz
);
CREATE INDEX idx_cs60i_rilevato ON public.clienti_scaduto60_ingressi (rilevato_at DESC);
CREATE INDEX idx_cs60i_cliente ON public.clienti_scaduto60_ingressi (cliente_id, rilevato_at DESC);
CREATE INDEX idx_cs60i_da_notificare ON public.clienti_scaduto60_ingressi (rilevato_at) WHERE notificato_at IS NULL;
GRANT SELECT ON public.clienti_scaduto60_ingressi TO authenticated;
GRANT ALL ON public.clienti_scaduto60_ingressi TO service_role;
ALTER TABLE public.clienti_scaduto60_ingressi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lettura ingressi scaduto 60 per clienti accessibili"
  ON public.clienti_scaduto60_ingressi FOR SELECT TO authenticated
  USING (public.user_can_access_cliente(cliente_id, store_id, NULL));

CREATE OR REPLACE FUNCTION public.rileva_ingressi_scaduto_60(_importazione_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  v_azione uuid;
  v_n integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('rileva_ingressi_scaduto_60'));

  CREATE TEMP TABLE _cur60 ON COMMIT DROP AS
    SELECT * FROM public.clienti_scaduto_oltre_60();

  FOR r IN
    SELECT c.cliente_id, c.tot_scaduto, c.max_gg, cl.store_id, cl.codice_gestionale, cl.ragione_sociale
    FROM _cur60 c
    JOIN public.clienti cl ON cl.id = c.cliente_id
    LEFT JOIN public.clienti_scaduto60_stato st ON st.cliente_id = c.cliente_id
    WHERE st.cliente_id IS NULL OR st.oltre60 = false
  LOOP
    INSERT INTO public.azioni_recupero (cliente_id, operatore_id, tipo, esito, data_azione, importo_riferimento, note)
    VALUES (r.cliente_id, NULL, 'promemoria', 'da_fare', now(), r.tot_scaduto,
            'Passare all''agenzia di recupero — scaduto oltre 60 giorni (rilevato automaticamente)')
    RETURNING id INTO v_azione;

    INSERT INTO public.clienti_scaduto60_ingressi
      (cliente_id, store_id, codice_gestionale, ragione_sociale, tot_scaduto, max_gg, azione_id, importazione_id)
    VALUES (r.cliente_id, r.store_id, r.codice_gestionale, r.ragione_sociale, r.tot_scaduto, r.max_gg, v_azione, _importazione_id);

    v_n := v_n + 1;
  END LOOP;

  INSERT INTO public.clienti_scaduto60_stato (cliente_id, oltre60, aggiornato_at)
  SELECT cliente_id, true, now() FROM _cur60
  ON CONFLICT (cliente_id) DO UPDATE SET oltre60 = true, aggiornato_at = now()
    WHERE public.clienti_scaduto60_stato.oltre60 IS DISTINCT FROM true;

  UPDATE public.clienti_scaduto60_stato st
  SET oltre60 = false, aggiornato_at = now()
  WHERE st.oltre60 = true
    AND NOT EXISTS (SELECT 1 FROM _cur60 c WHERE c.cliente_id = st.cliente_id);

  DROP TABLE IF EXISTS _cur60;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rileva_ingressi_scaduto_60(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rileva_ingressi_scaduto_60(uuid) TO service_role;

INSERT INTO public.clienti_scaduto60_stato (cliente_id, oltre60)
SELECT cliente_id, true FROM public.clienti_scaduto_oltre_60()
ON CONFLICT (cliente_id) DO NOTHING;

INSERT INTO public.notifiche_tipi (tipo, raggruppa, chiave_metadata, titolo_gruppo, link_gruppo)
VALUES ('agenzia_recupero', true, NULL, '{n} clienti da passare all''agenzia di recupero', '/recupero-agenzia')
ON CONFLICT (tipo) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('d4ce46b1-6ea7-4bd3-9023-c7b31e29d264', 'recupero_crediti')
ON CONFLICT DO NOTHING;