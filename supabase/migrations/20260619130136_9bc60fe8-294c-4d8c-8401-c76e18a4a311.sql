CREATE OR REPLACE FUNCTION public.bulk_update_clienti_bfa(_payloads jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH upd AS (
    UPDATE public.clienti c
    SET
      bloccato = COALESCE((p->>'bloccato')::boolean, c.bloccato),
      ind_blocco = COALESCE((p->>'ind_blocco')::int, c.ind_blocco),
      motivo_blocco = CASE WHEN p ? 'motivo_blocco' THEN NULLIF(p->>'motivo_blocco','__NULL__') ELSE c.motivo_blocco END,
      data_blocco = CASE WHEN p ? 'data_blocco' THEN (NULLIF(p->>'data_blocco','__NULL__'))::timestamptz ELSE c.data_blocco END,
      ultima_data_fatturazione = CASE WHEN p ? 'ultima_data_fatturazione' THEN (NULLIF(p->>'ultima_data_fatturazione','__NULL__'))::date ELSE c.ultima_data_fatturazione END,
      cliente_attivo = COALESCE((p->>'cliente_attivo')::boolean, c.cliente_attivo),
      fido_gestionale = COALESCE((p->>'fido_gestionale')::numeric, c.fido_gestionale),
      assicurazione_attiva = COALESCE((p->>'assicurazione_attiva')::boolean, c.assicurazione_attiva),
      ultima_importazione_d = COALESCE((p->>'ultima_importazione_d')::timestamptz, c.ultima_importazione_d)
    FROM jsonb_array_elements(_payloads) AS p
    WHERE c.id = (p->>'id')::uuid
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_update_clienti_bfa(jsonb) TO service_role;