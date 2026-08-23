CREATE TABLE public.messaggi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canale_id uuid NOT NULL REFERENCES public.canali(id) ON DELETE CASCADE,
  autore_id uuid NOT NULL DEFAULT auth.uid(),
  testo text NOT NULL,
  reply_to_id uuid NULL REFERENCES public.messaggi(id) ON DELETE SET NULL,
  entita_tipo text NULL,
  entita_id uuid NULL,
  eliminato_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messaggi_entita_coerenza CHECK (
    (entita_tipo IS NULL AND entita_id IS NULL)
    OR (entita_tipo IS NOT NULL AND entita_id IS NOT NULL
        AND entita_tipo IN ('cliente','preventivo','richiesta_fido','richiesta_interna'))
  )
);

CREATE INDEX idx_messaggi_canale_created ON public.messaggi (canale_id, created_at);
CREATE INDEX idx_messaggi_autore ON public.messaggi (autore_id);
CREATE INDEX idx_messaggi_reply_to ON public.messaggi (reply_to_id);
CREATE INDEX idx_messaggi_entita ON public.messaggi (entita_tipo, entita_id) WHERE entita_tipo IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messaggi TO authenticated;
GRANT ALL ON public.messaggi TO service_role;

CREATE TRIGGER trg_messaggi_updated
  BEFORE UPDATE ON public.messaggi
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.messaggi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messaggi_select" ON public.messaggi FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role) OR public.is_canale_membro(canale_id, auth.uid()));

CREATE POLICY "messaggi_insert" ON public.messaggi FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role) OR (autore_id = auth.uid() AND public.is_canale_membro(canale_id, auth.uid())));

CREATE POLICY "messaggi_update" ON public.messaggi FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role) OR autore_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role) OR autore_id = auth.uid());

CREATE POLICY "messaggi_delete" ON public.messaggi FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role));