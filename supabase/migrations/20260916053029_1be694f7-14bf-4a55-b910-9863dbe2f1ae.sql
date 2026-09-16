CREATE OR REPLACE FUNCTION public.cerca_candidati_riconciliazione(_partecipante_id uuid)
RETURNS TABLE(tipo text, id uuid, etichetta text, motivi text[], forte boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  p public.eventi_partecipanti%ROWTYPE;
  l public.lead%ROWTYPE;
  ct public.contatti%ROWTYPE;
  v_rs text;
  v_piva text;
  v_cf text;
  v_email text;
  v_cell text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RETURN;
  END IF;

  SELECT * INTO p FROM public.eventi_partecipanti ep WHERE ep.id = _partecipante_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p.lead_id IS NOT NULL THEN
    SELECT * INTO l FROM public.lead le WHERE le.id = p.lead_id;
  END IF;
  IF p.contatto_id IS NOT NULL THEN
    SELECT * INTO ct FROM public.contatti co WHERE co.id = p.contatto_id;
  END IF;

  v_rs := public.normalizza_ragione_sociale(coalesce(p.ragione_sociale, l.ragione_sociale));
  v_piva := nullif(btrim(coalesce(p.partita_iva, l.partita_iva)), '');
  IF v_piva IN ('102730', '102729') THEN v_piva := NULL; END IF;
  v_cf := nullif(upper(btrim(coalesce(p.codice_fiscale, l.codice_fiscale))), '');
  IF v_cf IN ('102730', '102729') THEN v_cf := NULL; END IF;
  v_email := nullif(lower(btrim(coalesce(p.email, l.email, ct.email))), '');
  v_cell := public.normalizza_numero_it(coalesce(l.cellulare, ct.cellulare, p.telefono));

  IF v_rs IS NULL AND v_piva IS NULL AND v_cf IS NULL AND v_email IS NULL AND v_cell IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidati AS (
    -- clienti diretti
    SELECT 'cliente'::text AS tipo, c.id, c.ragione_sociale AS etichetta,
           ARRAY_REMOVE(ARRAY[
             CASE WHEN v_piva IS NOT NULL AND btrim(c.partita_iva) = v_piva THEN 'Stessa partita IVA' END,
             CASE WHEN v_cf IS NOT NULL AND upper(btrim(c.codice_fiscale)) = v_cf THEN 'Stesso codice fiscale' END,
             CASE WHEN v_email IS NOT NULL AND lower(btrim(c.email)) = v_email THEN 'Stessa email' END,
             CASE WHEN v_cell IS NOT NULL AND public.normalizza_numero_it(c.cellulare) = v_cell THEN 'Stesso cellulare' END,
             CASE WHEN v_rs IS NOT NULL AND public.normalizza_ragione_sociale(c.ragione_sociale) = v_rs THEN 'Stessa ragione sociale' END
           ], NULL) AS motivi
    FROM public.clienti c
    -- clienti via contatti
    UNION ALL
    SELECT 'cliente'::text, ctc.cliente_id, cl.ragione_sociale,
           ARRAY_REMOVE(ARRAY[
             CASE WHEN v_email IS NOT NULL AND lower(btrim(ctc.email)) = v_email THEN 'Stessa email (contatto)' END,
             CASE WHEN v_cell IS NOT NULL AND public.normalizza_numero_it(ctc.cellulare) = v_cell THEN 'Stesso cellulare (contatto)' END,
             CASE WHEN v_cf IS NOT NULL AND upper(btrim(ctc.codice_fiscale)) = v_cf THEN 'Stesso codice fiscale (contatto)' END
           ], NULL)
    FROM public.contatti ctc
    JOIN public.clienti cl ON cl.id = ctc.cliente_id
    WHERE ctc.cliente_id IS NOT NULL
      AND (
        (v_email IS NOT NULL AND lower(btrim(ctc.email)) = v_email)
        OR (v_cell IS NOT NULL AND public.normalizza_numero_it(ctc.cellulare) = v_cell)
        OR (v_cf IS NOT NULL AND upper(btrim(ctc.codice_fiscale)) = v_cf)
      )
    -- lead veri diretti
    UNION ALL
    SELECT 'lead'::text, l2.id, coalesce(l2.ragione_sociale, btrim(l2.nome || ' ' || l2.cognome)),
           ARRAY_REMOVE(ARRAY[
             CASE WHEN v_piva IS NOT NULL AND btrim(l2.partita_iva) = v_piva THEN 'Stessa partita IVA' END,
             CASE WHEN v_cf IS NOT NULL AND upper(btrim(l2.codice_fiscale)) = v_cf THEN 'Stesso codice fiscale' END,
             CASE WHEN v_email IS NOT NULL AND lower(btrim(l2.email)) = v_email THEN 'Stessa email' END,
             CASE WHEN v_cell IS NOT NULL AND public.normalizza_numero_it(l2.cellulare) = v_cell THEN 'Stesso cellulare' END,
             CASE WHEN v_rs IS NOT NULL AND public.normalizza_ragione_sociale(l2.ragione_sociale) = v_rs THEN 'Stessa ragione sociale' END
           ], NULL)
    FROM public.lead l2
    WHERE l2.id IS DISTINCT FROM p.lead_id
      AND NOT (
        l2.fonte = 'evento'
        AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = l2.id)
        AND NOT EXISTS (SELECT 1 FROM public.cantieri ca WHERE ca.lead_id = l2.id)
      )
    -- lead veri via contatti
    UNION ALL
    SELECT 'lead'::text, ctl.lead_id, coalesce(l3.ragione_sociale, btrim(l3.nome || ' ' || l3.cognome)),
           ARRAY_REMOVE(ARRAY[
             CASE WHEN v_email IS NOT NULL AND lower(btrim(ctl.email)) = v_email THEN 'Stessa email (contatto)' END,
             CASE WHEN v_cell IS NOT NULL AND public.normalizza_numero_it(ctl.cellulare) = v_cell THEN 'Stesso cellulare (contatto)' END,
             CASE WHEN v_cf IS NOT NULL AND upper(btrim(ctl.codice_fiscale)) = v_cf THEN 'Stesso codice fiscale (contatto)' END
           ], NULL)
    FROM public.contatti ctl
    JOIN public.lead l3 ON l3.id = ctl.lead_id
    WHERE ctl.lead_id IS NOT NULL
      AND ctl.lead_id IS DISTINCT FROM p.lead_id
      AND (
        (v_email IS NOT NULL AND lower(btrim(ctl.email)) = v_email)
        OR (v_cell IS NOT NULL AND public.normalizza_numero_it(ctl.cellulare) = v_cell)
        OR (v_cf IS NOT NULL AND upper(btrim(ctl.codice_fiscale)) = v_cf)
      )
      AND NOT (
        l3.fonte = 'evento'
        AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = l3.id)
        AND NOT EXISTS (SELECT 1 FROM public.cantieri ca WHERE ca.lead_id = l3.id)
      )
  ),
  filtrati AS (
    SELECT ca.tipo, ca.id, ca.etichetta, ca.motivi,
           (
             ca.motivi::text[] @> ARRAY['Stessa partita IVA']
             OR ca.motivi::text[] @> ARRAY['Stesso codice fiscale']
             OR ca.motivi::text[] @> ARRAY['Stessa email']
             OR ca.motivi::text[] @> ARRAY['Stesso cellulare']
             OR ca.motivi::text[] @> ARRAY['Stessa email (contatto)']
             OR ca.motivi::text[] @> ARRAY['Stesso cellulare (contatto)']
             OR ca.motivi::text[] @> ARRAY['Stesso codice fiscale (contatto)']
           ) AS forte
    FROM candidati ca
    WHERE array_length(ca.motivi, 1) IS NOT NULL
  ),
  aggregati AS (
    SELECT f.tipo, f.id, f.etichetta, bool_or(f.forte) AS forte
    FROM filtrati f
    GROUP BY f.tipo, f.id, f.etichetta
  ),
  finali AS (
    SELECT a.tipo, a.id, a.etichetta, a.forte,
           (SELECT array_agg(DISTINCT m)
            FROM filtrati f2, LATERAL unnest(f2.motivi) u(m)
            WHERE f2.tipo = a.tipo AND f2.id = a.id) AS motivi
    FROM aggregati a
  )
  SELECT fi.tipo, fi.id, fi.etichetta, fi.motivi, fi.forte
  FROM finali fi
  ORDER BY fi.forte DESC, cardinality(fi.motivi) DESC;
END;
$$;