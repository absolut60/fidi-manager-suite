-- FM45 Fetta 1/5: stato delle promesse di pagamento e coperture dello scadenziario.
ALTER TABLE public.azioni_recupero
  ADD COLUMN IF NOT EXISTS stato_promessa text NULL,
  ADD COLUMN IF NOT EXISTS stato_promessa_aggiornato_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS stato_promessa_aggiornato_da uuid NULL REFERENCES public.profili(id);

ALTER TABLE public.azioni_recupero
  ADD CONSTRAINT azioni_recupero_stato_promessa_check
  CHECK (stato_promessa IS NULL OR stato_promessa IN ('attiva','mantenuta','disattesa','annullata'));

-- Backfill: tutte le promesse esistenti partono 'attiva' (prima del trigger).
UPDATE public.azioni_recupero SET stato_promessa = 'attiva'
WHERE esito = 'promessa_pagamento' AND stato_promessa IS NULL;

CREATE OR REPLACE FUNCTION public.trg_azioni_recupero_stato_promessa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NEW.esito = 'promessa_pagamento' AND NEW.stato_promessa IS NULL THEN
    NEW.stato_promessa := 'attiva';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.esito = 'promessa_pagamento' AND COALESCE(NEW.importo_riferimento, 0) <= 0 THEN
      RAISE EXCEPTION 'Importo della promessa obbligatorio';
    END IF;
  ELSIF NEW.stato_promessa IS DISTINCT FROM OLD.stato_promessa THEN
    IF v_uid IS NOT NULL AND NOT (
      public.has_role(v_uid, 'recupero_crediti') OR public.has_role(v_uid, 'amministrazione')
      OR public.has_role(v_uid, 'amministratore')) THEN
      RAISE EXCEPTION 'Non hai i permessi per cambiare lo stato della promessa';
    END IF;
    NEW.stato_promessa_aggiornato_at := now();
    NEW.stato_promessa_aggiornato_da := v_uid;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_azioni_recupero_stato_promessa
BEFORE INSERT OR UPDATE ON public.azioni_recupero
FOR EACH ROW EXECUTE FUNCTION public.trg_azioni_recupero_stato_promessa();

-- REGOLA (fonte unica coperture): piani coprono per riga (fattura); promesse coprono
-- per importo, mai oltre le fatture collegate e mai oltre lo scaduto residuo del cliente
-- (il tetto per cliente si applica nel calcolo dello scadenziario).
-- Piano attivo = piani_rientro.stato='attivo'; promessa attiva = stato_promessa='attiva'.
-- Se una scadenza e' sia in un piano sia in una promessa, vince il piano (mai doppio conteggio).
CREATE OR REPLACE FUNCTION public.coperture_scadenziario(_today date DEFAULT CURRENT_DATE)
RETURNS TABLE(scadenza_id uuid, cliente_id uuid, origine text, piano_id uuid, promessa_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH piano AS (
    SELECT DISTINCT ON (d.scadenza_id) d.scadenza_id, p.cliente_id, p.id AS piano_id
    FROM public.piani_rientro_documenti d
    JOIN public.piani_rientro p ON p.id = d.piano_id AND p.stato = 'attivo'
    ORDER BY d.scadenza_id, p.created_at DESC
  ),
  prom AS (
    SELECT DISTINCT ON (ars.scadenza_id) ars.scadenza_id, a.cliente_id, a.id AS promessa_id
    FROM public.azioni_recupero_scadenze ars
    JOIN public.azioni_recupero a ON a.id = ars.azione_id
     AND a.esito = 'promessa_pagamento' AND a.stato_promessa = 'attiva'
    WHERE NOT EXISTS (SELECT 1 FROM piano pp WHERE pp.scadenza_id = ars.scadenza_id)
    ORDER BY ars.scadenza_id, a.data_promessa_pagamento NULLS LAST, a.created_at
  )
  SELECT scadenza_id, cliente_id, 'piano'::text, piano_id, NULL::uuid FROM piano
  UNION ALL
  SELECT scadenza_id, cliente_id, 'promessa'::text, NULL::uuid, promessa_id FROM prom
$$;

-- Importo efficace per promessa attiva: con fatture collegate = LEAST(importo_riferimento,
-- somma fatture collegate ancora aperte e NON coperte da piano); senza fatture = importo_riferimento; NULL -> 0.
CREATE OR REPLACE FUNCTION public.promesse_attive_importo_efficace()
RETURNS TABLE(promessa_id uuid, cliente_id uuid, data_promessa date, importo_efficace numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH piano AS (
    SELECT DISTINCT d.scadenza_id FROM public.piani_rientro_documenti d
    JOIN public.piani_rientro p ON p.id = d.piano_id AND p.stato = 'attivo'
  ),
  fatt AS (
    SELECT ars.azione_id, COUNT(*) AS n_coll,
      COALESCE(SUM(s.importo_scadenza) FILTER (
        WHERE public.categoria_scadenza(s.stato_contabile, s.data_scadenza, s.data_pagamento_effettiva, s.giorni_ritardo, CURRENT_DATE) <> 'pagato'
          AND NOT EXISTS (SELECT 1 FROM piano pp WHERE pp.scadenza_id = s.id)), 0) AS aperto
    FROM public.azioni_recupero_scadenze ars
    JOIN public.scadenze s ON s.id = ars.scadenza_id
    GROUP BY ars.azione_id
  )
  SELECT a.id, a.cliente_id, a.data_promessa_pagamento,
    CASE WHEN f.azione_id IS NOT NULL
      THEN GREATEST(LEAST(COALESCE(a.importo_riferimento, 0), f.aperto), 0)
      ELSE COALESCE(a.importo_riferimento, 0) END
  FROM public.azioni_recupero a
  LEFT JOIN fatt f ON f.azione_id = a.id
  WHERE a.esito = 'promessa_pagamento' AND a.stato_promessa = 'attiva'
$$;

CREATE OR REPLACE FUNCTION public.promesse_attive_importo_cliente()
RETURNS TABLE(cliente_id uuid, importo_promesse numeric, n_promesse int, n_promesse_data_passata int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.cliente_id, COALESCE(SUM(e.importo_efficace), 0), COUNT(*)::int,
    COUNT(*) FILTER (WHERE e.data_promessa IS NULL OR e.data_promessa < CURRENT_DATE)::int
  FROM public.promesse_attive_importo_efficace() e
  GROUP BY e.cliente_id
$$;

-- Previsione incassi per origine. Fasce per giorni da oggi; date passate (o assenti) = scaduto_non_incassato.
CREATE OR REPLACE FUNCTION public.get_previsione_incassi_coperture(p_store_id uuid DEFAULT NULL, p_agente text DEFAULT NULL)
RETURNS TABLE(origine text, totale_atteso numeric, n_clienti int, n_elementi int,
  scaduto_non_incassato numeric, entro_30 numeric, entro_60 numeric, entro_90 numeric, oltre_90 numeric,
  giorni_medi_rientro numeric, n_data_passata int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH vis AS (
    SELECT cl.id FROM public.clienti cl
    WHERE public.user_can_access_cliente(cl.id, cl.store_id, cl.codice_agente)
      AND (p_store_id IS NULL OR cl.store_id = p_store_id)
      AND (p_agente IS NULL OR (p_agente = '__none__' AND cl.codice_agente IS NULL) OR cl.codice_agente = p_agente)
  ),
  el AS (
    SELECT 'piano'::text AS origine, p.cliente_id, r.data_rata AS d, COALESCE(r.importo, 0) AS imp
    FROM public.piani_rientro_rate r
    JOIN public.piani_rientro p ON p.id = r.piano_id AND p.stato = 'attivo'
    JOIN vis ON vis.id = p.cliente_id
    WHERE r.stato <> 'pagata'
    UNION ALL
    SELECT 'promessa', e.cliente_id, e.data_promessa, e.importo_efficace
    FROM public.promesse_attive_importo_efficace() e JOIN vis ON vis.id = e.cliente_id
  ),
  g AS (SELECT el.*, (el.d - CURRENT_DATE) AS gg FROM el),
  o AS (SELECT unnest(ARRAY['piano','promessa']) AS origine)
  SELECT o.origine,
    COALESCE(SUM(g.imp), 0), COUNT(DISTINCT g.cliente_id)::int, COUNT(g.origine)::int,
    COALESCE(SUM(g.imp) FILTER (WHERE g.gg IS NULL OR g.gg < 0), 0),
    COALESCE(SUM(g.imp) FILTER (WHERE g.gg BETWEEN 0 AND 30), 0),
    COALESCE(SUM(g.imp) FILTER (WHERE g.gg BETWEEN 31 AND 60), 0),
    COALESCE(SUM(g.imp) FILTER (WHERE g.gg BETWEEN 61 AND 90), 0),
    COALESCE(SUM(g.imp) FILTER (WHERE g.gg > 90), 0),
    ROUND(SUM(g.imp * g.gg) FILTER (WHERE g.gg >= 0) / NULLIF(SUM(g.imp) FILTER (WHERE g.gg >= 0), 0), 1),
    COUNT(*) FILTER (WHERE g.origine IS NOT NULL AND (g.gg IS NULL OR g.gg < 0))::int
  FROM o LEFT JOIN g ON g.origine = o.origine
  GROUP BY o.origine ORDER BY o.origine
$$;

REVOKE EXECUTE ON FUNCTION public.coperture_scadenziario(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.promesse_attive_importo_efficace() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.promesse_attive_importo_cliente() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_previsione_incassi_coperture(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coperture_scadenziario(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promesse_attive_importo_efficace() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promesse_attive_importo_cliente() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_previsione_incassi_coperture(uuid, text) TO authenticated, service_role;