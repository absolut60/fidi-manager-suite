-- FM51 — Escalation solleciti, fetta 1: fonte unica dello stadio, campagne progressive, proposta legale da mora ripetuta.

-- 1) Configurazione giorni minimi tra solleciti
INSERT INTO public.configurazioni (chiave, valore, descrizione)
VALUES ('sollecito_giorni_minimi', '15', 'Giorni minimi tra un sollecito e il successivo allo stesso cliente (escalation FM51)')
ON CONFLICT (chiave) DO NOTHING;

-- 2) FONTE UNICA dello stadio di sollecito per cliente.
-- Regola: stadio = MAX(livello_sollecito) tra le azioni_recupero tipo 'email' con livello 1..3
-- collegate (azioni_recupero_scadenze) ad almeno una scadenza 'Aperta'; stadio_data = MAX(data_azione)
-- delle azioni al livello massimo; 0 se nessuna. Gemello TS della mappa livello -> tipo template:
-- src/lib/escalation-solleciti.ts. Non duplicare questa regola altrove: usare questa funzione.
-- SECURITY INVOKER (RLS dell'utente). Senza SET search_path per permettere l'inlining nel planner:
-- tutti i riferimenti sono qualificati con lo schema.
CREATE OR REPLACE FUNCTION public.get_stadio_sollecito_clienti(_cliente_ids uuid[] DEFAULT NULL)
RETURNS TABLE(
  cliente_id uuid,
  stadio smallint,
  stadio_data timestamptz,
  stadio_giorni integer,
  livello_successivo smallint,
  ripetizione_mora boolean,
  giorni_minimi integer,
  attesa_ok boolean,
  data_prossimo_possibile date,
  totale_scaduto numeric,
  in_gestione_legale boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $function$
  WITH params AS (
    SELECT COALESCE(
      (SELECT CASE WHEN cf.valore ~ '^\s*\d+\s*$' THEN trim(cf.valore)::int END
         FROM public.configurazioni cf WHERE cf.chiave = 'sollecito_giorni_minimi'),
      15) AS gm
  ),
  email_aperte AS (
    SELECT DISTINCT a.id, a.cliente_id, a.livello_sollecito, a.data_azione
    FROM public.azioni_recupero a
    JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
    JOIN public.scadenze s ON s.id = ars.scadenza_id
    WHERE a.tipo='email' AND a.livello_sollecito BETWEEN 1 AND 3
      AND s.stato_contabile='Aperta'
      AND (_cliente_ids IS NULL OR a.cliente_id = ANY(_cliente_ids))
  ),
  stadio_cli AS (
    SELECT cliente_id,
      MAX(livello_sollecito)::smallint AS stadio_sollecito,
      MAX(data_azione) FILTER (
        WHERE livello_sollecito = (SELECT MAX(e2.livello_sollecito) FROM email_aperte e2 WHERE e2.cliente_id=email_aperte.cliente_id)
      ) AS stadio_data
    FROM email_aperte GROUP BY cliente_id
  ),
  base AS (
    SELECT DISTINCT x.id AS cliente_id FROM unnest(_cliente_ids) AS x(id)
    WHERE _cliente_ids IS NOT NULL AND x.id IS NOT NULL
    UNION
    SELECT sc.cliente_id FROM stadio_cli sc WHERE _cliente_ids IS NULL
  ),
  scad AS (
    SELECT s.cliente_id,
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN 0 ELSE s.importo_scadenza END) AS ssa,
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN s.importo_scadenza ELSE 0 END) AS ant
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE
      AND s.cliente_id IN (SELECT b.cliente_id FROM base b)
    GROUP BY s.cliente_id
  ),
  scad_clamp AS (SELECT scad.cliente_id, public.calcola_scaduto(ssa, ant) AS totale_scaduto FROM scad),
  calc AS (
    SELECT b.cliente_id,
      COALESCE(stc.stadio_sollecito, 0::smallint) AS stadio,
      stc.stadio_data,
      CASE WHEN stc.stadio_data IS NOT NULL THEN EXTRACT(DAY FROM (now() - stc.stadio_data))::int END AS stadio_giorni,
      p.gm,
      COALESCE(sc.totale_scaduto, 0) AS totale_scaduto,
      COALESCE(c.in_gestione_legale, false) AS in_gestione_legale
    FROM base b
    CROSS JOIN params p
    LEFT JOIN stadio_cli stc ON stc.cliente_id = b.cliente_id
    LEFT JOIN scad_clamp sc ON sc.cliente_id = b.cliente_id
    LEFT JOIN public.clienti c ON c.id = b.cliente_id
  )
  SELECT k.cliente_id,
    k.stadio,
    k.stadio_data,
    k.stadio_giorni,
    LEAST(k.stadio + 1, 3)::smallint AS livello_successivo,
    (k.stadio = 3) AS ripetizione_mora,
    k.gm AS giorni_minimi,
    (k.stadio_data IS NULL OR k.stadio_giorni >= k.gm) AS attesa_ok,
    CASE WHEN k.stadio_data IS NOT NULL THEN (k.stadio_data::date + k.gm) END AS data_prossimo_possibile,
    k.totale_scaduto,
    k.in_gestione_legale
  FROM calc k;
$function$;

COMMENT ON FUNCTION public.get_stadio_sollecito_clienti(uuid[]) IS
  'FONTE UNICA dello stadio di sollecito per cliente (FM51). Gemello TS: src/lib/escalation-solleciti.ts.';

REVOKE ALL ON FUNCTION public.get_stadio_sollecito_clienti(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stadio_sollecito_clienti(uuid[]) TO authenticated, service_role;

-- 3) get_recupero_clienti_aggregato: lo stadio ora viene dalla fonte unica. Verifica di identita' in transazione.
CREATE TEMP TABLE _fm51_check ON COMMIT DROP AS
SELECT count(*) AS n, md5(string_agg(r::text,'|' order by r::text)) AS h FROM public.get_recupero_clienti_aggregato() r;

CREATE OR REPLACE FUNCTION public.get_recupero_clienti_aggregato(_store_id uuid DEFAULT NULL::uuid, _operatore_id uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text, _data_da timestamp with time zone DEFAULT NULL::timestamp with time zone, _data_a timestamp with time zone DEFAULT NULL::timestamp with time zone, _esiti text[] DEFAULT NULL::text[], _tipi text[] DEFAULT NULL::text[], _stadi integer[] DEFAULT NULL::integer[], _cliente_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cliente_id uuid, ragione_sociale text, store_id uuid, store_nome text, totale_scaduto numeric, azioni_totali integer, azioni_aperte integer, prossima_tipo text, prossima_data timestamp with time zone, ultima_fatta_tipo text, ultima_fatta_data timestamp with time zone, ha_promessa boolean, data_promessa timestamp with time zone, in_ritardo boolean, stadio_sollecito smallint, stadio_data timestamp with time zone, stadio_giorni integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH az AS (
    SELECT a.id, a.cliente_id, a.tipo, a.esito, a.data_azione, a.data_promessa_pagamento
    FROM public.azioni_recupero a
    JOIN public.clienti c ON c.id = a.cliente_id
    WHERE a.tipo <> 'promemoria_scadenza'
      AND (_store_id IS NULL OR c.store_id = _store_id)
      AND (_operatore_id IS NULL OR a.operatore_id = _operatore_id)
      AND (_search IS NULL OR _search = '' OR c.ragione_sociale ILIKE '%' || _search || '%')
      AND (_data_da IS NULL OR a.data_azione >= _data_da)
      AND (_data_a IS NULL OR a.data_azione <= _data_a)
      AND (_esiti IS NULL OR a.esito::text = ANY(_esiti))
      AND (_tipi IS NULL OR a.tipo::text = ANY(_tipi))
      AND (_cliente_id IS NULL OR a.cliente_id = _cliente_id)
  ),
  scad AS (
    SELECT s.cliente_id,
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN 0 ELSE s.importo_scadenza END) AS ssa,
      SUM(CASE WHEN public.is_anticipo(s.numero_documento) THEN s.importo_scadenza ELSE 0 END) AS ant
    FROM public.scadenze s
    WHERE s.stato_contabile = 'Aperta' AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE
      AND (_cliente_id IS NULL OR s.cliente_id = _cliente_id)
    GROUP BY s.cliente_id
  ),
  scad_clamp AS (SELECT cliente_id, public.calcola_scaduto(ssa, ant) AS totale_scaduto FROM scad),
  per_cliente AS (
    SELECT az.cliente_id,
      COUNT(*)::int AS azioni_totali,
      COUNT(*) FILTER (WHERE az.esito = 'da_fare')::int AS azioni_aperte,
      bool_or(public.is_promessa_pagamento(az.tipo, az.esito)) AS ha_promessa,
      MAX(az.data_promessa_pagamento) FILTER (WHERE public.is_promessa_pagamento(az.tipo, az.esito)) AS data_promessa,
      bool_or(az.esito = 'da_fare' AND az.data_azione < now()) AS in_ritardo
    FROM az GROUP BY az.cliente_id
  ),
  prossima AS (
    SELECT DISTINCT ON (az.cliente_id) az.cliente_id, az.tipo::text AS tipo, az.data_azione
    FROM az WHERE az.esito='da_fare' ORDER BY az.cliente_id, az.data_azione ASC
  ),
  ultima AS (
    SELECT DISTINCT ON (az.cliente_id) az.cliente_id, az.tipo::text AS tipo, az.data_azione
    FROM az WHERE az.esito='fatto' ORDER BY az.cliente_id, az.data_azione DESC
  ),
  -- Stadio: fonte unica public.get_stadio_sollecito_clienti (FM51).
  stadio_cli AS (
    SELECT g.cliente_id, g.stadio AS stadio_sollecito, g.stadio_data, g.stadio_giorni
    FROM public.get_stadio_sollecito_clienti(CASE WHEN _cliente_id IS NULL THEN NULL::uuid[] ELSE ARRAY[_cliente_id] END) g
    WHERE g.stadio > 0
  )
  SELECT c.id, c.ragione_sociale, c.store_id, st.nome,
    COALESCE(sc.totale_scaduto,0),
    pc.azioni_totali, pc.azioni_aperte,
    p.tipo, p.data_azione, u.tipo, u.data_azione,
    pc.ha_promessa, pc.data_promessa, pc.in_ritardo,
    COALESCE(stc.stadio_sollecito, 0::smallint),
    stc.stadio_data,
    stc.stadio_giorni
  FROM per_cliente pc
  JOIN public.clienti c ON c.id = pc.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  LEFT JOIN scad_clamp sc ON sc.cliente_id = c.id
  LEFT JOIN prossima p ON p.cliente_id = c.id
  LEFT JOIN ultima u ON u.cliente_id = c.id
  LEFT JOIN stadio_cli stc ON stc.cliente_id = c.id
  WHERE (_stadi IS NULL OR COALESCE(stc.stadio_sollecito, 0::smallint)::int = ANY(_stadi));
$function$;

DO $chk$
DECLARE v_n0 bigint; v_h0 text; v_n1 bigint; v_h1 text; v_dist text;
BEGIN
  SELECT n, h INTO v_n0, v_h0 FROM _fm51_check;
  SELECT count(*), md5(string_agg(r::text,'|' order by r::text)) INTO v_n1, v_h1 FROM public.get_recupero_clienti_aggregato() r;
  IF v_n0 IS DISTINCT FROM v_n1 OR v_h0 IS DISTINCT FROM v_h1 THEN
    RAISE EXCEPTION 'FM51: get_recupero_clienti_aggregato cambia risultato (prima % / %, dopo % / %): migrazione annullata', v_n0, v_h0, v_n1, v_h1;
  END IF;
  SELECT string_agg(stadio || '=' || n, ', ' ORDER BY stadio) INTO v_dist
  FROM (SELECT stadio, count(*) n FROM public.get_stadio_sollecito_clienti() GROUP BY 1) d;
  EXECUTE format('COMMENT ON FUNCTION public.get_recupero_clienti_aggregato(uuid,uuid,text,timestamptz,timestamptz,text[],text[],integer[],uuid) IS %L',
    'Stadio da get_stadio_sollecito_clienti (FM51). Verifica migrazione 0082: prima ' || v_n0 || ' righe md5 ' || v_h0 ||
    ', dopo ' || v_n1 || ' righe md5 ' || v_h1 || '. Distribuzione stadi: ' || COALESCE(v_dist,'-'));
END
$chk$;

-- 4) Campagne progressive
ALTER TABLE public.campagne_sollecito DROP CONSTRAINT campagne_sollecito_tipo_campagna_check;
ALTER TABLE public.campagne_sollecito ADD CONSTRAINT campagne_sollecito_tipo_campagna_check
  CHECK (tipo_campagna = ANY (ARRAY['sollecito'::text, 'promemoria_scadenza'::text, 'sollecito_progressivo'::text]));

-- 5) Destinatari: livello, modello, motivo del salto e nuovi stati
ALTER TABLE public.campagne_sollecito_destinatari
  ADD COLUMN livello smallint NULL,
  ADD COLUMN template_id uuid NULL REFERENCES public.template_email(id),
  ADD COLUMN motivo_salto text NULL;
ALTER TABLE public.campagne_sollecito_destinatari DROP CONSTRAINT campagne_sollecito_destinatari_stato_check;
ALTER TABLE public.campagne_sollecito_destinatari ADD CONSTRAINT campagne_sollecito_destinatari_stato_check
  CHECK (stato = ANY (ARRAY['da_inviare'::text, 'inviato'::text, 'saltato_no_indirizzo'::text, 'fallito'::text, 'annullato'::text,
    'email_non_valida'::text, 'saltato_attesa'::text, 'saltato_no_scaduto'::text, 'saltato_in_legale'::text]));

-- 6) Ingressi agenzia: motivo
ALTER TABLE public.clienti_scaduto60_ingressi
  ADD COLUMN motivo text NOT NULL DEFAULT 'scaduto_60';
ALTER TABLE public.clienti_scaduto60_ingressi ADD CONSTRAINT clienti_scaduto60_ingressi_motivo_check
  CHECK (motivo IN ('scaduto_60', 'seconda_messa_in_mora'));

-- 7) Proposta di passaggio al legale per messa in mora ripetuta
CREATE OR REPLACE FUNCTION public.registra_proposta_legale_mora(_cliente_id uuid, _azione_sollecito_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_cli record;
  v_data_sol timestamptz;
  v_data_mora timestamptz;
  v_tot numeric;
  v_max_gg int;
  v_azione uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.auth_puo_inviare_recupero() THEN
    RAISE EXCEPTION 'Non hai i permessi per registrare la proposta di passaggio al legale';
  END IF;

  SELECT c.id, c.store_id, c.codice_gestionale, c.ragione_sociale INTO v_cli
  FROM public.clienti c WHERE c.id = _cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente non trovato';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clienti_scaduto60_ingressi i
    JOIN public.azioni_recupero a ON a.id = i.azione_id
    WHERE i.cliente_id = _cliente_id AND i.motivo = 'seconda_messa_in_mora' AND a.esito = 'da_fare'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT a.data_azione INTO v_data_sol
  FROM public.azioni_recupero a WHERE a.id = _azione_sollecito_id AND a.cliente_id = _cliente_id;
  IF v_data_sol IS NULL THEN
    RAISE EXCEPTION 'Sollecito non trovato per questo cliente';
  END IF;

  SELECT MAX(a.data_azione) INTO v_data_mora
  FROM public.azioni_recupero a
  WHERE a.cliente_id = _cliente_id AND a.tipo = 'email' AND a.livello_sollecito = 3
    AND a.id <> _azione_sollecito_id AND a.data_azione < v_data_sol;

  SELECT g.totale_scaduto INTO v_tot FROM public.get_stadio_sollecito_clienti(ARRAY[_cliente_id]) g;

  SELECT COALESCE(MAX(CURRENT_DATE - s.data_scadenza), 0)::int INTO v_max_gg
  FROM public.scadenze s
  WHERE s.cliente_id = _cliente_id AND s.stato_contabile = 'Aperta'
    AND s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE
    AND NOT public.is_anticipo(s.numero_documento);

  INSERT INTO public.azioni_recupero (cliente_id, operatore_id, tipo, esito, data_azione, importo_riferimento, note)
  VALUES (_cliente_id, NULL, 'promemoria', 'da_fare', now(), COALESCE(v_tot, 0),
    'Proposta passaggio al legale — messa in mora ripetuta: inviata il '
      || to_char((v_data_sol AT TIME ZONE 'Europe/Rome')::date, 'DD/MM/YYYY')
      || ' dopo la messa in mora del '
      || COALESCE(to_char((v_data_mora AT TIME ZONE 'Europe/Rome')::date, 'DD/MM/YYYY'), 'data non disponibile')
      || ' (rilevato automaticamente)')
  RETURNING id INTO v_azione;

  INSERT INTO public.clienti_scaduto60_ingressi
    (cliente_id, store_id, codice_gestionale, ragione_sociale, tot_scaduto, max_gg, azione_id, importazione_id, notificato_at, motivo)
  VALUES (_cliente_id, v_cli.store_id, v_cli.codice_gestionale, v_cli.ragione_sociale, COALESCE(v_tot, 0), v_max_gg, v_azione, NULL, NULL, 'seconda_messa_in_mora')
  RETURNING id INTO v_id;

  RETURN v_id;
END
$function$;

REVOKE ALL ON FUNCTION public.registra_proposta_legale_mora(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registra_proposta_legale_mora(uuid, uuid) TO authenticated, service_role;
