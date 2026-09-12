CREATE OR REPLACE FUNCTION public.registra_adesione_evento_whatsapp(_numero_raw text)
RETURNS TABLE(ok boolean, evento_id uuid, gia_presente boolean, motivo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _coda10 text;
  _contatto_id uuid;
  _cliente_id uuid;
  _ev_id uuid;
BEGIN
  _digits := regexp_replace(_numero_raw, '\D', '', 'g');
  IF length(_digits) < 8 THEN
    RETURN QUERY SELECT false AS ok, NULL::uuid AS evento_id, false AS gia_presente, 'numero non valido'::text AS motivo;
    RETURN;
  END IF;

  _coda10 := right(_digits, 10);

  SELECT m.contatto_id, m.cliente_id, c.evento_id
  INTO _contatto_id, _cliente_id, _ev_id
  FROM messaggi_whatsapp m
  JOIN campagne_whatsapp c ON c.id = m.campagna_id
  WHERE c.evento_id IS NOT NULL
    AND m.stato IN ('inviato', 'consegnato', 'letto')
    AND right(regexp_replace(m.numero_dest, '\D', '', 'g'), 10) = _coda10
  ORDER BY m.inviato_at DESC NULLS LAST, m.created_at DESC
  LIMIT 1;

  IF _ev_id IS NULL THEN
    RETURN QUERY SELECT false AS ok, NULL::uuid AS evento_id, false AS gia_presente, 'nessuna campagna-evento trovata per il numero'::text AS motivo;
    RETURN;
  END IF;

  IF _contatto_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM eventi_partecipanti ep
    WHERE ep.evento_id = _ev_id AND ep.contatto_id = _contatto_id
  ) THEN
    RETURN QUERY SELECT true AS ok, _ev_id AS evento_id, true AS gia_presente, 'già presente'::text AS motivo;
    RETURN;
  END IF;

  INSERT INTO eventi_partecipanti (evento_id, stato, contatto_id, cliente_id, note)
  VALUES (_ev_id, 'confermato', _contatto_id, _cliente_id, 'Adesione via WhatsApp');

  RETURN QUERY SELECT true AS ok, _ev_id AS evento_id, false AS gia_presente, 'adesione registrata'::text AS motivo;
END;
$$;

REVOKE ALL ON FUNCTION public.registra_adesione_evento_whatsapp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registra_adesione_evento_whatsapp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registra_adesione_evento_whatsapp(text) TO service_role;