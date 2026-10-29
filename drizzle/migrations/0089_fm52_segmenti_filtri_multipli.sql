-- FM52: Segmenti marketing, filtri Store/Agente/Macrocategoria/Categoria/Semaforo/Tipo soggetto/Consenso a scelta multipla.
-- risolvi_pubblico_segmento(jsonb): stessa firma, CREATE OR REPLACE, permessi invariati (solo service_role).
-- Lettura compatibile: array JSON -> elenco; stringa 'tutti'/''/assente -> tutti; altra stringa -> elenco di un elemento.
-- Semaforo (decisione di Andrea): fonte unica fido_teorico_cliente.semaforo_stadio; senza riga = nessun semaforo.
DO $chk$
BEGIN
  IF md5(pg_get_functiondef('public.risolvi_pubblico_segmento(jsonb)'::regprocedure)) <> '0ac18dc9d5dabbd312590d60f156d283' THEN
    RAISE EXCEPTION 'FM52: corpo inatteso risolvi_pubblico_segmento';
  END IF;
END $chk$;

CREATE OR REPLACE FUNCTION public._segmento_filtro_elenco(_v jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _v IS NULL OR jsonb_typeof(_v) = 'null' THEN NULL::text[]
    WHEN jsonb_typeof(_v) = 'array' THEN (
      SELECT NULLIF(COALESCE(array_agg(e) FILTER (WHERE e <> '' AND e <> 'tutti'), '{}'::text[]), '{}'::text[])
      FROM jsonb_array_elements_text(_v) AS e)
    WHEN jsonb_typeof(_v) = 'string' AND (_v #>> '{}') NOT IN ('', 'tutti') THEN ARRAY[_v #>> '{}']
    ELSE NULL::text[]
  END
$$;
COMMENT ON FUNCTION public._segmento_filtro_elenco(jsonb) IS
  'FM52: converte un valore di segmenti_marketing.filtri (stringa vecchia o array nuovo) in elenco; NULL = tutti.';
REVOKE EXECUTE ON FUNCTION public._segmento_filtro_elenco(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._segmento_filtro_elenco(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.risolvi_pubblico_segmento(_filtri jsonb)
 RETURNS TABLE(cliente_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stores text[]           := public._segmento_filtro_elenco(_filtri->'storeFiltro');
  v_agenti text[]           := public._segmento_filtro_elenco(_filtri->'filtroAgente');
  v_macro text[]            := public._segmento_filtro_elenco(_filtri->'macrocategoria');
  v_categorie text[]        := public._segmento_filtro_elenco(_filtri->'categoria');
  v_blocco text             := COALESCE(_filtri->>'filtroBlocco', 'tutti');
  v_tipi_soggetto text[]    := public._segmento_filtro_elenco(_filtri->'filtroTipoSoggetto');
  v_ricerca text            := COALESCE(_filtri->>'ricerca', '');
  v_citta text              := COALESCE(_filtri->>'citta', '');
  v_provincia text          := COALESCE(_filtri->>'provincia', '');
  v_filtro_email text       := COALESCE(_filtri->>'filtroEmail', 'tutti');
  v_filtro_disiscritti text := COALESCE(_filtri->>'filtroDisiscritti', 'tutti');
  v_consensi text[]         := public._segmento_filtro_elenco(_filtri->'filtroConsenso');
  v_fatturato text          := COALESCE(_filtri->>'fatturato', 'tutti');
  v_semafori text[]         := public._segmento_filtro_elenco(_filtri->'semaforo');
BEGIN
  RETURN QUERY
  WITH
  email_set AS MATERIALIZED (
    SELECT g.id FROM public.get_clienti_email_valida_ids(v_filtro_email) g
    WHERE v_filtro_email IN ('con','senza')
  ),
  disisc_set AS MATERIALIZED (
    SELECT g.id FROM public.get_clienti_disiscritti_ids(
      CASE WHEN v_filtro_disiscritti = 'solo' THEN 'disiscritti' ELSE 'non_disiscritti' END) g
    WHERE v_filtro_disiscritti <> 'tutti'
  ),
  fatt AS MATERIALIZED (
    SELECT fc.cliente_id, SUM(COALESCE(fc.fatturato,0))::numeric AS tot
    FROM public.fatturato_clienti fc
    WHERE fc.anno = EXTRACT(YEAR FROM now())::int AND fc.cliente_id IS NOT NULL
    GROUP BY fc.cliente_id
  )
  SELECT c.id
  FROM public.clienti c
  WHERE c.attivo = true
    AND (v_stores IS NULL OR c.store_id = ANY(v_stores::uuid[]))
    AND (v_agenti IS NULL
         OR ('__none__' = ANY(v_agenti) AND c.codice_agente IS NULL)
         OR c.codice_agente = ANY(v_agenti))
    AND (v_macro IS NULL OR c.codice_macrocategoria = ANY(v_macro))
    AND (v_categorie IS NULL OR c.codice_categoria = ANY(v_categorie))
    AND (v_blocco = 'tutti' OR (v_blocco = 'bloccati' AND c.bloccato = true) OR (v_blocco = 'non_bloccati' AND c.bloccato = false))
    AND (v_tipi_soggetto IS NULL
         OR ('fisica' = ANY(v_tipi_soggetto) AND c.tipo_soggetto = 'persona_fisica')
         OR ('giuridica' = ANY(v_tipi_soggetto) AND c.tipo_soggetto = 'azienda'))
    AND (btrim(v_ricerca) = '' OR c.ragione_sociale ILIKE '%'||btrim(v_ricerca)||'%')
    AND (btrim(v_citta) = '' OR c.citta ILIKE '%'||btrim(v_citta)||'%')
    AND (btrim(v_provincia) = '' OR c.provincia ILIKE '%'||btrim(v_provincia)||'%')
    AND (v_semafori IS NULL OR EXISTS (
           SELECT 1 FROM public.fido_teorico_cliente ftc
           WHERE ftc.cliente_id = c.id AND ftc.semaforo_stadio = ANY(v_semafori)))
    AND (v_filtro_email NOT IN ('con','senza') OR c.id IN (SELECT id FROM email_set))
    AND (v_filtro_disiscritti = 'tutti' OR c.id IN (SELECT id FROM disisc_set))
    AND (v_consensi IS NULL OR EXISTS (
           SELECT 1 FROM public.contatti ct WHERE ct.cliente_id = c.id AND (
             ('marketing_diretto' = ANY(v_consensi) AND ct.consenso_marketing_diretto = true)
             OR ('marketing_media' = ANY(v_consensi) AND ct.consenso_marketing_media = true)
             OR ('profilazione' = ANY(v_consensi) AND ct.consenso_profilazione = true))))
    AND (v_fatturato = 'tutti' OR (CASE v_fatturato
           WHEN 'nessuno'    THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) = 0
           WHEN '0_10k'      THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) > 0 AND COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) <= 10000
           WHEN '10k_50k'    THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) > 10000 AND COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) <= 50000
           WHEN '50k_100k'   THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) > 50000 AND COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) <= 100000
           WHEN 'oltre_100k' THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) > 100000
           ELSE true END));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.risolvi_pubblico_segmento(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.risolvi_pubblico_segmento(jsonb) TO service_role;