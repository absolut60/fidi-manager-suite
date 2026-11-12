-- FM63 fetta 2: consultazione (sola lettura) di preventivi, ordini, articoli e fornitori per lo store manager.
-- auth_ha_accesso_preventivi() NON cambia: ricerca clienti, cantieri e numerazioni restano ai ruoli preventivi.

CREATE OR REPLACE FUNCTION public.auth_consulta_preventivi()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.auth_ha_accesso_preventivi() OR coalesce(public.has_role(auth.uid(), 'store_manager'::app_role), false);
$$;
COMMENT ON FUNCTION public.auth_consulta_preventivi() IS 'FM63: lettura di preventivi/ordini/catalogo/fornitori. Gemello TS puoConsultarePreventivi (src/lib/permessi-preventivi.ts). Solo lettura: le scritture usano auth_puo_scrivere_*/auth_puo_gestire_*.';
REVOKE EXECUTE ON FUNCTION public.auth_consulta_preventivi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_consulta_preventivi() TO authenticated, service_role;

-- Policy SELECT di catalogo, listini, giacenze, depositi, marche, kit, regole prezzo Gamma (22)
ALTER POLICY articoli_prev_select ON public.articoli USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY articoli_gamma_select ON public.articoli_gamma USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY articoli_gamma_fornitori_select ON public.articoli_gamma_fornitori USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY articoli_gamma_listini_select ON public.articoli_gamma_listini USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY cantiere_listini_speciali_prev_select ON public.cantiere_listini_speciali USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY clienti_condizioni_gamma_select ON public.clienti_condizioni_gamma USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY contatori_prev_select ON public.contatori_preventivo USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY depositi_select ON public.depositi USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY giacenze_gamma_select ON public.giacenze_gamma USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY kit_prev_select ON public.kit USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY kit_componenti_prev_select ON public.kit_componenti USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY listini_acquisto_prev_select ON public.listini_acquisto USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY listini_gamma_select ON public.listini_gamma USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY listini_priorita_gamma_select ON public.listini_priorita_gamma USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY listini_vendita_prev_select ON public.listini_vendita USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY listino_piu_articoli_gamma_select ON public.listino_piu_articoli_gamma USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY marche_select ON public.marche USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY matrice_ricarichi_prev_select ON public.matrice_ricarichi USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY prezzi_cliente_articolo_gamma_select ON public.prezzi_cliente_articolo_gamma USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY prezzi_deposito_gamma_select ON public.prezzi_deposito_gamma USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY sconti_categoria_gamma_select ON public.sconti_categoria_gamma USING ((SELECT public.auth_consulta_preventivi()));
ALTER POLICY sconti_cliente_famiglia_gamma_select ON public.sconti_cliente_famiglia_gamma USING ((SELECT public.auth_consulta_preventivi()));

-- Fornitori: lettura = consultazione preventivi OR amministrazione
CREATE OR REPLACE FUNCTION public.auth_ha_accesso_fornitori()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.auth_consulta_preventivi() OR has_role(auth.uid(),'amministrazione');
$function$;

-- Preventivi e ordini (stessa tabella; blocchi/righe via auth_vede_preventivo_id): regola agenti invariata
CREATE OR REPLACE FUNCTION public.auth_vede_preventivo(_agente_codice text, _cliente_id uuid, _cantiere_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.auth_consulta_preventivi()
     AND ( NOT ( has_role(auth.uid(),'agente'::app_role)
                 AND NOT has_role(auth.uid(),'amministratore'::app_role)
                 AND NOT has_role(auth.uid(),'preventivi_manage'::app_role) )
           OR public.agente_vede_record(_agente_codice, NULL, _cliente_id, NULL, _cantiere_id) );
$function$;

-- Cliente di un preventivo: visibile anche se compare in un preventivo/ordine che l'utente può vedere
CREATE OR REPLACE FUNCTION public.get_cliente_lite(_id uuid)
 RETURNS TABLE(id uuid, ragione_sociale text, partita_iva text, indirizzo text, cap text, citta text, provincia text, fascia_listino_default text, codice_agente text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.id, c.ragione_sociale, c.partita_iva, c.indirizzo, c.cap, c.citta, c.provincia,
         c.fascia_listino_default::text, c.codice_agente
  FROM public.clienti c
  WHERE c.id = _id
    AND (public.auth_ha_accesso_preventivi()
         OR public.user_can_access_cliente(c.id, c.store_id, c.codice_agente)
         OR EXISTS (SELECT 1 FROM public.preventivi p WHERE p.cliente_id = c.id
                    AND public.auth_vede_preventivo(p.agente_codice, p.cliente_id, p.cantiere_id)));
$function$;

CREATE OR REPLACE FUNCTION public.get_clienti_lite_by_ids(_ids uuid[])
 RETURNS TABLE(id uuid, ragione_sociale text, partita_iva text, indirizzo text, cap text, citta text, provincia text, fascia_listino_default text, codice_agente text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.id, c.ragione_sociale, c.partita_iva, c.indirizzo, c.cap, c.citta, c.provincia,
         c.fascia_listino_default::text, c.codice_agente
  FROM public.clienti c
  WHERE c.id = ANY(_ids)
    AND (public.auth_ha_accesso_preventivi()
         OR public.user_can_access_cliente(c.id, c.store_id, c.codice_agente)
         OR EXISTS (SELECT 1 FROM public.preventivi p WHERE p.cliente_id = c.id
                    AND public.auth_vede_preventivo(p.agente_codice, p.cliente_id, p.cantiere_id)));
$function$;

-- Funzioni di lettura catalogo/fornitori: sostituzione puntuale del solo gate (corpo altrimenti identico).
-- CREATE OR REPLACE conserva i grant esistenti.
DO $do$
DECLARE r record; def text; nuovo text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('cerca_articoli','facets_articoli','cerca_fornitori_articoli',
             'disponibilita_articolo','listini_articolo_visibili','articoli_fornitore','dettaglio_fornitore')
  LOOP
    def := pg_get_functiondef(r.oid);
    nuovo := replace(def, 'public.auth_ha_accesso_preventivi()', 'public.auth_consulta_preventivi()');
    IF nuovo = def THEN
      RAISE EXCEPTION 'Gate non trovato in %', r.oid::regprocedure;
    END IF;
    EXECUTE nuovo;
  END LOOP;
END
$do$;