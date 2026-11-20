ALTER TABLE public.kit_componenti
  ADD COLUMN regola_base text,
  ADD COLUMN regola_moltiplica text,
  ADD COLUMN regola_dividi_1 text,
  ADD COLUMN regola_dividi_2 text,
  ADD COLUMN regola_confezione text,
  ADD COLUMN regola_aggiunta text,
  ADD COLUMN variante_ruolo text,
  ADD CONSTRAINT kit_componenti_kit_ordine_unique UNIQUE (kit_id, ordine),
  ADD CONSTRAINT kit_componenti_regola_base_check CHECK (regola_base IS NULL OR regola_base ~ '^([+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)|PARAM:[A-Z0-9_]+|RIGA:[0-9]+)$'),
  ADD CONSTRAINT kit_componenti_regola_moltiplica_check CHECK (regola_moltiplica IS NULL OR regola_moltiplica ~ '^([+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)|PARAM:[A-Z0-9_]+|RIGA:[0-9]+)$'),
  ADD CONSTRAINT kit_componenti_regola_dividi_1_check CHECK (regola_dividi_1 IS NULL OR regola_dividi_1 ~ '^([+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)|PARAM:[A-Z0-9_]+|RIGA:[0-9]+)$'),
  ADD CONSTRAINT kit_componenti_regola_dividi_2_check CHECK (regola_dividi_2 IS NULL OR regola_dividi_2 ~ '^([+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)|PARAM:[A-Z0-9_]+|RIGA:[0-9]+)$'),
  ADD CONSTRAINT kit_componenti_regola_confezione_check CHECK (regola_confezione IS NULL OR regola_confezione ~ '^([+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)|PARAM:[A-Z0-9_]+|RIGA:[0-9]+)$'),
  ADD CONSTRAINT kit_componenti_regola_aggiunta_check CHECK (regola_aggiunta IS NULL OR regola_aggiunta ~ '^([+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)|PARAM:[A-Z0-9_]+|RIGA:[0-9]+)$'),
  ADD CONSTRAINT kit_componenti_variante_articolo_check CHECK (variante_ruolo IS NULL OR (length(btrim(variante_ruolo)) > 0 AND articolo_codice IS NULL AND codice_articolo_fornitore IS NULL AND descrizione IS NULL AND um IS NULL AND fornitore_id IS NULL AND marca IS NULL AND costo IS NULL AND listino_fornitore IS NULL));

CREATE TABLE public.kit_parametri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES public.kit(id) ON DELETE CASCADE,
  codice text NOT NULL CHECK (codice ~ '^[A-Z0-9_]+$'),
  etichetta text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('numero', 'scelta')),
  valori_ammessi numeric[],
  valore_default numeric NOT NULL,
  um text,
  note text,
  ordine integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kit_id, codice),
  CONSTRAINT kit_parametri_scelta_check CHECK (
    (tipo = 'numero' AND valori_ammessi IS NULL) OR
    (tipo = 'scelta' AND valori_ammessi IS NOT NULL AND cardinality(valori_ammessi) > 0 AND valore_default = ANY(valori_ammessi))
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kit_parametri TO authenticated;
GRANT ALL ON public.kit_parametri TO service_role;
ALTER TABLE public.kit_parametri ENABLE ROW LEVEL SECURITY;
CREATE POLICY kit_parametri_prev_select ON public.kit_parametri FOR SELECT TO authenticated USING ((SELECT public.auth_consulta_preventivi()));
CREATE POLICY kit_parametri_prev_write ON public.kit_parametri FOR ALL TO authenticated USING ((SELECT public.auth_puo_gestire_anagrafiche_prev())) WITH CHECK ((SELECT public.auth_puo_gestire_anagrafiche_prev()));
CREATE POLICY "Secondo fattore (FM44)" ON public.kit_parametri AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE TRIGGER update_kit_parametri_updated_at BEFORE UPDATE ON public.kit_parametri FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.kit_varianti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES public.kit(id) ON DELETE CASCADE,
  codice text NOT NULL,
  nome_commerciale text NOT NULL,
  descrizione_struttura text,
  imposta_parametri jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(imposta_parametri) = 'object'),
  predefinita boolean NOT NULL DEFAULT false,
  ordine integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kit_id, codice)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kit_varianti TO authenticated;
GRANT ALL ON public.kit_varianti TO service_role;
ALTER TABLE public.kit_varianti ENABLE ROW LEVEL SECURITY;
CREATE POLICY kit_varianti_prev_select ON public.kit_varianti FOR SELECT TO authenticated USING ((SELECT public.auth_consulta_preventivi()));
CREATE POLICY kit_varianti_prev_write ON public.kit_varianti FOR ALL TO authenticated USING ((SELECT public.auth_puo_gestire_anagrafiche_prev())) WITH CHECK ((SELECT public.auth_puo_gestire_anagrafiche_prev()));
CREATE POLICY "Secondo fattore (FM44)" ON public.kit_varianti AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE TRIGGER update_kit_varianti_updated_at BEFORE UPDATE ON public.kit_varianti FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE UNIQUE INDEX kit_varianti_predefinita_unique ON public.kit_varianti (kit_id) WHERE predefinita;

CREATE TABLE public.kit_varianti_articoli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variante_id uuid NOT NULL REFERENCES public.kit_varianti(id) ON DELETE CASCADE,
  ruolo text NOT NULL,
  articolo_codice text,
  descrizione text,
  um text,
  codice_articolo_fornitore text,
  fornitore_id uuid REFERENCES public.fornitori(id) ON DELETE SET NULL,
  marca text,
  costo numeric,
  listino_fornitore numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variante_id, ruolo),
  CONSTRAINT kit_varianti_articoli_origine_check CHECK (
    (articolo_codice IS NOT NULL AND codice_articolo_fornitore IS NULL AND descrizione IS NULL AND um IS NULL AND fornitore_id IS NULL AND marca IS NULL AND costo IS NULL AND listino_fornitore IS NULL) OR
    (articolo_codice IS NULL AND (codice_articolo_fornitore IS NOT NULL OR descrizione IS NOT NULL))
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kit_varianti_articoli TO authenticated;
GRANT ALL ON public.kit_varianti_articoli TO service_role;
ALTER TABLE public.kit_varianti_articoli ENABLE ROW LEVEL SECURITY;
CREATE POLICY kit_varianti_articoli_prev_select ON public.kit_varianti_articoli FOR SELECT TO authenticated USING ((SELECT public.auth_consulta_preventivi()));
CREATE POLICY kit_varianti_articoli_prev_write ON public.kit_varianti_articoli FOR ALL TO authenticated USING ((SELECT public.auth_puo_gestire_anagrafiche_prev())) WITH CHECK ((SELECT public.auth_puo_gestire_anagrafiche_prev()));
CREATE POLICY "Secondo fattore (FM44)" ON public.kit_varianti_articoli AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE TRIGGER update_kit_varianti_articoli_updated_at BEFORE UPDATE ON public.kit_varianti_articoli FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
