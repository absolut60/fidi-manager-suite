CREATE OR REPLACE FUNCTION public.risolvi_pubblico_segmento(_filtri jsonb)
RETURNS TABLE(cliente_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_store text              := COALESCE(_filtri->>'storeFiltro', 'tutti');
  v_filtro_agente text      := COALESCE(_filtri->>'filtroAgente', 'tutti');
  v_macro text              := COALESCE(_filtri->>'macrocategoria', 'tutti');
  v_categoria text          := COALESCE(_filtri->>'categoria', 'tutti');
  v_blocco text             := COALESCE(_filtri->>'filtroBlocco', 'tutti');
  v_tipo_soggetto text      := COALESCE(_filtri->>'filtroTipoSoggetto', 'tutti');
  v_ricerca text            := COALESCE(_filtri->>'ricerca', '');
  v_citta text              := COALESCE(_filtri->>'citta', '');
  v_provincia text          := COALESCE(_filtri->>'provincia', '');
  v_filtro_email text       := COALESCE(_filtri->>'filtroEmail', 'tutti');
  v_filtro_disiscritti text := COALESCE(_filtri->>'filtroDisiscritti', 'tutti');
  v_filtro_consenso text    := COALESCE(_filtri->>'filtroConsenso', 'tutti');
  v_fatturato text          := COALESCE(_filtri->>'fatturato', 'tutti');
  v_semaforo text           := COALESCE(_filtri->>'semaforo', 'tutti');
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
    AND (v_store = 'tutti' OR c.store_id = NULLIF(v_store,'')::uuid)
    AND (v_filtro_agente = 'tutti'
         OR (v_filtro_agente = '__none__' AND c.codice_agente IS NULL)
         OR (v_filtro_agente <> '__none__' AND c.codice_agente = v_filtro_agente))
    AND (v_macro = 'tutti' OR c.codice_macrocategoria = v_macro)
    AND (v_categoria = 'tutti' OR c.codice_categoria = v_categoria)
    AND (v_blocco = 'tutti' OR (v_blocco = 'bloccati' AND c.bloccato = true) OR (v_blocco = 'non_bloccati' AND c.bloccato = false))
    AND (v_tipo_soggetto = 'tutti'
         OR (v_tipo_soggetto = 'fisica' AND c.tipo_soggetto = 'persona_fisica')
         OR (v_tipo_soggetto = 'giuridica' AND c.tipo_soggetto = 'azienda'))
    AND (btrim(v_ricerca) = '' OR c.ragione_sociale ILIKE '%'||btrim(v_ricerca)||'%')
    AND (btrim(v_citta) = '' OR c.citta ILIKE '%'||btrim(v_citta)||'%')
    AND (btrim(v_provincia) = '' OR c.provincia ILIKE '%'||btrim(v_provincia)||'%')
    AND (v_semaforo = 'tutti' OR v_semaforo = (CASE
           WHEN c.fido_residuo IS NOT NULL AND c.fido_residuo < 0 THEN 'rosso'
           WHEN c.fido_residuo IS NOT NULL AND c.fido_gestionale IS NOT NULL AND c.fido_gestionale > 0 AND c.fido_residuo < c.fido_gestionale*0.1 THEN 'arancione'
           WHEN c.scaduto IS NOT NULL AND c.scaduto > 0 THEN 'giallo'
           ELSE 'verde' END))
    AND (v_filtro_email NOT IN ('con','senza') OR c.id IN (SELECT id FROM email_set))
    AND (v_filtro_disiscritti = 'tutti' OR c.id IN (SELECT id FROM disisc_set))
    AND (v_filtro_consenso = 'tutti' OR EXISTS (
           SELECT 1 FROM public.contatti ct WHERE ct.cliente_id = c.id AND (
             (v_filtro_consenso = 'marketing_diretto' AND ct.consenso_marketing_diretto = true)
             OR (v_filtro_consenso = 'marketing_media' AND ct.consenso_marketing_media = true)
             OR (v_filtro_consenso = 'profilazione' AND ct.consenso_profilazione = true))))
    AND (v_fatturato = 'tutti' OR (CASE v_fatturato
           WHEN 'nessuno'    THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) = 0
           WHEN '0_10k'      THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) > 0 AND COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) <= 10000
           WHEN '10k_50k'    THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) > 10000 AND COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) <= 50000
           WHEN '50k_100k'   THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) > 50000 AND COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) <= 100000
           WHEN 'oltre_100k' THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = c.id),0) > 100000
           ELSE true END));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.risolvi_pubblico_segmento(jsonb) TO authenticated;