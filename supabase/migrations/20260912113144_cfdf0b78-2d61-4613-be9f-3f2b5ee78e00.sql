CREATE OR REPLACE FUNCTION public.risolvi_pubblico_segmento(_filtri jsonb)
RETURNS TABLE(cliente_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH f AS (
    SELECT
      COALESCE(_filtri->>'storeFiltro', 'tutti')        AS store_filtro,
      COALESCE(_filtri->>'filtroAgente', 'tutti')       AS filtro_agente,
      COALESCE(_filtri->>'macrocategoria', 'tutti')     AS macrocategoria,
      COALESCE(_filtri->>'categoria', 'tutti')          AS categoria,
      COALESCE(_filtri->>'filtroBlocco', 'tutti')       AS filtro_blocco,
      COALESCE(_filtri->>'filtroTipoSoggetto', 'tutti') AS filtro_tipo_soggetto,
      COALESCE(_filtri->>'ricerca', '')                 AS ricerca,
      COALESCE(_filtri->>'citta', '')                   AS citta,
      COALESCE(_filtri->>'provincia', '')               AS provincia,
      COALESCE(_filtri->>'filtroEmail', 'tutti')        AS filtro_email,
      COALESCE(_filtri->>'filtroDisiscritti', 'tutti')  AS filtro_disiscritti,
      COALESCE(_filtri->>'filtroConsenso', 'tutti')     AS filtro_consenso,
      COALESCE(_filtri->>'fatturato', 'tutti')          AS fatturato,
      COALESCE(_filtri->>'semaforo', 'tutti')           AS semaforo
  ),
  base AS (
    SELECT c.id
    FROM public.clienti c, f
    WHERE c.attivo = true
      AND (f.store_filtro = 'tutti' OR c.store_id = NULLIF(f.store_filtro,'')::uuid)
      AND (
        f.filtro_agente = 'tutti'
        OR (f.filtro_agente = '__none__' AND c.codice_agente IS NULL)
        OR (f.filtro_agente <> '__none__' AND c.codice_agente = f.filtro_agente)
      )
      AND (f.macrocategoria = 'tutti' OR c.codice_macrocategoria = f.macrocategoria)
      AND (f.categoria = 'tutti' OR c.codice_categoria = f.categoria)
      AND (
        f.filtro_blocco = 'tutti'
        OR (f.filtro_blocco = 'bloccati' AND c.bloccato = true)
        OR (f.filtro_blocco = 'non_bloccati' AND c.bloccato = false)
      )
      AND (
        f.filtro_tipo_soggetto = 'tutti'
        OR (f.filtro_tipo_soggetto = 'fisica' AND c.tipo_soggetto = 'persona_fisica')
        OR (f.filtro_tipo_soggetto = 'giuridica' AND c.tipo_soggetto = 'azienda')
      )
      AND (btrim(f.ricerca) = '' OR c.ragione_sociale ILIKE '%' || btrim(f.ricerca) || '%')
      AND (btrim(f.citta) = '' OR c.citta ILIKE '%' || btrim(f.citta) || '%')
      AND (btrim(f.provincia) = '' OR c.provincia ILIKE '%' || btrim(f.provincia) || '%')
      AND (
        f.semaforo = 'tutti'
        OR f.semaforo = (
          CASE
            WHEN c.fido_residuo IS NOT NULL AND c.fido_residuo < 0 THEN 'rosso'
            WHEN c.fido_residuo IS NOT NULL AND c.fido_gestionale IS NOT NULL
                 AND c.fido_gestionale > 0 AND c.fido_residuo < c.fido_gestionale * 0.1 THEN 'arancione'
            WHEN c.scaduto IS NOT NULL AND c.scaduto > 0 THEN 'giallo'
            ELSE 'verde'
          END
        )
      )
  ),
  fatt AS (
    SELECT fc.cliente_id, SUM(COALESCE(fc.fatturato,0))::numeric AS tot
    FROM public.fatturato_clienti fc
    WHERE fc.anno = EXTRACT(YEAR FROM now())::int
      AND fc.cliente_id IS NOT NULL
    GROUP BY fc.cliente_id
  )
  SELECT b.id
  FROM base b, f
  WHERE (
      f.filtro_email NOT IN ('con','senza')
      OR b.id IN (SELECT id FROM public.get_clienti_email_valida_ids(f.filtro_email))
    )
    AND (
      f.filtro_disiscritti = 'tutti'
      OR b.id IN (
        SELECT id FROM public.get_clienti_disiscritti_ids(
          CASE WHEN f.filtro_disiscritti = 'solo' THEN 'disiscritti' ELSE 'non_disiscritti' END
        )
      )
    )
    AND (
      f.filtro_consenso = 'tutti'
      OR EXISTS (
        SELECT 1 FROM public.contatti ct
        WHERE ct.cliente_id = b.id
          AND (
            (f.filtro_consenso = 'marketing_diretto' AND ct.consenso_marketing_diretto = true)
            OR (f.filtro_consenso = 'marketing_media' AND ct.consenso_marketing_media = true)
            OR (f.filtro_consenso = 'profilazione' AND ct.consenso_profilazione = true)
          )
      )
    )
    AND (
      f.fatturato = 'tutti'
      OR (
        CASE f.fatturato
          WHEN 'nessuno'    THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = b.id), 0) = 0
          WHEN '0_10k'      THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = b.id), 0) > 0
                                 AND COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = b.id), 0) <= 10000
          WHEN '10k_50k'    THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = b.id), 0) > 10000
                                 AND COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = b.id), 0) <= 50000
          WHEN '50k_100k'   THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = b.id), 0) > 50000
                                 AND COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = b.id), 0) <= 100000
          WHEN 'oltre_100k' THEN COALESCE((SELECT tot FROM fatt WHERE fatt.cliente_id = b.id), 0) > 100000
          ELSE true
        END
      )
    );
$function$;

GRANT EXECUTE ON FUNCTION public.risolvi_pubblico_segmento(jsonb) TO authenticated;