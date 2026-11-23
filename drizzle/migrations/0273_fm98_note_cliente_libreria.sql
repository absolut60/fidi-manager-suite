ALTER TABLE public.preventivi ADD COLUMN note_cliente text NULL;

CREATE TABLE public.note_preventivo_libreria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linea public.linea_preventivo NOT NULL,
  titolo text NOT NULL CONSTRAINT note_libreria_titolo_valido CHECK (length(btrim(titolo)) BETWEEN 1 AND 120),
  testo text NOT NULL CONSTRAINT note_libreria_testo_valido CHECK (length(btrim(testo)) > 0),
  creato_da uuid DEFAULT auth.uid(),
  aggiornato_da uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_preventivo_libreria TO authenticated;
GRANT ALL ON public.note_preventivo_libreria TO service_role;
ALTER TABLE public.note_preventivo_libreria ENABLE ROW LEVEL SECURITY;
CREATE INDEX note_preventivo_libreria_linea_titolo ON public.note_preventivo_libreria (linea, titolo);
CREATE TRIGGER note_preventivo_libreria_updated_at BEFORE UPDATE ON public.note_preventivo_libreria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- FM98: gemelle di PERMESSI_NOTE_PREVENTIVO in src/lib/note-preventivo.ts.
-- Lettura della linea senza auth_ha_accesso_preventivi (showroom compreso).
CREATE OR REPLACE FUNCTION public.auth_legge_note_preventivo(_linea public.linea_preventivo)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'amministratore')
    OR public.has_role(auth.uid(), 'store_manager')
    OR ((public.has_role(auth.uid(), 'preventivi_manage')
      OR public.has_role(auth.uid(), 'preventivi_write')
      OR public.has_role(auth.uid(), 'preventivi_read')
      OR public.has_role(auth.uid(), 'showroom')
      OR public.has_role(auth.uid(), 'responsabile_showroom'))
      AND _linea = ANY((SELECT public.auth_linee_abilitate())::public.linea_preventivo[]))
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.auth_legge_note_preventivo(public.linea_preventivo) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_legge_note_preventivo(public.linea_preventivo) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_scrive_note_preventivo(_linea public.linea_preventivo, _autore uuid, _azione text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND _azione IN ('inserisci', 'modifica', 'elimina') AND (
    public.has_role(auth.uid(), 'amministratore')
    OR (_linea = ANY((SELECT public.auth_linee_abilitate())::public.linea_preventivo[]) AND (
      public.has_role(auth.uid(), 'preventivi_manage')
      OR public.has_role(auth.uid(), 'responsabile_showroom')
      OR CASE WHEN _azione = 'inserisci'
        THEN public.has_role(auth.uid(), 'preventivi_write')
        ELSE _autore = auth.uid()
      END
    ))
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.auth_scrive_note_preventivo(public.linea_preventivo, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_scrive_note_preventivo(public.linea_preventivo, uuid, text) TO authenticated, service_role;

CREATE POLICY "Secondo fattore (FM44)" ON public.note_preventivo_libreria AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY note_libreria_select ON public.note_preventivo_libreria FOR SELECT TO authenticated USING (public.auth_legge_note_preventivo(linea));
CREATE POLICY note_libreria_insert ON public.note_preventivo_libreria FOR INSERT TO authenticated WITH CHECK (creato_da = (SELECT auth.uid()) AND public.auth_scrive_note_preventivo(linea, creato_da, 'inserisci'));
CREATE POLICY note_libreria_update ON public.note_preventivo_libreria FOR UPDATE TO authenticated USING (public.auth_scrive_note_preventivo(linea, creato_da, 'modifica')) WITH CHECK (public.auth_scrive_note_preventivo(linea, creato_da, 'modifica'));
CREATE POLICY note_libreria_delete ON public.note_preventivo_libreria FOR DELETE TO authenticated USING (public.auth_scrive_note_preventivo(linea, creato_da, 'elimina'));

-- Copia chirurgica: l'impronta protegge da qualsiasi cambiamento intercorso.
-- Solo DDL della migrazione, nessun SQL dinamico aggiunto alla RPC operativa.
DO $fm98$
DECLARE originale text; modificata text;
BEGIN
  originale := pg_get_functiondef('public.trasforma_preventivo_in_ordine(uuid,jsonb)'::regprocedure);
  IF md5(originale) <> 'b68b4cf59084abd7ba159960fda0cc84' THEN
    RAISE EXCEPTION 'Definizione trasformazione ordine diversa da quella verificata';
  END IF;
  modificata := replace(replace(originale,
    E'categoria_rif, lead_id\n', E'categoria_rif, lead_id, note_cliente\n'),
    E'v_prev.categoria_rif, v_prev.lead_id\n', E'v_prev.categoria_rif, v_prev.lead_id, v_prev.note_cliente\n');
  IF md5(modificata) <> '803ae053b9e56e5f1678159cfc2a3064' THEN
    RAISE EXCEPTION 'Diff trasformazione ordine diverso dalla sola copia note cliente';
  END IF;
  EXECUTE modificata;
END;
$fm98$;
REVOKE EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid, jsonb) TO authenticated, service_role;