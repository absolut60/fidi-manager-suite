-- FM56 S1: ruolo showroom. Sola lettura sulla sede, eccezioni: contatti dei clienti della sede e lead della sede.
CREATE OR REPLACE FUNCTION public.auth_solo_showroom()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'showroom'::app_role)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
                     AND role IN ('store_manager','amministratore','amministrazione','direzione','recupero_crediti'))
$function$;
REVOKE EXECUTE ON FUNCTION public.auth_solo_showroom() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_solo_showroom() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_e_showroom()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'showroom'::app_role)
$function$;
REVOKE EXECUTE ON FUNCTION public.auth_e_showroom() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_e_showroom() TO authenticated, service_role;

-- Lead della sede dello showroom (fonte unica per policy lead/contatti/storico)
CREATE OR REPLACE FUNCTION public.showroom_lead_della_sede(_lead_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _lead_id IS NOT NULL AND public.profilo_store_id_corrente() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.lead l WHERE l.id = _lead_id AND l.store_id = public.profilo_store_id_corrente())
$function$;
REVOKE EXECUTE ON FUNCTION public.showroom_lead_della_sede(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.showroom_lead_della_sede(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.showroom_cliente_della_sede(_cliente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _cliente_id IS NOT NULL AND public.profilo_store_id_corrente() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.clienti c WHERE c.id = _cliente_id AND c.store_id = public.profilo_store_id_corrente())
$function$;
REVOKE EXECUTE ON FUNCTION public.showroom_cliente_della_sede(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.showroom_cliente_della_sede(uuid) TO authenticated, service_role;

-- Blocco scritture: policy RESTRICTIVE (valgono in AND con tutte le permissive esistenti; per chi non è solo-showroom sono sempre vere)
DO $$
DECLARE t text; c text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clienti','scadenze','azioni_recupero','azioni_recupero_scadenze','solleciti',
    'campagne_sollecito','campagne_sollecito_destinatari','piani_rientro','piani_rientro_documenti','piani_rientro_rate',
    'pratiche_legali','pratiche_legali_allegati','storico_pratiche_legali','note_legali_gestionali',
    'richieste_fido','approvazioni','comunicazioni_richiesta','storico_fido','alert_fidi','revisione_fidi_lasciati',
    'assicurazioni_credito','cantieri','cantiere_listini_speciali','opportunita','attivita_commerciale','reminder',
    'categoria_storico','clienti_blocco_variazioni','lead_richieste']
  LOOP
    EXECUTE format('CREATE POLICY "Showroom: niente inserimenti" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT (SELECT public.auth_solo_showroom()))', t);
    EXECUTE format('CREATE POLICY "Showroom: niente modifiche" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT (SELECT public.auth_solo_showroom())) WITH CHECK (NOT (SELECT public.auth_solo_showroom()))', t);
    EXECUTE format('CREATE POLICY "Showroom: niente eliminazioni" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT (SELECT public.auth_solo_showroom()))', t);
  END LOOP;
END $$;

-- Allegati: allo showroom restano solo quelli di task e chat
CREATE POLICY "Showroom: allegati solo task e chat (ins)" ON public.allegati AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT public.auth_solo_showroom()) OR entita_tipo IN ('task','messaggio'));
CREATE POLICY "Showroom: allegati solo task e chat (upd)" ON public.allegati AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT (SELECT public.auth_solo_showroom()) OR entita_tipo IN ('task','messaggio'))
  WITH CHECK (NOT (SELECT public.auth_solo_showroom()) OR entita_tipo IN ('task','messaggio'));
CREATE POLICY "Showroom: allegati solo task e chat (del)" ON public.allegati AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT (SELECT public.auth_solo_showroom()) OR entita_tipo IN ('task','messaggio'));

-- Contatti: showroom aggiunge contatti ai clienti e ai lead della sede; modifica solo i suoi (clienti) o quelli dei lead della sede; niente eliminazioni
CREATE POLICY "Showroom: contatti della sede (ins)" ON public.contatti AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT public.auth_solo_showroom())
    OR (cliente_id IS NOT NULL AND public.showroom_cliente_della_sede(cliente_id))
    OR (cliente_id IS NULL AND public.showroom_lead_della_sede(lead_id)));
CREATE POLICY "Showroom: contatti della sede (upd)" ON public.contatti AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT (SELECT public.auth_solo_showroom())
    OR (cliente_id IS NOT NULL AND created_by = auth.uid() AND public.showroom_cliente_della_sede(cliente_id))
    OR (cliente_id IS NULL AND public.showroom_lead_della_sede(lead_id)))
  WITH CHECK (NOT (SELECT public.auth_solo_showroom())
    OR (cliente_id IS NOT NULL AND created_by = auth.uid() AND public.showroom_cliente_della_sede(cliente_id))
    OR (cliente_id IS NULL AND public.showroom_lead_della_sede(lead_id)));
CREATE POLICY "Showroom: contatti niente eliminazioni" ON public.contatti AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT (SELECT public.auth_solo_showroom()));
CREATE POLICY "Showroom: contatti della sede (lettura lead)" ON public.contatti FOR SELECT TO authenticated
  USING ((SELECT public.auth_e_showroom()) AND cliente_id IS NULL AND public.showroom_lead_della_sede(lead_id));
CREATE POLICY "Showroom: contatti della sede (inserimento)" ON public.contatti FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.auth_e_showroom()) AND created_by = auth.uid() AND (
    (cliente_id IS NOT NULL AND public.showroom_cliente_della_sede(cliente_id))
    OR (cliente_id IS NULL AND public.showroom_lead_della_sede(lead_id))));
CREATE POLICY "Showroom: contatti della sede (modifica)" ON public.contatti FOR UPDATE TO authenticated
  USING ((SELECT public.auth_e_showroom()) AND (
    (cliente_id IS NOT NULL AND created_by = auth.uid() AND public.showroom_cliente_della_sede(cliente_id))
    OR (cliente_id IS NULL AND public.showroom_lead_della_sede(lead_id))))
  WITH CHECK ((SELECT public.auth_e_showroom()) AND (
    (cliente_id IS NOT NULL AND created_by = auth.uid() AND public.showroom_cliente_della_sede(cliente_id))
    OR (cliente_id IS NULL AND public.showroom_lead_della_sede(lead_id))));

-- Lead della sede
CREATE POLICY "Showroom: lead della sede (lettura)" ON public.lead FOR SELECT TO authenticated
  USING ((SELECT public.auth_e_showroom()) AND store_id IS NOT NULL AND store_id = (SELECT public.profilo_store_id_corrente()));
CREATE POLICY "Showroom: lead della sede (inserimento)" ON public.lead FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.auth_e_showroom()) AND store_id IS NOT NULL AND store_id = (SELECT public.profilo_store_id_corrente()));
CREATE POLICY "Showroom: lead della sede (modifica)" ON public.lead FOR UPDATE TO authenticated
  USING ((SELECT public.auth_e_showroom()) AND store_id IS NOT NULL AND store_id = (SELECT public.profilo_store_id_corrente()))
  WITH CHECK ((SELECT public.auth_e_showroom()) AND store_id IS NOT NULL AND store_id = (SELECT public.profilo_store_id_corrente()));
CREATE POLICY "Showroom: lead solo della sede (ins)" ON public.lead AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT public.auth_solo_showroom()) OR store_id = (SELECT public.profilo_store_id_corrente()));
CREATE POLICY "Showroom: lead solo della sede (upd)" ON public.lead AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT (SELECT public.auth_solo_showroom()) OR store_id = (SELECT public.profilo_store_id_corrente()))
  WITH CHECK (NOT (SELECT public.auth_solo_showroom()) OR store_id = (SELECT public.profilo_store_id_corrente()));
CREATE POLICY "Showroom: lead niente eliminazioni" ON public.lead AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT (SELECT public.auth_solo_showroom()));

-- Storico lead della sede (lettura e scrittura della cronologia)
CREATE POLICY "Showroom: storico lead della sede (lettura)" ON public.lead_storico FOR SELECT TO authenticated
  USING ((SELECT public.auth_e_showroom()) AND public.showroom_lead_della_sede(lead_id));
CREATE POLICY "Showroom: storico lead della sede (inserimento)" ON public.lead_storico FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.auth_e_showroom()) AND public.showroom_lead_della_sede(lead_id));

-- Richieste fido: lo showroom legge quelle dei clienti della sua sede (sola lettura)
CREATE POLICY "Showroom: richieste fido della sede (lettura)" ON public.richieste_fido FOR SELECT TO authenticated
  USING ((SELECT public.auth_e_showroom()) AND public.showroom_cliente_della_sede(cliente_id));
