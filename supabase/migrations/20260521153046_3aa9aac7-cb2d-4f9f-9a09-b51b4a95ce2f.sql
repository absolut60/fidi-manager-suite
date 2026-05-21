
-- AUDIT LOG
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  entita text NOT NULL,
  entita_id uuid,
  azione text NOT NULL,
  dettagli jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entita ON public.audit_log(entita, entita_id);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audit: solo admin legge"
ON public.audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'amministratore'::app_role));

CREATE POLICY "Audit: autenticati scrivono"
ON public.audit_log FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- NOTIFICHE
CREATE TABLE public.notifiche (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  titolo text NOT NULL,
  messaggio text,
  link text,
  letta boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifiche_user ON public.notifiche(user_id, letta, created_at DESC);

ALTER TABLE public.notifiche ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notifiche: utente vede le sue"
ON public.notifiche FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'amministratore'::app_role));

CREATE POLICY "Notifiche: utente aggiorna le sue"
ON public.notifiche FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Notifiche: autenticati inseriscono"
ON public.notifiche FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Notifiche: utente elimina le sue"
ON public.notifiche FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'amministratore'::app_role));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifiche;

-- TRIGGER AUDIT su richieste_fido
CREATE OR REPLACE FUNCTION public.audit_richieste_fido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _azione text;
  _dettagli jsonb;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  
  IF TG_OP = 'INSERT' THEN
    _azione := 'creata';
    _dettagli := jsonb_build_object('stato', NEW.stato, 'importo', NEW.importo_richiesto, 'tipo', NEW.tipo);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.stato IS DISTINCT FROM NEW.stato THEN
      _azione := 'cambio_stato';
      _dettagli := jsonb_build_object('da', OLD.stato, 'a', NEW.stato, 'importo_approvato', NEW.importo_approvato);
    ELSE
      _azione := 'modificata';
      _dettagli := jsonb_build_object('campi_modificati', 'vari');
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    _azione := 'eliminata';
    _dettagli := jsonb_build_object('stato', OLD.stato);
    INSERT INTO public.audit_log(user_id, user_email, entita, entita_id, azione, dettagli)
    VALUES (auth.uid(), _email, 'richiesta_fido', OLD.id, _azione, _dettagli);
    RETURN OLD;
  END IF;
  
  INSERT INTO public.audit_log(user_id, user_email, entita, entita_id, azione, dettagli)
  VALUES (auth.uid(), _email, 'richiesta_fido', NEW.id, _azione, _dettagli);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_richieste
AFTER INSERT OR UPDATE OR DELETE ON public.richieste_fido
FOR EACH ROW EXECUTE FUNCTION public.audit_richieste_fido();

-- TRIGGER AUDIT su clienti
CREATE OR REPLACE FUNCTION public.audit_clienti()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(user_id, user_email, entita, entita_id, azione, dettagli)
    VALUES (auth.uid(), _email, 'cliente', NEW.id, 'creato', jsonb_build_object('ragione_sociale', NEW.ragione_sociale));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log(user_id, user_email, entita, entita_id, azione, dettagli)
    VALUES (auth.uid(), _email, 'cliente', NEW.id, 'aggiornato', jsonb_build_object('ragione_sociale', NEW.ragione_sociale));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log(user_id, user_email, entita, entita_id, azione, dettagli)
    VALUES (auth.uid(), _email, 'cliente', OLD.id, 'eliminato', jsonb_build_object('ragione_sociale', OLD.ragione_sociale));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_clienti
AFTER INSERT OR UPDATE OR DELETE ON public.clienti
FOR EACH ROW EXECUTE FUNCTION public.audit_clienti();

-- TRIGGER NOTIFICA quando richiesta entra in_approvazione → notifica agli approvatori del livello
CREATE OR REPLACE FUNCTION public.notifica_richiesta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ruolo app_role;
  _approvatore record;
  _cliente text;
BEGIN
  -- Notifica approvatori quando entra in_approvazione
  IF NEW.stato = 'in_approvazione' AND (OLD IS NULL OR OLD.stato <> 'in_approvazione') THEN
    SELECT ragione_sociale INTO _cliente FROM public.clienti WHERE id = NEW.cliente_id;
    _ruolo := ('approvatore_liv' || NEW.livello_corrente)::app_role;
    FOR _approvatore IN SELECT user_id FROM public.user_roles WHERE role = _ruolo OR role = 'amministratore'
    LOOP
      INSERT INTO public.notifiche(user_id, tipo, titolo, messaggio, link, metadata)
      VALUES (
        _approvatore.user_id,
        'richiesta_da_approvare',
        'Nuova richiesta da approvare',
        format('Richiesta livello %s per %s (€ %s)', NEW.livello_corrente, COALESCE(_cliente, '—'), NEW.importo_richiesto),
        '/richieste/' || NEW.id,
        jsonb_build_object('richiesta_id', NEW.id, 'livello', NEW.livello_corrente)
      );
    END LOOP;
  END IF;
  
  -- Notifica autore quando approvata/rifiutata
  IF NEW.stato IN ('approvata','rifiutata') AND OLD.stato <> NEW.stato AND NEW.created_by IS NOT NULL THEN
    INSERT INTO public.notifiche(user_id, tipo, titolo, messaggio, link, metadata)
    VALUES (
      NEW.created_by,
      'richiesta_' || NEW.stato::text,
      CASE WHEN NEW.stato = 'approvata' THEN 'Richiesta approvata' ELSE 'Richiesta rifiutata' END,
      format('La tua richiesta di € %s è stata %s', NEW.importo_richiesto, NEW.stato),
      '/richieste/' || NEW.id,
      jsonb_build_object('richiesta_id', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notifica_richiesta
AFTER INSERT OR UPDATE ON public.richieste_fido
FOR EACH ROW EXECUTE FUNCTION public.notifica_richiesta();

-- Configurazione giorni reminder scadenze
INSERT INTO public.configurazioni(chiave, valore, descrizione) VALUES
  ('giorni_reminder_scadenza', '30', 'Giorni prima della scadenza per inviare reminder'),
  ('giorni_reminder_urgente', '7', 'Giorni per reminder urgente')
ON CONFLICT (chiave) DO NOTHING;
