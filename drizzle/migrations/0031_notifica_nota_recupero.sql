INSERT INTO public.notifiche_tipi (tipo, raggruppa, chiave_metadata, titolo_gruppo, link_gruppo)
VALUES ('nota_recupero', true, 'cliente_id', '{n} nuove note di recupero — {titolo}', NULL)
ON CONFLICT (tipo) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notifica_nota_recupero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      JOIN public.profili p ON p.id = ur.user_id AND p.attivo
      WHERE ur.role = 'recupero_crediti'::public.app_role
         OR (ur.role = 'store_manager'::public.app_role AND v_store IS NOT NULL AND p.store_id = v_store)
    ) d
    WHERE d.user_id IS DISTINCT FROM NEW.operatore_id
      AND d.user_id IS DISTINCT FROM auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notifica_nota_recupero fallita per azione %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notifica_nota_recupero() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_notifica_nota_recupero
AFTER INSERT ON public.azioni_recupero
FOR EACH ROW WHEN (NEW.tipo = 'nota')
EXECUTE FUNCTION public.notifica_nota_recupero();