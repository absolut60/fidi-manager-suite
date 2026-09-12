CREATE OR REPLACE FUNCTION public.get_destinatari_whatsapp_segmento(_filtri jsonb)
 RETURNS TABLE(contatto_id uuid, cliente_id uuid, cellulare text, nome_riferimento text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(ct.id)
    INTO v_ids
  FROM public.contatti ct
  WHERE ct.cliente_id IN (SELECT rp.cliente_id FROM public.risolvi_pubblico_segmento(_filtri) rp)
    AND public.fn_telefono_valido(ct.cellulare);

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH consensi AS MATERIALIZED (
    SELECT sc.contatto_id, sc.whatsapp
    FROM public.get_stato_consensi(v_ids) sc
    WHERE sc.whatsapp = true
  )
  SELECT
    ct.id AS contatto_id,
    ct.cliente_id,
    ct.cellulare,
    NULLIF(btrim(coalesce(ct.nome,'') || ' ' || coalesce(ct.cognome,'')), '') AS nome_riferimento
  FROM public.contatti ct
  JOIN consensi cs ON cs.contatto_id = ct.id
  WHERE ct.id = ANY(v_ids);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_destinatari_whatsapp_segmento(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.conta_contattabili_canale(_filtri jsonb, _canale text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF _canale = 'whatsapp' THEN
    SELECT count(*)::int INTO v_count
    FROM public.get_destinatari_whatsapp_segmento(_filtri);
    RETURN COALESCE(v_count, 0);

  ELSIF _canale = 'email' THEN
    WITH pubblico AS MATERIALIZED (
      SELECT rp.cliente_id FROM public.risolvi_pubblico_segmento(_filtri) rp
    ),
    indirizzi AS (
      SELECT lower(btrim(c.email)) AS email_norm
      FROM public.clienti c
      JOIN pubblico p ON p.cliente_id = c.id
      WHERE public.fn_email_valida(c.email)
      UNION
      SELECT lower(btrim(ct.email)) AS email_norm
      FROM public.contatti ct
      JOIN pubblico p ON p.cliente_id = ct.cliente_id
      WHERE public.fn_email_valida(ct.email)
    )
    SELECT count(DISTINCT i.email_norm)::int INTO v_count
    FROM indirizzi i
    WHERE NOT EXISTS (
      SELECT 1 FROM public.marketing_opt_out moo
      WHERE lower(btrim(moo.email)) = i.email_norm
    );
    RETURN COALESCE(v_count, 0);
  END IF;

  RETURN 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.conta_contattabili_canale(jsonb, text) TO authenticated;