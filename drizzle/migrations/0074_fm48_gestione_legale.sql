-- FM48 Gestione legale, fetta 1: permesso unico, regola in_gestione_legale, policy, variazioni legale, promemoria.

-- 1) Permesso unico
CREATE OR REPLACE FUNCTION public.auth_puo_gestire_legale()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_puo_inviare_recupero();
$$;
REVOKE ALL ON FUNCTION public.auth_puo_gestire_legale() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_puo_gestire_legale() FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_gestire_legale() TO authenticated;

-- 2) Nuova regola in_gestione_legale
CREATE OR REPLACE FUNCTION public.ricalcola_in_gestione_legale(_cliente_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flag boolean;
BEGIN
  IF _cliente_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pratiche_legali pl
    WHERE pl.cliente_id = _cliente_id
      AND pl.stato::text NOT IN ('chiusa_pagamento', 'chiusa_perdita')
  ) OR (
    EXISTS (
      SELECT 1 FROM public.note_legali_gestionali nl
      WHERE nl.cliente_id = _cliente_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.pratiche_legali pl2
      WHERE pl2.cliente_id = _cliente_id
    )
  )
  INTO v_flag;

  UPDATE public.clienti c
     SET in_gestione_legale = v_flag
   WHERE c.id = _cliente_id
     AND COALESCE(c.in_gestione_legale, false) IS DISTINCT FROM v_flag;
END;
$function$;

DROP TRIGGER IF EXISTS trg_note_legali_gest_gestione_legale ON public.note_legali_gestionali;
CREATE TRIGGER trg_note_legali_gest_gestione_legale
  AFTER INSERT OR UPDATE OR DELETE ON public.note_legali_gestionali
  FOR EACH ROW EXECUTE FUNCTION public.trg_ricalcola_in_gestione_legale();

-- 3) Policy
-- pratiche_legali
DROP POLICY IF EXISTS "Pratiche legali: scrittura admin/approvatori/amm/dir" ON public.pratiche_legali;
DROP POLICY IF EXISTS "Pratiche legali: visibilità per ruolo" ON public.pratiche_legali;
CREATE POLICY "Pratiche legali: visibilità per ruolo" ON public.pratiche_legali
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'amministratore'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv1'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv2'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv3'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'amministrazione'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'direzione'::public.app_role))
    OR (cliente_id IN (SELECT c.id FROM public.clienti c JOIN public.profili p ON p.id = auth.uid() WHERE c.store_id = p.store_id))
    OR (SELECT public.auth_puo_gestire_legale())
  );
CREATE POLICY "Pratiche legali: insert gestione legale" ON public.pratiche_legali
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.auth_puo_gestire_legale()));
CREATE POLICY "Pratiche legali: update gestione legale" ON public.pratiche_legali
  FOR UPDATE TO authenticated USING ((SELECT public.auth_puo_gestire_legale())) WITH CHECK ((SELECT public.auth_puo_gestire_legale()));
CREATE POLICY "Pratiche legali: delete gestione legale" ON public.pratiche_legali
  FOR DELETE TO authenticated USING ((SELECT public.auth_puo_gestire_legale()));

-- storico_pratiche_legali
DROP POLICY IF EXISTS "Storico pratiche: insert admin/approvatori" ON public.storico_pratiche_legali;
CREATE POLICY "Storico pratiche: insert gestione legale" ON public.storico_pratiche_legali
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.auth_puo_gestire_legale()));
DROP POLICY IF EXISTS "Storico pratiche: visibilità per ruolo" ON public.storico_pratiche_legali;
CREATE POLICY "Storico pratiche: visibilità per ruolo" ON public.storico_pratiche_legali
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'amministratore'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv1'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv2'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv3'::public.app_role))
    OR (pratica_id IN (
      SELECT pl.id FROM public.pratiche_legali pl
      JOIN public.clienti c ON c.id = pl.cliente_id
      JOIN public.profili p ON p.id = auth.uid()
      WHERE p.store_id IS NOT NULL AND c.store_id IS NOT NULL AND c.store_id = p.store_id
    ))
    OR (SELECT public.auth_puo_gestire_legale())
  );

-- pratiche_legali_allegati
DROP POLICY IF EXISTS "Allegati pratiche: admin/approvatori" ON public.pratiche_legali_allegati;
CREATE POLICY "Allegati pratiche: select admin/approvatori/gestione legale" ON public.pratiche_legali_allegati
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'amministratore'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv1'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv2'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv3'::public.app_role))
    OR (SELECT public.auth_puo_gestire_legale())
  );
CREATE POLICY "Allegati pratiche: insert gestione legale" ON public.pratiche_legali_allegati
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.auth_puo_gestire_legale()));
CREATE POLICY "Allegati pratiche: update gestione legale" ON public.pratiche_legali_allegati
  FOR UPDATE TO authenticated USING ((SELECT public.auth_puo_gestire_legale())) WITH CHECK ((SELECT public.auth_puo_gestire_legale()));
CREATE POLICY "Allegati pratiche: delete gestione legale" ON public.pratiche_legali_allegati
  FOR DELETE TO authenticated USING ((SELECT public.auth_puo_gestire_legale()));

-- note_legali_gestionali
DROP POLICY IF EXISTS "Note legali gest: insert admin/approvatori" ON public.note_legali_gestionali;
DROP POLICY IF EXISTS "Note legali gest: update admin/approvatori" ON public.note_legali_gestionali;
DROP POLICY IF EXISTS "Note legali gest: delete admin" ON public.note_legali_gestionali;
CREATE POLICY "Note legali gest: insert gestione legale" ON public.note_legali_gestionali
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.auth_puo_gestire_legale()));
CREATE POLICY "Note legali gest: update gestione legale" ON public.note_legali_gestionali
  FOR UPDATE TO authenticated USING ((SELECT public.auth_puo_gestire_legale())) WITH CHECK ((SELECT public.auth_puo_gestire_legale()));
CREATE POLICY "Note legali gest: delete gestione legale" ON public.note_legali_gestionali
  FOR DELETE TO authenticated USING ((SELECT public.auth_puo_gestire_legale()));
DROP POLICY IF EXISTS "Note legali gest: select come il cliente" ON public.note_legali_gestionali;
CREATE POLICY "Note legali gest: select come il cliente" ON public.note_legali_gestionali
  FOR SELECT TO authenticated
  USING (
    (cliente_id IN (
      SELECT c.id FROM public.clienti c
      WHERE (SELECT public.has_role((SELECT auth.uid()), 'amministratore'::public.app_role))
         OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv1'::public.app_role))
         OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv2'::public.app_role))
         OR (SELECT public.has_role((SELECT auth.uid()), 'approvatore_liv3'::public.app_role))
         OR (c.store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid()))
    ))
    OR (SELECT public.auth_puo_gestire_legale())
  );

-- 4) Variazioni legale nel registro del blocco
ALTER TABLE public.clienti_blocco_variazioni DROP CONSTRAINT IF EXISTS clienti_blocco_variazioni_tipo_check;
ALTER TABLE public.clienti_blocco_variazioni ADD CONSTRAINT clienti_blocco_variazioni_tipo_check
  CHECK (tipo = ANY (ARRAY['bloccato'::text, 'sbloccato'::text, 'in_legale'::text, 'uscito_legale'::text]));

CREATE OR REPLACE FUNCTION public.registra_variazione_legale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.clienti_blocco_variazioni
      (cliente_id, store_id, codice_gestionale, ragione_sociale, tipo, importazione_id, notificato_at)
    VALUES
      (NEW.id, NEW.store_id, NEW.codice_gestionale, NEW.ragione_sociale,
       CASE WHEN COALESCE(NEW.in_gestione_legale, false) THEN 'in_legale' ELSE 'uscito_legale' END,
       NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'registra_variazione_legale: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.registra_variazione_legale() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registra_variazione_legale() FROM anon;
REVOKE ALL ON FUNCTION public.registra_variazione_legale() FROM authenticated;

DROP TRIGGER IF EXISTS trg_clienti_variazione_legale ON public.clienti;
CREATE TRIGGER trg_clienti_variazione_legale
  AFTER UPDATE OF in_gestione_legale ON public.clienti
  FOR EACH ROW
  WHEN (OLD.in_gestione_legale IS DISTINCT FROM NEW.in_gestione_legale)
  EXECUTE FUNCTION public.registra_variazione_legale();

-- 5) Promemoria: esclusione legale da clienti.in_gestione_legale
CREATE OR REPLACE FUNCTION public.get_promemoria_clienti_aggregato(_mesi text[], _store_id uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text, _importo_min numeric DEFAULT NULL::numeric, _escludi_legale boolean DEFAULT true, _escludi_bloccati boolean DEFAULT false)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, store_id uuid, store_nome text, email text, pec text, bloccato boolean, n_scadenze integer, totale_a_scadere numeric, prima_scadenza date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH sc AS (
    SELECT s.cliente_id,
      COUNT(*)::int AS n_scadenze,
      SUM(s.importo_scadenza) AS totale,
      MIN(s.data_scadenza) AS prima
    FROM public.scadenze s
    WHERE s.data_pagamento_effettiva IS NULL
      AND s.data_scadenza IS NOT NULL
      AND s.data_scadenza >= current_date
      AND _mesi IS NOT NULL AND array_length(_mesi, 1) > 0
      AND to_char(s.data_scadenza, 'YYYY-MM') = ANY(_mesi)
    GROUP BY s.cliente_id
  )
  SELECT c.id, c.ragione_sociale, c.store_id, st.nome, c.email, c.pec,
    COALESCE(c.bloccato, false), sc.n_scadenze, sc.totale, sc.prima
  FROM sc
  JOIN public.clienti c ON c.id = sc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  WHERE public.user_can_access_cliente(c.id)
    AND (_escludi_legale IS FALSE OR COALESCE(c.in_gestione_legale, false) = false)
    AND (_store_id IS NULL OR c.store_id = _store_id)
    AND (_search IS NULL OR _search = '' OR c.ragione_sociale ILIKE '%' || _search || '%')
    AND (_importo_min IS NULL OR sc.totale >= _importo_min)
    AND (_escludi_bloccati IS FALSE OR COALESCE(c.bloccato, false) = false)
  ORDER BY sc.prima ASC, c.ragione_sociale ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_promemoria_clienti_aggregato(_mesi text[], _store_id uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text, _importo_min numeric DEFAULT NULL::numeric, _escludi_legale boolean DEFAULT true, _escludi_bloccati boolean DEFAULT false, _escludi_bos boolean DEFAULT true)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, store_id uuid, store_nome text, email text, pec text, bloccato boolean, n_scadenze integer, totale_a_scadere numeric, prima_scadenza date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH sc AS (
    SELECT s.cliente_id,
      COUNT(*)::int AS n_scadenze,
      SUM(s.importo_scadenza) AS totale,
      MIN(s.data_scadenza) AS prima
    FROM public.scadenze s
    WHERE s.data_pagamento_effettiva IS NULL
      AND s.data_scadenza IS NOT NULL
      AND s.data_scadenza >= current_date
      AND _mesi IS NOT NULL AND array_length(_mesi, 1) > 0
      AND to_char(s.data_scadenza, 'YYYY-MM') = ANY(_mesi)
    GROUP BY s.cliente_id
  )
  SELECT c.id, c.ragione_sociale, c.store_id, st.nome, c.email, c.pec,
    COALESCE(c.bloccato, false), sc.n_scadenze, sc.totale, sc.prima
  FROM sc
  JOIN public.clienti c ON c.id = sc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  WHERE public.user_can_access_cliente(c.id)
    AND (_escludi_legale IS FALSE OR COALESCE(c.in_gestione_legale, false) = false)
    AND (_store_id IS NULL OR c.store_id = _store_id)
    AND (_search IS NULL OR _search = '' OR c.ragione_sociale ILIKE '%' || _search || '%')
    AND (_importo_min IS NULL OR sc.totale >= _importo_min)
    AND (_escludi_bloccati IS FALSE OR COALESCE(c.bloccato, false) = false)
    AND (_escludi_bos IS FALSE OR COALESCE(c.condizione_pagamento_cod, '') <> 'BOS')
  ORDER BY sc.prima ASC, c.ragione_sociale ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_promemoria_scadenze_dettaglio(_data date, _escludi_legale boolean DEFAULT true, _escludi_bloccati boolean DEFAULT false, _escludi_bos boolean DEFAULT true, _includi_bonifici boolean DEFAULT true, _includi_riba boolean DEFAULT true)
 RETURNS TABLE(scadenza_id uuid, cliente_id uuid, ragione_sociale text, email text, pec text, store_id uuid, store_nome text, store_insegna text, store_indirizzo text, store_cap text, store_citta text, store_provincia text, store_telefono text, numero_documento text, data_documento date, data_scadenza date, importo_scadenza numeric, codice_pagamento text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eff AS MATERIALIZED (SELECT public.store_id_effettivo(NULL::uuid) AS s)
  SELECT
    s.id AS scadenza_id,
    c.id AS cliente_id,
    c.ragione_sociale,
    c.email,
    c.pec,
    c.store_id,
    st.nome AS store_nome,
    st.insegna AS store_insegna,
    st.indirizzo AS store_indirizzo,
    st.cap AS store_cap,
    st.citta AS store_citta,
    st.provincia AS store_provincia,
    st.telefono AS store_telefono,
    s.numero_documento,
    s.data_documento,
    s.data_scadenza,
    s.importo_scadenza,
    s.codice_pagamento
  FROM public.scadenze s
  JOIN public.clienti c ON c.id = s.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  CROSS JOIN eff
  WHERE s.data_pagamento_effettiva IS NULL
    AND s.data_scadenza = _data
    AND COALESCE(s.importo_scadenza, 0) > 0
    AND (eff.s IS NULL OR c.store_id = eff.s)
    AND (_escludi_legale IS FALSE OR COALESCE(c.in_gestione_legale, false) = false)
    AND (_escludi_bloccati IS FALSE OR COALESCE(c.bloccato, false) = false)
    AND (_escludi_bos IS FALSE OR COALESCE(s.codice_pagamento, '') NOT ILIKE 'BOS%')
    AND (
      (_includi_bonifici AND COALESCE(s.codice_pagamento, '') ILIKE 'BO%')
      OR (_includi_riba AND COALESCE(s.codice_pagamento, '') ILIKE 'RB%')
    )
  ORDER BY c.ragione_sociale ASC, s.data_scadenza ASC, s.numero_documento ASC;
$function$;
