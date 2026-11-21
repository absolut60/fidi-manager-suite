-- Applicata manualmente da Claude il 21/11/2026 (permesso agente sui DROP non attivo); idempotente.
-- NON registrata in drizzle/migrations: il migratore applica ogni voce del journal più recente
-- dell'ultima applicata, quindi aggiungerla lì la farebbe rieseguire automaticamente.

DROP TABLE IF EXISTS public.kit_varianti_articoli;
DROP TABLE IF EXISTS public.kit_varianti;
DROP TABLE IF EXISTS public.kit_parametri;

ALTER TABLE public.kit
  DROP COLUMN IF EXISTS famiglia,
  DROP COLUMN IF EXISTS tipo_struttura,
  DROP COLUMN IF EXISTS spessore,
  DROP COLUMN IF EXISTS h_max,
  DROP COLUMN IF EXISTS passo,
  DROP COLUMN IF EXISTS passo_um,
  DROP COLUMN IF EXISTS isolante;
ALTER TABLE public.kit ALTER COLUMN codice DROP DEFAULT;

ALTER TABLE public.kit_componenti
  DROP COLUMN IF EXISTS articolo_id,
  DROP COLUMN IF EXISTS incidenza,
  DROP COLUMN IF EXISTS lato,
  DROP COLUMN IF EXISTS strato,
  DROP COLUMN IF EXISTS tipo_driver,
  DROP COLUMN IF EXISTS valore_driver,
  DROP COLUMN IF EXISTS regola_base,
  DROP COLUMN IF EXISTS regola_moltiplica,
  DROP COLUMN IF EXISTS regola_dividi_1,
  DROP COLUMN IF EXISTS regola_dividi_2,
  DROP COLUMN IF EXISTS regola_confezione,
  DROP COLUMN IF EXISTS regola_aggiunta,
  DROP COLUMN IF EXISTS variante_ruolo;

DROP TYPE IF EXISTS public.kit_famiglia;
DROP TYPE IF EXISTS public.tipo_driver;

CREATE OR REPLACE FUNCTION public.importa_kit_excel(_kit jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _codice text := btrim(_kit->>'codice');
  _linea public.linea_preventivo := (_kit->>'linea')::public.linea_preventivo;
  _famiglia_id uuid := (_kit->>'famiglia_id')::uuid;
  _famiglia_codice text;
  _id uuid;
  _linea_esistente public.linea_preventivo;
  _vecchi jsonb;
  _sostituite integer := 0;
  _inserite integer := 0;
BEGIN
  IF NOT public.auth_puo_gestire_anagrafiche_prev() THEN
    RAISE EXCEPTION 'Non hai il permesso di gestire i kit.' USING ERRCODE = '42501';
  END IF;
  IF NOT (_linea = ANY(public.auth_linee_abilitate())) THEN
    RAISE EXCEPTION 'Linea non abilitata sul tuo profilo.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(_codice, '') = '' OR coalesce(btrim(_kit->>'nome'), '') = '' OR coalesce(btrim(_kit->>'um_base'), '') = '' THEN
    RAISE EXCEPTION 'Codice, nome e unità base del kit sono obbligatori.';
  END IF;
  SELECT codice INTO _famiglia_codice FROM public.kit_famiglie WHERE id = _famiglia_id AND linea = _linea AND attiva;
  IF _famiglia_codice IS NULL THEN
    RAISE EXCEPTION 'Famiglia non valida per la linea.';
  END IF;

  SELECT id, linea INTO _id, _linea_esistente FROM public.kit WHERE codice = _codice FOR UPDATE;
  IF _id IS NOT NULL THEN
    IF _linea_esistente <> _linea THEN
      RAISE EXCEPTION 'Il kit % esiste già su un''altra linea: la linea non si può cambiare.', _codice;
    END IF;
    UPDATE public.kit SET nome = btrim(_kit->>'nome'), um_base = btrim(_kit->>'um_base'),
      descrizione_tecnica = nullif(btrim(coalesce(_kit->>'descrizione_tecnica', '')), ''),
      famiglia_id = _famiglia_id
    WHERE id = _id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kit % non aggiornato: verifica i permessi.', _codice; END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO _vecchi
    FROM public.kit_componenti c WHERE c.kit_id = _id;
    DELETE FROM public.kit_componenti WHERE kit_id = _id;
    GET DIAGNOSTICS _sostituite = ROW_COUNT;
  ELSE
    INSERT INTO public.kit (codice, nome, linea, famiglia_id, um_base, descrizione_tecnica, specifiche)
    VALUES (_codice, btrim(_kit->>'nome'), _linea, _famiglia_id,
      btrim(_kit->>'um_base'), nullif(btrim(coalesce(_kit->>'descrizione_tecnica', '')), ''), '{}'::jsonb)
    RETURNING id INTO _id;
    _vecchi := '[]'::jsonb;
  END IF;

  INSERT INTO public.kit_componenti (kit_id, ordine, ruolo, articolo_codice, codice_articolo_fornitore, descrizione, um,
    n_pezzi, passo, passo_2, consumo, lati, confezione, sfrido, riga_rif, peso_unitario, note,
    fornitore_id, marca, costo, listino_fornitore)
  SELECT _id, r.ordine, r.ruolo, r.articolo_codice, r.codice_articolo_fornitore, r.descrizione, r.um,
    r.n_pezzi, r.passo, r.passo_2, r.consumo, r.lati, r.confezione, r.sfrido, r.riga_rif, r.peso_unitario, r.note,
    v.fornitore_id, v.marca, v.costo, v.listino_fornitore
  FROM jsonb_to_recordset(coalesce(_kit->'righe', '[]'::jsonb)) AS r(
    ordine integer, ruolo text, articolo_codice text, codice_articolo_fornitore text, descrizione text, um text,
    n_pezzi numeric, passo numeric, passo_2 numeric, consumo numeric, lati numeric, confezione numeric, sfrido numeric,
    riga_rif integer, peso_unitario numeric, note text)
  LEFT JOIN jsonb_to_recordset(_vecchi) AS v(ordine integer, codice_articolo_fornitore text, articolo_codice text,
    fornitore_id uuid, marca text, costo numeric, listino_fornitore numeric)
    ON r.articolo_codice IS NULL AND v.articolo_codice IS NULL AND v.ordine = r.ordine
   AND v.codice_articolo_fornitore IS NOT DISTINCT FROM r.codice_articolo_fornitore;
  GET DIAGNOSTICS _inserite = ROW_COUNT;

  RETURN jsonb_build_object('kit_id', _id, 'esito', CASE WHEN _vecchi = '[]'::jsonb AND _sostituite = 0 AND _linea_esistente IS NULL THEN 'creato' ELSE 'aggiornato' END,
    'righe_sostituite', _sostituite, 'righe_inserite', _inserite);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.importa_kit_excel(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importa_kit_excel(jsonb) TO authenticated, service_role;
