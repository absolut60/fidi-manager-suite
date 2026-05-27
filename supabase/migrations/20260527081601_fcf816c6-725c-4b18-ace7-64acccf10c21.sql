CREATE TABLE public.comunicazioni_richiesta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  richiesta_id uuid NOT NULL REFERENCES public.richieste_fido(id) ON DELETE CASCADE,
  autore_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destinatario text NOT NULL CHECK (destinatario IN ('richiedente','approvatore','tutti')),
  testo text NOT NULL CHECK (char_length(testo) > 0),
  letto boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_comunicazioni_richiesta ON public.comunicazioni_richiesta(richiesta_id);
CREATE INDEX idx_comunicazioni_autore ON public.comunicazioni_richiesta(autore_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comunicazioni_richiesta TO authenticated;
GRANT ALL ON public.comunicazioni_richiesta TO service_role;

ALTER TABLE public.comunicazioni_richiesta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Visibili ai coinvolti nella richiesta"
ON public.comunicazioni_richiesta FOR SELECT
TO authenticated
USING (
  richiesta_id IN (
    SELECT id FROM public.richieste_fido WHERE created_by = auth.uid()
  )
  OR auth.uid() IN (
    SELECT approvatore_id FROM public.approvazioni
    WHERE richiesta_id = comunicazioni_richiesta.richiesta_id
  )
  OR public.has_role(auth.uid(), 'amministratore')
);

CREATE POLICY "Inserimento per utenti autenticati"
ON public.comunicazioni_richiesta FOR INSERT
TO authenticated
WITH CHECK (autore_id = auth.uid());