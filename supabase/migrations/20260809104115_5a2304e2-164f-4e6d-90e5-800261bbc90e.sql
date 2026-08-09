CREATE TABLE public.fido_teorico_cliente (
  cliente_id uuid PRIMARY KEY REFERENCES public.clienti(id) ON DELETE CASCADE,
  fatturato_rolling numeric,
  ritmo_mensile numeric,
  giorni integer,
  giorni_mancanti boolean,
  fido_base numeric,
  fido_base_lordo numeric,
  ddt_da_fatturare numeric,
  giorni_oltre_accordo integer,
  profilo_pagamento text,
  coefficiente numeric,
  fido_proposto numeric,
  fido_proposto_senza_coefficiente numeric,
  fido_attuale numeric,
  scostamento numeric,
  regola_applicata text,
  sede_cinisello boolean,
  richiede_verifica boolean,
  nota_proposta text,
  fido_teorico_puro numeric,
  pavimento_applicato boolean,
  esposizione_corrente numeric,
  calcolato_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fido_teorico_cliente TO authenticated;
GRANT ALL ON public.fido_teorico_cliente TO service_role;

ALTER TABLE public.fido_teorico_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura fido teorico per autenticati"
ON public.fido_teorico_cliente FOR SELECT TO authenticated USING (true);

CREATE POLICY "Scrittura fido teorico solo admin"
ON public.fido_teorico_cliente FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'amministratore') OR public.has_role(auth.uid(), 'direzione'))
WITH CHECK (public.has_role(auth.uid(), 'amministratore') OR public.has_role(auth.uid(), 'direzione'));

CREATE INDEX idx_fido_teorico_cliente_regola ON public.fido_teorico_cliente(regola_applicata);

CREATE OR REPLACE FUNCTION public.ricalcola_fido_teorico()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz;
  v_ids uuid[];
  v_offset integer := 0;
  v_chunk integer := 500;
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'amministratore')
     AND NOT public.has_role(auth.uid(), 'direzione') THEN
    RAISE EXCEPTION 'Operazione non consentita';
  END IF;

  PERFORM public.refresh_fatturato_mensile();

  LOOP
    SELECT array_agg(id) INTO v_ids
    FROM (
      SELECT id FROM public.clienti ORDER BY id OFFSET v_offset LIMIT v_chunk
    ) s;

    EXIT WHEN v_ids IS NULL OR array_length(v_ids, 1) = 0;

    INSERT INTO public.fido_teorico_cliente (
      cliente_id, fatturato_rolling, ritmo_mensile, giorni, giorni_mancanti,
      fido_base, fido_base_lordo, ddt_da_fatturare, giorni_oltre_accordo,
      profilo_pagamento, coefficiente, fido_proposto, fido_proposto_senza_coefficiente,
      fido_attuale, scostamento, regola_applicata, sede_cinisello, richiede_verifica,
      nota_proposta, fido_teorico_puro, pavimento_applicato, esposizione_corrente, calcolato_at
    )
    SELECT
      t.cliente_id, t.fatturato_rolling, t.ritmo_mensile, t.giorni, t.giorni_mancanti,
      t.fido_base, t.fido_base_lordo, t.ddt_da_fatturare, t.giorni_oltre_accordo,
      t.profilo_pagamento, t.coefficiente, t.fido_proposto, t.fido_proposto_senza_coefficiente,
      t.fido_attuale, t.scostamento, t.regola_applicata, t.sede_cinisello, t.richiede_verifica,
      t.nota_proposta, t.fido_teorico_puro, t.pavimento_applicato, t.esposizione_corrente, now()
    FROM public.get_fido_teorico(v_ids, false) t
    ON CONFLICT (cliente_id) DO UPDATE SET
      fatturato_rolling = EXCLUDED.fatturato_rolling,
      ritmo_mensile = EXCLUDED.ritmo_mensile,
      giorni = EXCLUDED.giorni,
      giorni_mancanti = EXCLUDED.giorni_mancanti,
      fido_base = EXCLUDED.fido_base,
      fido_base_lordo = EXCLUDED.fido_base_lordo,
      ddt_da_fatturare = EXCLUDED.ddt_da_fatturare,
      giorni_oltre_accordo = EXCLUDED.giorni_oltre_accordo,
      profilo_pagamento = EXCLUDED.profilo_pagamento,
      coefficiente = EXCLUDED.coefficiente,
      fido_proposto = EXCLUDED.fido_proposto,
      fido_proposto_senza_coefficiente = EXCLUDED.fido_proposto_senza_coefficiente,
      fido_attuale = EXCLUDED.fido_attuale,
      scostamento = EXCLUDED.scostamento,
      regola_applicata = EXCLUDED.regola_applicata,
      sede_cinisello = EXCLUDED.sede_cinisello,
      richiede_verifica = EXCLUDED.richiede_verifica,
      nota_proposta = EXCLUDED.nota_proposta,
      fido_teorico_puro = EXCLUDED.fido_teorico_puro,
      pavimento_applicato = EXCLUDED.pavimento_applicato,
      esposizione_corrente = EXCLUDED.esposizione_corrente,
      calcolato_at = now();

    v_offset := v_offset + v_chunk;
    v_ids := NULL;
  END LOOP;

  DELETE FROM public.fido_teorico_cliente f
  WHERE NOT EXISTS (SELECT 1 FROM public.clienti c WHERE c.id = f.cliente_id);

  v_now := now();

  INSERT INTO public.configurazioni (chiave, valore, descrizione)
  VALUES ('fido_teorico_ultimo_ricalcolo', v_now::text, 'Ultimo ricalcolo del precalcolo fido teorico')
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.ricalcola_fido_teorico() FROM public;
GRANT EXECUTE ON FUNCTION public.ricalcola_fido_teorico() TO authenticated, service_role;