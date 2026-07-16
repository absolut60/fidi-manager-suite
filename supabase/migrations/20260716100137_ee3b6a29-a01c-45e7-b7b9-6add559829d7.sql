-- 0. Fix user_can_access_richiesta_interna: aggiungi ramo "richieste create da me"
CREATE OR REPLACE FUNCTION public.user_can_access_richiesta_interna(_richiesta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- admin e ruoli globali: vedono tutto
    public.has_role(auth.uid(), 'amministratore')
    OR public.has_role(auth.uid(), 'approvatore_richieste_liv1')
    OR public.has_role(auth.uid(), 'approvatore_richieste_liv2')
    OR public.has_role(auth.uid(), 'gestore_richieste')
    OR public.has_role(auth.uid(), 'esecutore_richieste')
    -- richiedente: vede le proprie richieste (anche senza sede)
    OR EXISTS (
      SELECT 1 FROM public.richieste_interne r
      WHERE r.id = _richiesta_id
        AND public.has_role(auth.uid(), 'richiedente')
        AND r.requester_id = auth.uid()
    )
    -- richiedente: vede le richieste della sua sede
    OR EXISTS (
      SELECT 1 FROM public.richieste_interne r
      JOIN public.profili p ON p.id = auth.uid()
      WHERE r.id = _richiesta_id
        AND public.has_role(auth.uid(), 'richiedente')
        AND p.store_id IS NOT NULL
        AND r.sede_id = p.store_id
    )
$$;

REVOKE EXECUTE ON FUNCTION public.user_can_access_richiesta_interna(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_richiesta_interna(uuid) TO authenticated, service_role;

-- 1. Tabella di mappatura temporanea per la migrazione
CREATE TABLE public.migrazione_richieste_utenti (
  email text PRIMARY KEY,
  uuid_origine uuid NOT NULL,
  uuid_destinazione uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.migrazione_richieste_utenti TO authenticated;
GRANT ALL ON public.migrazione_richieste_utenti TO service_role;

ALTER TABLE public.migrazione_richieste_utenti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo admin vede mappatura migrazione"
ON public.migrazione_richieste_utenti FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'amministratore'));

CREATE POLICY "Solo admin scrive mappatura migrazione"
ON public.migrazione_richieste_utenti FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'amministratore'))
WITH CHECK (public.has_role(auth.uid(), 'amministratore'));

CREATE TRIGGER trg_migrazione_richieste_utenti_updated_at
BEFORE UPDATE ON public.migrazione_richieste_utenti
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed dei 21 utenti (5 esistenti + 16 da creare)
INSERT INTO public.migrazione_richieste_utenti (email, uuid_origine, note) VALUES
  ('a.giani@gruppomade.com', 'a0b654ce-aff8-4b94-9483-73d205ef67c1', 'esistente'),
  ('enrico.mongiusti@madepoint.it', '7936207c-366c-4a3b-b7e5-c51af1983be6', 'esistente'),
  ('carlos.casuscelli@madepoint.it', 'd7b9df97-dc35-484c-8fd7-994ac7b1ebfa', 'esistente'),
  ('daniele.galliani@madepoint.it', '4f38833a-72be-4f85-ad69-4710f79c7963', 'esistente'),
  ('matteo.garavaglia@madepoint.it', 'ad82403b-8da3-4661-aaf8-5f6f9e11c30c', 'esistente'),
  ('g.bellini@gruppomade.com', '52f20e19-76ff-4351-b557-8abf1e6b268b', 'nuovo'),
  ('s.sapone@gruppomade.com', '3e89158f-fb9b-4ec7-ba86-41ea1da9f207', 'nuovo'),
  ('n.albini@gruppomade.com', '5238a2f8-7742-4fc8-b951-d4a08dfedb8c', 'nuovo'),
  ('o.sfratta@gruppomade.com', 'da4bbb75-b850-4958-8a21-974143bbb8a3', 'nuovo'),
  ('gabriele.doni@madepoint.it', '63b3e3a3-6b65-4594-a5ac-8cc66037eedb', 'nuovo'),
  ('s.sassatelli@gruppomade.com', '770be3ba-773a-4f07-9005-21ae20ce97a3', 'nuovo'),
  ('silvia.vismara@madepoint.it', '3e65721b-178f-4169-ab3b-f605c8c81c7f', 'nuovo'),
  ('sonia.bellia@madepoint.it', 'b226cb18-5ff6-42d6-a890-8e5984d5c53e', 'nuovo'),
  ('antonio.giannubilo@madepoint.it', 'd10132fd-2a60-4e5e-8a42-80220340ef4f', 'nuovo'),
  ('ketty.laveni@madepoint.it', '424670bc-0db5-4a54-9c35-11d63681a489', 'nuovo'),
  ('alessio.sironi@madepoint.it', 'c8d2bc8d-2cc1-4b83-8c4b-96f9e4cc237d', 'nuovo'),
  ('andrea.abrate@madepoint.it', '11e8b1d4-4c3a-41d7-ac48-e5acb2b7e709', 'nuovo'),
  ('attilio.garavaglia@madepoint.it', '577940d5-7417-41c5-b04d-c5b0f7587488', 'nuovo'),
  ('gianfranco.serino@madepoint.it', 'cbceb328-6d43-4eed-867f-02887572d248', 'nuovo'),
  ('luca.lopolito@madepoint.it', 'fdf90bd4-776f-4d1e-9c94-94c0eefd9f18', 'nuovo'),
  ('maria.fatiga@madepoint.it', 'd9b984e3-483d-4919-887a-d9dabc973a54', 'nuovo');