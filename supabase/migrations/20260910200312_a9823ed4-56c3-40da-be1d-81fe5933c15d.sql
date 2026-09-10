CREATE OR REPLACE FUNCTION public.upsert_iscritto_da_contatto(_contatto_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  v_norm text;
  v_id uuid;
BEGIN
  SELECT id, cliente_id, lead_id, nome, cognome, email, cellulare
    INTO c
  FROM public.contatti
  WHERE id = _contatto_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_norm := public.normalizza_numero_it(c.cellulare);
  IF v_norm IS NULL THEN RETURN NULL; END IF;

  SELECT i.id INTO v_id
  FROM public.iscritti_whatsapp i
  WHERE i.contatto_id = _contatto_id
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    SELECT i.id INTO v_id
    FROM public.iscritti_whatsapp i
    WHERE i.numero_norm = v_norm
    ORDER BY i.created_at DESC
    LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.iscritti_whatsapp i
    SET contatto_id = _contatto_id,
        cliente_id = COALESCE(c.cliente_id, i.cliente_id),
        lead_id = COALESCE(c.lead_id, i.lead_id),
        nome = COALESCE(NULLIF(btrim(c.nome), ''), i.nome),
        cognome = COALESCE(NULLIF(btrim(c.cognome), ''), i.cognome),
        email = COALESCE(NULLIF(btrim(c.email), ''), i.email),
        stato = CASE
                  WHEN COALESCE(c.cliente_id, i.cliente_id) IS NOT NULL THEN 'collegato_cliente'
                  WHEN COALESCE(c.lead_id, i.lead_id) IS NOT NULL THEN 'collegato_lead'
                  ELSE i.stato
                END
    WHERE i.id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.iscritti_whatsapp
    (numero_norm, numero_raw, nome, cognome, email, origine, stato, cliente_id, lead_id, contatto_id)
  VALUES (
    v_norm,
    c.cellulare,
    NULLIF(btrim(c.nome), ''),
    NULLIF(btrim(c.cognome), ''),
    NULLIF(btrim(c.email), ''),
    'di_persona',
    CASE WHEN c.cliente_id IS NOT NULL THEN 'collegato_cliente'
         WHEN c.lead_id IS NOT NULL THEN 'collegato_lead'
         ELSE 'nuovo' END,
    c.cliente_id,
    c.lead_id,
    _contatto_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_iscritto_da_contatto(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_iscritto_da_contatto(uuid) TO service_role;