
-- ============ TABELLE ============

CREATE TABLE public.fornitori (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornitori TO authenticated;
GRANT ALL ON public.fornitori TO service_role;
ALTER TABLE public.fornitori ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.richieste_interne (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profili(id),
  requester_name text NOT NULL,
  sede_id uuid REFERENCES public.stores(id),
  sede_name text,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('preventivo','attivita','acquisto')),
  description text,
  amount numeric,
  fornitore text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resp_approved','forwarded','approved','rejected')),
  resp_approver_id uuid REFERENCES public.profili(id),
  resp_approver_name text,
  resp_note text,
  resp_action text CHECK (resp_action IN ('approved','forwarded','rejected')),
  resp_at timestamptz,
  dir_approver_id uuid REFERENCES public.profili(id),
  dir_approver_name text,
  dir_note text,
  dir_action text CHECK (dir_action IN ('approved','rejected')),
  dir_at timestamptz,
  admin_status text DEFAULT 'da_gestire' CHECK (admin_status IN ('da_gestire','in_gestione','conclusa')),
  admin_note text,
  admin_at timestamptz,
  admin_by_name text,
  sent_to_gestionale boolean NOT NULL DEFAULT false,
  gestionale_ref text,
  gestionale_sent_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.richieste_interne TO authenticated;
GRANT ALL ON public.richieste_interne TO service_role;
ALTER TABLE public.richieste_interne ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_richieste_interne_requester ON public.richieste_interne(requester_id);
CREATE INDEX idx_richieste_interne_sede ON public.richieste_interne(sede_id);
CREATE INDEX idx_richieste_interne_status ON public.richieste_interne(status);
CREATE INDEX idx_richieste_interne_admin_status ON public.richieste_interne(admin_status);

CREATE TRIGGER trg_richieste_interne_updated_at
  BEFORE UPDATE ON public.richieste_interne
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.richieste_interne_messaggi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.richieste_interne(id) ON DELETE CASCADE,
  mittente_id uuid REFERENCES public.profili(id),
  mittente_name text NOT NULL,
  mittente_ruolo text NOT NULL,
  destinatario text NOT NULL,
  testo text NOT NULL,
  tipo text NOT NULL DEFAULT 'messaggio',
  letto_da uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.richieste_interne_messaggi TO authenticated;
GRANT ALL ON public.richieste_interne_messaggi TO service_role;
ALTER TABLE public.richieste_interne_messaggi ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_richieste_interne_messaggi_request ON public.richieste_interne_messaggi(request_id);

CREATE TABLE public.richieste_interne_allegati (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.richieste_interne(id) ON DELETE CASCADE,
  nome_file text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  dimensione_bytes bigint,
  caricato_da uuid REFERENCES public.profili(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.richieste_interne_allegati TO authenticated;
GRANT ALL ON public.richieste_interne_allegati TO service_role;
ALTER TABLE public.richieste_interne_allegati ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_richieste_interne_allegati_request ON public.richieste_interne_allegati(request_id);

-- ============ HELPER RLS ============

CREATE OR REPLACE FUNCTION public.user_can_access_richiesta_interna(_richiesta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(auth.uid(),'amministratore')
    OR public.has_role(auth.uid(),'approvatore_richieste_liv1')
    OR public.has_role(auth.uid(),'approvatore_richieste_liv2')
    OR public.has_role(auth.uid(),'gestore_richieste')
    OR public.has_role(auth.uid(),'esecutore_richieste')
    OR EXISTS (
      SELECT 1
      FROM public.richieste_interne r
      JOIN public.profili p ON p.id = auth.uid()
      WHERE r.id = _richiesta_id
        AND public.has_role(auth.uid(),'richiedente')
        AND r.sede_id IS NOT NULL
        AND r.sede_id = p.store_id
    );
$$;

REVOKE EXECUTE ON FUNCTION public.user_can_access_richiesta_interna(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_richiesta_interna(uuid) TO authenticated, service_role;

-- ============ POLICY: richieste_interne ============

CREATE POLICY "richieste_interne_select"
  ON public.richieste_interne FOR SELECT TO authenticated
  USING (public.user_can_access_richiesta_interna(id));

CREATE POLICY "richieste_interne_insert"
  ON public.richieste_interne FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND (
      public.has_role(auth.uid(),'richiedente')
      OR public.has_role(auth.uid(),'amministratore')
    )
  );

CREATE POLICY "richieste_interne_update"
  ON public.richieste_interne FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'amministratore')
    OR public.has_role(auth.uid(),'approvatore_richieste_liv1')
    OR public.has_role(auth.uid(),'approvatore_richieste_liv2')
    OR public.has_role(auth.uid(),'gestore_richieste')
    OR public.has_role(auth.uid(),'esecutore_richieste')
    OR (requester_id = auth.uid() AND status = 'pending')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'amministratore')
    OR public.has_role(auth.uid(),'approvatore_richieste_liv1')
    OR public.has_role(auth.uid(),'approvatore_richieste_liv2')
    OR public.has_role(auth.uid(),'gestore_richieste')
    OR public.has_role(auth.uid(),'esecutore_richieste')
    OR (requester_id = auth.uid() AND status = 'pending')
  );

CREATE POLICY "richieste_interne_delete"
  ON public.richieste_interne FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'amministratore'));

-- ============ POLICY: richieste_interne_messaggi ============

CREATE POLICY "richieste_interne_messaggi_select"
  ON public.richieste_interne_messaggi FOR SELECT TO authenticated
  USING (public.user_can_access_richiesta_interna(request_id));

CREATE POLICY "richieste_interne_messaggi_insert"
  ON public.richieste_interne_messaggi FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_richiesta_interna(request_id)
    AND (mittente_id = auth.uid() OR public.has_role(auth.uid(),'amministratore'))
  );

CREATE POLICY "richieste_interne_messaggi_update"
  ON public.richieste_interne_messaggi FOR UPDATE TO authenticated
  USING (mittente_id = auth.uid() OR public.has_role(auth.uid(),'amministratore'))
  WITH CHECK (mittente_id = auth.uid() OR public.has_role(auth.uid(),'amministratore'));

CREATE POLICY "richieste_interne_messaggi_delete"
  ON public.richieste_interne_messaggi FOR DELETE TO authenticated
  USING (mittente_id = auth.uid() OR public.has_role(auth.uid(),'amministratore'));

-- ============ POLICY: richieste_interne_allegati ============

CREATE POLICY "richieste_interne_allegati_select"
  ON public.richieste_interne_allegati FOR SELECT TO authenticated
  USING (public.user_can_access_richiesta_interna(request_id));

CREATE POLICY "richieste_interne_allegati_insert"
  ON public.richieste_interne_allegati FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_richiesta_interna(request_id)
    AND (caricato_da = auth.uid() OR public.has_role(auth.uid(),'amministratore'))
  );

CREATE POLICY "richieste_interne_allegati_update"
  ON public.richieste_interne_allegati FOR UPDATE TO authenticated
  USING (caricato_da = auth.uid() OR public.has_role(auth.uid(),'amministratore'))
  WITH CHECK (caricato_da = auth.uid() OR public.has_role(auth.uid(),'amministratore'));

CREATE POLICY "richieste_interne_allegati_delete"
  ON public.richieste_interne_allegati FOR DELETE TO authenticated
  USING (caricato_da = auth.uid() OR public.has_role(auth.uid(),'amministratore'));

-- ============ POLICY: fornitori ============

CREATE POLICY "fornitori_select_authenticated"
  ON public.fornitori FOR SELECT TO authenticated USING (true);

CREATE POLICY "fornitori_all_admin"
  ON public.fornitori FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'amministratore'))
  WITH CHECK (public.has_role(auth.uid(),'amministratore'));
