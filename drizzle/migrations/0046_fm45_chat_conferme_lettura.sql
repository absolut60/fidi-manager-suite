CREATE TABLE public.messaggi_letture (
  messaggio_id uuid NOT NULL REFERENCES public.messaggi(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profili(id) ON DELETE CASCADE,
  letto_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (messaggio_id, user_id)
);
CREATE INDEX idx_messaggi_letture_user_id ON public.messaggi_letture(user_id);
COMMENT ON TABLE public.messaggi_letture IS 'FM45: prima lettura di ogni messaggio chat per utente. Scritta SOLO da segna_canale_letto().';

GRANT SELECT ON public.messaggi_letture TO authenticated;
GRANT ALL ON public.messaggi_letture TO service_role;
ALTER TABLE public.messaggi_letture ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Letture: autore del messaggio o lettore" ON public.messaggi_letture
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.messaggi m WHERE m.id = messaggio_id AND m.autore_id = (SELECT auth.uid()))
  );

CREATE POLICY "Secondo fattore (FM44)" ON public.messaggi_letture AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
COMMENT ON POLICY "Secondo fattore (FM44)" ON public.messaggi_letture IS 'FM44: blocca l''accesso agli amministratori (e a chi ha un fattore verificato) finché la sessione non è aal2. Vedi public.auth_mfa_ok().';

CREATE OR REPLACE FUNCTION public.segna_canale_letto(_canale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.canale_membri WHERE canale_id = _canale_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;
  UPDATE public.canale_membri SET ultimo_letto_at = now()
  WHERE canale_id = _canale_id AND user_id = auth.uid();
  INSERT INTO public.messaggi_letture (messaggio_id, user_id)
  SELECT m.id, auth.uid()
  FROM public.messaggi m
  WHERE m.canale_id = _canale_id
    AND m.autore_id <> auth.uid()
    AND m.eliminato_at IS NULL
    AND m.created_at <= now()
  ON CONFLICT DO NOTHING;
END;
$function$;
COMMENT ON FUNCTION public.segna_canale_letto(uuid) IS 'FM45: fonte unica delle letture chat (ultimo_letto_at + messaggi_letture). Solo membri del canale.';

CREATE OR REPLACE FUNCTION public.get_letture_miei_messaggi(_canale_id uuid)
 RETURNS TABLE(messaggio_id uuid, destinatari integer, letti integer)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH dest AS (
    SELECT cm.user_id FROM public.canale_membri cm
    JOIN public.profili p ON p.id = cm.user_id AND p.attivo
    WHERE cm.canale_id = _canale_id AND cm.user_id <> auth.uid()
  )
  SELECT m.id,
    (SELECT count(*) FROM dest)::int,
    (SELECT count(*) FROM public.messaggi_letture l WHERE l.messaggio_id = m.id AND l.user_id IN (SELECT user_id FROM dest))::int
  FROM public.messaggi m
  WHERE m.canale_id = _canale_id AND m.autore_id = auth.uid() AND m.eliminato_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.get_letture_messaggio(_messaggio_id uuid)
 RETURNS TABLE(user_id uuid, nome text, cognome text, letto_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.nome, p.cognome, l.letto_at
  FROM public.messaggi m
  JOIN public.canale_membri cm ON cm.canale_id = m.canale_id AND cm.user_id <> m.autore_id
  JOIN public.profili p ON p.id = cm.user_id AND p.attivo
  LEFT JOIN public.messaggi_letture l ON l.messaggio_id = m.id AND l.user_id = p.id
  WHERE m.id = _messaggio_id AND m.autore_id = auth.uid()
  ORDER BY (l.letto_at IS NULL), l.letto_at, p.cognome, p.nome;
$function$;

REVOKE ALL ON FUNCTION public.get_letture_miei_messaggi(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_letture_messaggio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_letture_miei_messaggi(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_letture_messaggio(uuid) TO authenticated;