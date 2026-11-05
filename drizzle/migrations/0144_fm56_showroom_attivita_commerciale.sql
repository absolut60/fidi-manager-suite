-- FM56 S2a: lo showroom registra attività commerciali su clienti e lead della sua sede.
-- Sostituite solo le RESTRICTIVE INSERT/UPDATE della S1 (la DELETE resta). Policy degli altri ruoli invariate.
DROP POLICY IF EXISTS "Showroom: niente inserimenti" ON public.attivita_commerciale;
DROP POLICY IF EXISTS "Showroom: niente modifiche" ON public.attivita_commerciale;

CREATE POLICY "Showroom: inserimenti solo attività della sede" ON public.attivita_commerciale
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT (SELECT public.auth_solo_showroom())
    OR (operatore_id = (SELECT auth.uid()) AND opportunita_id IS NULL
        AND ((cliente_id IS NOT NULL AND public.showroom_cliente_della_sede(cliente_id))
          OR (lead_id IS NOT NULL AND public.showroom_lead_della_sede(lead_id))))
  );

CREATE POLICY "Showroom: modifiche solo attività della sede" ON public.attivita_commerciale
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    NOT (SELECT public.auth_solo_showroom())
    OR (operatore_id = (SELECT auth.uid()) AND opportunita_id IS NULL
        AND ((cliente_id IS NOT NULL AND public.showroom_cliente_della_sede(cliente_id))
          OR (lead_id IS NOT NULL AND public.showroom_lead_della_sede(lead_id))))
  )
  WITH CHECK (
    NOT (SELECT public.auth_solo_showroom())
    OR (operatore_id = (SELECT auth.uid()) AND opportunita_id IS NULL
        AND ((cliente_id IS NOT NULL AND public.showroom_cliente_della_sede(cliente_id))
          OR (lead_id IS NOT NULL AND public.showroom_lead_della_sede(lead_id))))
  );

CREATE POLICY "Showroom: lettura attività della sede" ON public.attivita_commerciale
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.auth_e_showroom())
    AND ((cliente_id IS NOT NULL AND public.showroom_cliente_della_sede(cliente_id))
      OR (lead_id IS NOT NULL AND public.showroom_lead_della_sede(lead_id)))
  );

CREATE POLICY "Showroom: inserimento attività della sede" ON public.attivita_commerciale
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.auth_e_showroom())
    AND operatore_id = (SELECT auth.uid()) AND opportunita_id IS NULL
    AND (store_id IS NULL OR store_id = (SELECT public.profilo_store_id_corrente()))
    AND ((cliente_id IS NOT NULL AND public.showroom_cliente_della_sede(cliente_id))
      OR (lead_id IS NOT NULL AND public.showroom_lead_della_sede(lead_id)))
  );

CREATE POLICY "Showroom: modifica attività della sede" ON public.attivita_commerciale
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.auth_e_showroom())
    AND operatore_id = (SELECT auth.uid()) AND opportunita_id IS NULL
    AND ((cliente_id IS NOT NULL AND public.showroom_cliente_della_sede(cliente_id))
      OR (lead_id IS NOT NULL AND public.showroom_lead_della_sede(lead_id)))
  )
  WITH CHECK (
    (SELECT public.auth_e_showroom())
    AND operatore_id = (SELECT auth.uid()) AND opportunita_id IS NULL
    AND ((cliente_id IS NOT NULL AND public.showroom_cliente_della_sede(cliente_id))
      OR (lead_id IS NOT NULL AND public.showroom_lead_della_sede(lead_id)))
  );