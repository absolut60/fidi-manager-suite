CREATE TABLE IF NOT EXISTS public.kit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    famiglia public.kit_famiglia NOT NULL DEFAULT 'ALTRO',
    descrizione_tecnica text NULL,
    um_base text NOT NULL DEFAULT 'mq',
    tipo_struttura text NULL,
    spessore numeric NULL,
    h_max numeric NULL,
    passo numeric NULL,
    passo_um text NULL,
    isolante text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kit_componenti (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_id uuid NOT NULL REFERENCES public.kit(id) ON DELETE CASCADE,
    articolo_id uuid NULL REFERENCES public.articoli(id),
    ruolo text NULL,
    lato integer NULL,
    strato integer NULL,
    tipo_driver public.tipo_driver NULL,
    valore_driver numeric NULL,
    incidenza numeric NULL,
    ordine integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.allegati_kit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_id uuid NOT NULL REFERENCES public.kit(id) ON DELETE CASCADE,
    categoria text NOT NULL DEFAULT 'altro',
    nome_file text NOT NULL,
    storage_path text NOT NULL,
    mime_type text NULL,
    dimensione_bytes integer NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kit TO authenticated;
GRANT ALL ON public.kit TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kit_componenti TO authenticated;
GRANT ALL ON public.kit_componenti TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.allegati_kit TO authenticated;
GRANT ALL ON public.allegati_kit TO service_role;

ALTER TABLE public.kit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_componenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allegati_kit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo amministratore su kit" ON public.kit
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'amministratore'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'amministratore'::public.app_role));

CREATE POLICY "Solo amministratore su kit_componenti" ON public.kit_componenti
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'amministratore'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'amministratore'::public.app_role));

CREATE POLICY "Solo amministratore su allegati_kit" ON public.allegati_kit
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'amministratore'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'amministratore'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_kit_componenti_kit_id ON public.kit_componenti(kit_id);
CREATE INDEX IF NOT EXISTS idx_kit_componenti_articolo_id ON public.kit_componenti(articolo_id);
CREATE INDEX IF NOT EXISTS idx_allegati_kit_kit_id ON public.allegati_kit(kit_id);

CREATE TRIGGER update_kit_updated_at
    BEFORE UPDATE ON public.kit
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_kit_componenti_updated_at
    BEFORE UPDATE ON public.kit_componenti
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();