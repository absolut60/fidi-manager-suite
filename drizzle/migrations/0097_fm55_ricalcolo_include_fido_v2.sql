-- FM55: il ricalcolo (manuale e automatico) aggiorna anche fido_teorico_v2.
-- Rispetto alla versione precedente si aggiungono SOLO l'upsert in fido_teorico_v2
-- (blocco) e la pulizia dei clienti eliminati (finalizza).
CREATE OR REPLACE FUNCTION public.ricalcola_fido_teorico_blocco(_dopo_id uuid, _dimensione integer DEFAULT 500)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND NOT public.has_role(auth.uid(), 'amministratore')
     AND NOT public.has_role(auth.uid(), 'direzione') THEN
    RAISE EXCEPTION 'Operazione non consentita';
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_ids
  FROM (
    SELECT id FROM public.clienti
    WHERE (_dopo_id IS NULL OR id > _dopo_id)
    ORDER BY id
    LIMIT _dimensione
  ) s;

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN NULL;
  END IF;

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

  UPDATE public.fido_teorico_cliente f
  SET semaforo_stadio = s.stadio,
      semaforo_motivo = s.motivo,
      semaforo_numero = s.numero
  FROM public.calcola_semaforo_affidabilita_batch(v_ids) s
  WHERE f.cliente_id = s.cliente_id;

  -- FM55: nuovo fido teorico in parallelo (sola osservazione)
  INSERT INTO public.fido_teorico_v2 (
    cliente_id, acquisto_storico, acquisto_tendenza, acquisto_mensile, ciclo_gg,
    mesi_stagionali, profilo, coefficiente, base, esposizione, ordini_aperti,
    fabbisogno, fido_proposto, fido_attuale, consumo_perc, regola, da_verificare,
    spiegazione, calcolato_at
  )
  SELECT v.cliente_id, v.acquisto_storico, v.acquisto_tendenza, v.acquisto_mensile, v.ciclo_gg,
    v.mesi_stagionali, v.profilo, v.coefficiente, v.base, v.esposizione, v.ordini_aperti,
    v.fabbisogno, v.fido_proposto, v.fido_attuale, v.consumo_perc, v.regola, v.da_verificare,
    v.spiegazione, now()
  FROM public.get_fido_teorico_v2(v_ids) v
  ON CONFLICT (cliente_id) DO UPDATE SET
    acquisto_storico = EXCLUDED.acquisto_storico,
    acquisto_tendenza = EXCLUDED.acquisto_tendenza,
    acquisto_mensile = EXCLUDED.acquisto_mensile,
    ciclo_gg = EXCLUDED.ciclo_gg,
    mesi_stagionali = EXCLUDED.mesi_stagionali,
    profilo = EXCLUDED.profilo,
    coefficiente = EXCLUDED.coefficiente,
    base = EXCLUDED.base,
    esposizione = EXCLUDED.esposizione,
    ordini_aperti = EXCLUDED.ordini_aperti,
    fabbisogno = EXCLUDED.fabbisogno,
    fido_proposto = EXCLUDED.fido_proposto,
    fido_attuale = EXCLUDED.fido_attuale,
    consumo_perc = EXCLUDED.consumo_perc,
    regola = EXCLUDED.regola,
    da_verificare = EXCLUDED.da_verificare,
    spiegazione = EXCLUDED.spiegazione,
    calcolato_at = now();

  RETURN v_ids[array_length(v_ids, 1)];
END;
$function$;

CREATE OR REPLACE FUNCTION public.ricalcola_fido_teorico_finalizza()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz;
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND NOT public.has_role(auth.uid(), 'amministratore')
     AND NOT public.has_role(auth.uid(), 'direzione') THEN
    RAISE EXCEPTION 'Operazione non consentita';
  END IF;

  DELETE FROM public.fido_teorico_cliente f
  WHERE NOT EXISTS (SELECT 1 FROM public.clienti c WHERE c.id = f.cliente_id);

  DELETE FROM public.fido_teorico_v2 f
  WHERE NOT EXISTS (SELECT 1 FROM public.clienti c WHERE c.id = f.cliente_id);

  v_now := now();

  INSERT INTO public.configurazioni (chiave, valore, descrizione)
  VALUES ('fido_teorico_ultimo_ricalcolo', v_now::text, 'Ultimo ricalcolo del precalcolo fido teorico')
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;

  RETURN v_now;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ricalcola_fido_teorico_finalizza() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ricalcola_fido_teorico_finalizza() TO authenticated, service_role;