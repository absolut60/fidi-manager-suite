-- FM45 fetta 1: tipi di azione consentiti all'agente e notifiche all'agente del cliente.

-- (a) Fonte unica: agenti attivi del cliente
CREATE OR REPLACE FUNCTION public.utenti_agente_cliente(_cliente_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id
  FROM public.clienti c
  JOIN public.profili p ON p.codice_agente = c.codice_agente AND p.attivo
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'agente'::public.app_role
  WHERE c.id = _cliente_id
    AND c.codice_agente IS NOT NULL
$$;
COMMENT ON FUNCTION public.utenti_agente_cliente(uuid) IS
  'FM45 fonte unica: profili attivi con ruolo agente e codice_agente = clienti.codice_agente del cliente (NULL -> nessuno).';
REVOKE ALL ON FUNCTION public.utenti_agente_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.utenti_agente_cliente(uuid) TO authenticated, service_role;

-- (b) Policy INSERT: agente puro limitato a nota/promemoria/telefonata, mai esito piano_rientro
ALTER POLICY "Store manager e agente inseriscono azioni sui propri clienti"
  ON public.azioni_recupero
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM public.clienti c
      WHERE c.id = azioni_recupero.cliente_id
        AND (
          (c.store_id IS NOT NULL AND c.store_id = (SELECT public.profilo_store_id_corrente()))
          OR (c.codice_agente IS NOT NULL AND c.codice_agente = (SELECT public.agente_codice_corrente()))
        )
    ))
    AND (
      NOT (SELECT public.has_role((SELECT auth.uid()), 'agente'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'amministratore'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'amministrazione'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'direzione'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'recupero_crediti'::public.app_role))
      OR (tipo IN ('nota','promemoria','telefonata') AND COALESCE(esito,'') <> 'piano_rientro')
    )
  );

-- (c) Nota di recupero: aggiunge l'agente del cliente (non per esito piano_rientro, notificato dal trigger su piani_rientro)
CREATE OR REPLACE FUNCTION public.notifica_nota_recupero()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ragione text;
  v_store uuid;
  v_autore text;
  v_testo text;
  v_messaggio text;
BEGIN
  BEGIN
    SELECT COALESCE(NULLIF(trim(c.ragione_sociale), ''), 'Cliente'), c.store_id
      INTO v_ragione, v_store
    FROM public.clienti c WHERE c.id = NEW.cliente_id;
    v_ragione := COALESCE(v_ragione, 'Cliente');

    SELECT NULLIF(trim(COALESCE(p.nome,'') || ' ' || COALESCE(p.cognome,'')), '') INTO v_autore
    FROM public.profili p WHERE p.id = NEW.operatore_id;
    v_autore := COALESCE(v_autore, 'Qualcuno');

    v_testo := NULLIF(trim(COALESCE(NEW.note, '')), '');
    v_messaggio := CASE WHEN v_testo IS NULL THEN v_autore || ' ha inserito una nota'
                        ELSE v_autore || ': ' || left(v_testo, 140) END;

    INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
    SELECT d.user_id, 'nota_recupero', v_ragione, v_messaggio,
           '/clienti/' || NEW.cliente_id::text || '?tab=attivita',
           jsonb_build_object('cliente_id', NEW.cliente_id, 'azione_id', NEW.id)
    FROM (
      SELECT ur.user_id
      FROM public.user_roles ur
      JOIN public.profili p ON p.id = ur.user_id AND p.attivo
      WHERE ur.role = 'recupero_crediti'::public.app_role
         OR (ur.role = 'store_manager'::public.app_role AND v_store IS NOT NULL AND p.store_id = v_store)
      UNION
      SELECT a.id FROM public.utenti_agente_cliente(NEW.cliente_id) AS a(id)
      WHERE COALESCE(NEW.esito, '') <> 'piano_rientro'
    ) d
    WHERE d.user_id IS DISTINCT FROM NEW.operatore_id
      AND d.user_id IS DISTINCT FROM auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notifica_nota_recupero fallita per azione %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- (d) Operazioni di recupero notificate all'agente del cliente
CREATE OR REPLACE FUNCTION public.notifica_operazione_recupero()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_autore_id uuid;
  v_ragione text;
  v_autore text;
  v_cosa text;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'azioni_recupero' THEN
      v_autore_id := NEW.operatore_id;
      v_cosa := CASE WHEN NEW.livello_sollecito IS NOT NULL
                     THEN 'ha inviato il sollecito ' || NEW.livello_sollecito::text
                     ELSE 'ha inviato un''email di recupero' END;
    ELSIF TG_TABLE_NAME = 'piani_rientro' THEN
      v_autore_id := NEW.creato_da;
      v_cosa := 'ha creato un piano di rientro';
    ELSE
      v_autore_id := NEW.gestita_da;
      v_cosa := 'ha aperto una pratica legale';
    END IF;
    v_autore_id := COALESCE(v_autore_id, auth.uid());

    SELECT COALESCE(NULLIF(trim(c.ragione_sociale), ''), 'Cliente') INTO v_ragione
    FROM public.clienti c WHERE c.id = NEW.cliente_id;
    v_ragione := COALESCE(v_ragione, 'Cliente');

    SELECT NULLIF(trim(COALESCE(p.nome,'') || ' ' || COALESCE(p.cognome,'')), '') INTO v_autore
    FROM public.profili p WHERE p.id = v_autore_id;
    v_autore := COALESCE(v_autore, 'Qualcuno');

    INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
    SELECT a.id, 'operazione_recupero', v_ragione, v_autore || ' ' || v_cosa,
           '/clienti/' || NEW.cliente_id::text || '?tab=attivita',
           jsonb_build_object('cliente_id', NEW.cliente_id, 'origine', TG_TABLE_NAME, 'record_id', NEW.id)
    FROM public.utenti_agente_cliente(NEW.cliente_id) AS a(id)
    WHERE a.id IS DISTINCT FROM v_autore_id
      AND a.id IS DISTINCT FROM auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notifica_operazione_recupero fallita su % %: %', TG_TABLE_NAME, NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.notifica_operazione_recupero() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_notifica_operazione_recupero_azione
  AFTER INSERT ON public.azioni_recupero
  FOR EACH ROW WHEN (NEW.tipo = 'email')
  EXECUTE FUNCTION public.notifica_operazione_recupero();

CREATE TRIGGER trg_notifica_operazione_recupero_piano
  AFTER INSERT ON public.piani_rientro
  FOR EACH ROW EXECUTE FUNCTION public.notifica_operazione_recupero();

CREATE TRIGGER trg_notifica_operazione_recupero_pratica
  AFTER INSERT ON public.pratiche_legali
  FOR EACH ROW EXECUTE FUNCTION public.notifica_operazione_recupero();