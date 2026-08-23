CREATE TYPE public.tipo_area AS ENUM ('recupero_crediti','commerciale','amministrazione','magazzino');

CREATE TABLE public.aree_funzionali (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    tipo public.tipo_area NOT NULL,
    store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
    attiva boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aree_funzionali TO authenticated;
GRANT ALL ON public.aree_funzionali TO service_role;

CREATE TABLE public.area_membri (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id uuid NOT NULL REFERENCES public.aree_funzionali(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    ruolo_area text NOT NULL DEFAULT 'membro' CHECK (ruolo_area IN ('membro','responsabile')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (area_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.area_membri TO authenticated;
GRANT ALL ON public.area_membri TO service_role;

CREATE INDEX ON public.area_membri (user_id);
CREATE INDEX ON public.area_membri (area_id);
CREATE INDEX ON public.aree_funzionali (store_id);

CREATE TRIGGER trg_aree_funzionali_updated
    BEFORE UPDATE ON public.aree_funzionali
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.aree_funzionali ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_membri ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aree_funzionali_select"
    ON public.aree_funzionali
    FOR SELECT
    TO authenticated
    USING (
        public.has_role(auth.uid(), 'amministratore'::public.app_role)
        OR EXISTS (
            SELECT 1 FROM public.area_membri m
            WHERE m.area_id = public.aree_funzionali.id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "aree_funzionali_insert"
    ON public.aree_funzionali
    FOR INSERT
    TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'amministratore'::public.app_role));

CREATE POLICY "aree_funzionali_update"
    ON public.aree_funzionali
    FOR UPDATE
    TO authenticated
    USING (public.has_role(auth.uid(), 'amministratore'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'amministratore'::public.app_role));

CREATE POLICY "aree_funzionali_delete"
    ON public.aree_funzionali
    FOR DELETE
    TO authenticated
    USING (public.has_role(auth.uid(), 'amministratore'::public.app_role));

CREATE POLICY "area_membri_select"
    ON public.area_membri
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.has_role(auth.uid(), 'amministratore'::public.app_role)
    );

CREATE POLICY "area_membri_insert"
    ON public.area_membri
    FOR INSERT
    TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'amministratore'::public.app_role));

CREATE POLICY "area_membri_update"
    ON public.area_membri
    FOR UPDATE
    TO authenticated
    USING (public.has_role(auth.uid(), 'amministratore'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'amministratore'::public.app_role));

CREATE POLICY "area_membri_delete"
    ON public.area_membri
    FOR DELETE
    TO authenticated
    USING (public.has_role(auth.uid(), 'amministratore'::public.app_role));