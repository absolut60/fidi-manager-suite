CREATE OR REPLACE FUNCTION public.classifica_iscritto_whatsapp(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_isc public.iscritti_whatsapp%ROWTYPE;
  v_num text;
  v_rs_norm text;
  v_cand_cli jsonb := '[]'::jsonb;
  v_cand_lead jsonb := '[]'::jsonb;
  v_n_cli_distinti int := 0;
  v_esito text;
BEGIN
  SELECT * INTO v_isc FROM public.iscritti_whatsapp WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_trovato');
  END IF;

  v_num := v_isc.numero_norm;
  v_rs_norm := NULLIF(public.normalizza_ragione_sociale(coalesce(v_isc.azienda,'')), '');

  -- Candidati CLIENTE: match per numero (cellulare) e/o per impresa (ragione sociale normalizzata)
  WITH per_numero AS (
    SELECT c.id, c.ragione_sociale, 'numero'::text AS motivo
    FROM public.clienti c
    WHERE v_num IS NOT NULL AND public.normalizza_numero_it(c.cellulare) = v_num
  ),
  per_impresa AS (
    SELECT c.id, c.ragione_sociale, 'impresa'::text AS motivo
    FROM public.clienti c
    WHERE v_rs_norm IS NOT NULL AND public.normalizza_ragione_sociale(c.ragione_sociale) = v_rs_norm
  ),
  uni AS (
    SELECT id, ragione_sociale, string_agg(DISTINCT motivo, '+' ORDER BY motivo) AS motivi
    FROM (SELECT * FROM per_numero UNION ALL SELECT * FROM per_impresa) x
    GROUP BY id, ragione_sociale
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object('cliente_id', id, 'ragione_sociale', ragione_sociale, 'motivi', motivi) ORDER BY ragione_sociale), '[]'::jsonb),
    count(*)
  INTO v_cand_cli, v_n_cli_distinti
  FROM uni;

  -- Candidati LEAD: match per numero
  SELECT coalesce(jsonb_agg(jsonb_build_object('lead_id', l.id, 'nominativo', trim(coalesce(l.ragione_sociale, (coalesce(l.nome,'')||' '||coalesce(l.cognome,'')))), 'motivi', 'numero') ORDER BY l.id), '[]'::jsonb)
  INTO v_cand_lead
  FROM public.lead l
  WHERE v_num IS NOT NULL AND public.normalizza_numero_it(l.cellulare) = v_num;

  -- Decisione
  IF v_n_cli_distinti = 1 THEN
    v_esito := 'collega_auto';
  ELSIF v_n_cli_distinti >= 2 THEN
    v_esito := 'ambiguo';
  ELSIF v_n_cli_distinti = 0 AND jsonb_array_length(v_cand_lead) >= 1 THEN
    v_esito := 'ambiguo';          -- proposta lead esistente da confermare
  ELSE
    v_esito := 'nuovo';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'iscritto_id', _id,
    'numero', v_num,
    'impresa_norm', v_rs_norm,
    'esito', v_esito,
    'n_clienti_candidati', v_n_cli_distinti,
    'candidati_clienti', v_cand_cli,
    'candidati_lead', v_cand_lead
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.classifica_iscritto_whatsapp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classifica_iscritto_whatsapp(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.classifica_iscritto_whatsapp(uuid) TO supabase_read_only_user;