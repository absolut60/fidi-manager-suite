-- FM55 fetta 3, Andrea 01/11/2026. Solo struttura: nessun ricalcolo, refresh o notifiche.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.ricalcola_fido_teorico_blocco(uuid,integer)'::regprocedure)) <> 'a29039150fe05ddacbb105637da8da4a' THEN RAISE EXCEPTION 'MD5 inatteso: public.ricalcola_fido_teorico_blocco(uuid,integer)'; END IF;
  IF md5(pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure)) <> 'fc1a7eb6fe250b8cdacb66655baa8cb1' THEN RAISE EXCEPTION 'MD5 inatteso: public.get_fido_teorico_v2(uuid[])'; END IF;
  IF md5(pg_get_functiondef('public.aggiorna_alert_fidi()'::regprocedure)) <> '6a0da790259bacb7596b0aee06879385' THEN RAISE EXCEPTION 'MD5 inatteso: public.aggiorna_alert_fidi()'; END IF;
  IF md5(pg_get_functiondef('public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure)) <> '0e5c8fe98afddb170d98c504ab810f24' THEN RAISE EXCEPTION 'MD5 inatteso: public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)'; END IF;
  IF md5(pg_get_functiondef('public.cliente_privato_fido(public.clienti)'::regprocedure)) <> 'd2bf22fa77683da187b367861f629a03' THEN RAISE EXCEPTION 'MD5 inatteso: public.cliente_privato_fido(public.clienti)'; END IF;
END
$guard$;
ALTER TABLE public.fido_teorico_cliente ADD COLUMN esposizione_picco_30gg numeric NULL;
CREATE OR REPLACE FUNCTION public.esposizione_picco_cliente(_ids uuid[], _giorni int DEFAULT 30)
RETURNS TABLE(cliente_id uuid, aperto_oggi numeric, aperto_picco numeric, giorno_picco date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- Eccezione Gamma documentata in fonti-uniche: conta la data, NON importo_pagato.
  -- Eventi aggregati per cliente/giorno; nessun prodotto giorni x scadenze.
  WITH lim AS (SELECT CURRENT_DATE - (GREATEST(COALESCE(_giorni,30),1)-1) AS dal),
  ids AS MATERIALIZED (
    SELECT DISTINCT c.id FROM public.clienti c
    WHERE c.id=ANY(_ids)
      AND (auth.uid() IS NULL OR public.user_can_access_cliente(c.id,c.store_id,c.codice_agente))
  ), righe AS MATERIALIZED (
    SELECT s.cliente_id, s.data_documento, s.data_pagamento_effettiva, s.importo_scadenza
    FROM public.scadenze s JOIN ids i ON i.id=s.cliente_id CROSS JOIN lim
    WHERE s.data_documento <= CURRENT_DATE AND NOT public.is_anticipo(s.numero_documento)
      AND (s.data_pagamento_effettiva IS NULL OR s.data_pagamento_effettiva > lim.dal)
      AND (s.data_pagamento_effettiva IS NULL OR s.data_pagamento_effettiva > s.data_documento)
  ), eventi AS (
    SELECT r.cliente_id,GREATEST(r.data_documento,lim.dal) AS giorno,r.importo_scadenza AS delta FROM righe r CROSS JOIN lim
    UNION ALL
    SELECT r.cliente_id,r.data_pagamento_effettiva,-r.importo_scadenza FROM righe r WHERE r.data_pagamento_effettiva<=CURRENT_DATE
    UNION ALL SELECT i.id,lim.dal,0::numeric FROM ids i CROSS JOIN lim
    UNION ALL SELECT i.id,CURRENT_DATE,0::numeric FROM ids i
  ), per_giorno AS (
    SELECT e.cliente_id,e.giorno,sum(COALESCE(e.delta,0)) delta FROM eventi e GROUP BY e.cliente_id,e.giorno
  ), cumulata AS (
    SELECT p.cliente_id,p.giorno,sum(p.delta) OVER(PARTITION BY p.cliente_id ORDER BY p.giorno ROWS UNBOUNDED PRECEDING) aperto FROM per_giorno p
  ), picchi AS (
    SELECT DISTINCT ON (c.cliente_id) c.cliente_id,c.aperto,c.giorno FROM cumulata c ORDER BY c.cliente_id,c.aperto DESC,c.giorno
  )
  SELECT p.cliente_id,o.aperto,p.aperto,p.giorno FROM picchi p JOIN cumulata o ON o.cliente_id=p.cliente_id AND o.giorno=CURRENT_DATE
$function$;
REVOKE EXECUTE ON FUNCTION public.esposizione_picco_cliente(uuid[],integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esposizione_picco_cliente(uuid[],integer) TO authenticated, service_role;

DO $migration$
DECLARE d text := pg_get_functiondef('public.get_fido_teorico_v2(uuid[])'::regprocedure);
BEGIN
  IF md5(d) <> 'fc1a7eb6fe250b8cdacb66655baa8cb1' THEN RAISE EXCEPTION 'MD5 inatteso: public.get_fido_teorico_v2(uuid[])'; END IF;
  d := replace(d, $old$      public.store_id_effettivo(NULL) AS sid,
      date_trunc('month', CURRENT_DATE)::date AS m0,
$old$, $new$      public.store_id_effettivo(NULL) AS sid,
      COALESCE(NULLIF(trim(replace((SELECT valore FROM public.configurazioni WHERE chiave='fido_v2_margine_soglia'), ',', '.')), '')::numeric, 0.80) AS ms_picco,
      date_trunc('month', CURRENT_DATE)::date AS m0,
$new$);
  d := replace(d, $old$  ),
  fm AS MATERIALIZED (
$old$, $new$  ),
  picco AS MATERIALIZED (
    SELECT * FROM public.esposizione_picco_cliente(ARRAY(SELECT id FROM cli), 30)
  ),
  fm AS MATERIALIZED (
$new$);
  d := replace(d, $old$    SELECT c.*, cfg.*,
      st.storico, t.tendenza, COALESCE(st.fatt12, 0) AS fatt12,
$old$, $new$    SELECT c.*, cfg.*,
      GREATEST(c.esp, c.esp + COALESCE(pc.aperto_picco - pc.aperto_oggi, 0)) AS esp_picco,
      st.storico, t.tendenza, COALESCE(st.fatt12, 0) AS fatt12,
$new$);
  d := replace(d, $old$    FROM cli c CROSS JOIN cfg
    LEFT JOIN stor st ON st.cliente_id = c.id
$old$, $new$    FROM cli c CROSS JOIN cfg
    LEFT JOIN picco pc ON pc.cliente_id = c.id
    LEFT JOIN stor st ON st.cliente_id = c.id
$new$);
  d := replace(d, $old$      CASE
        WHEN b.store_id = '3c57ae39-1f3a-4085-96ef-2f2d2c4c8221'::uuid AND b.escludi_sede THEN 'sede_esclusa'
$old$, $new$      CASE
        WHEN b.store_id = 'b07c4c61-12e4-4a87-8e79-bbb9c181ffe9'::uuid THEN 'sede_esclusa'
        WHEN b.store_id = '3c57ae39-1f3a-4085-96ef-2f2d2c4c8221'::uuid AND b.escludi_sede THEN 'sede_esclusa'
$new$);
  d := replace(d, $old$  ),
  b5 AS (
    SELECT b4.*,
$old$, $new$  ),
  b5_originale AS (
    SELECT b4.*,
$new$);
  d := replace(d, $old$    LEFT JOIN LATERAL public.fido_v2_margine_tetto(b4.base_v, b4.esp, b4.ord, round(b4.acq, 2), b4.sc_oltre) mt ON true
  )
$old$, $new$    LEFT JOIN LATERAL public.fido_v2_margine_tetto(b4.base_v, b4.esp, b4.ord, round(b4.acq, 2), b4.sc_oltre) mt ON true
  ),
  freno AS (
    SELECT b5_originale.*,
      CASE WHEN con_mt AND fp < fa THEN
        LEAST(fa, GREATEST(fp, public.arrotonda_fido_v2(esp_picco / NULLIF(ms_picco, 0))))
        ELSE fp END AS fp_frenato
    FROM b5_originale
  )
$new$);
  d := replace(d, $old$    r.ciclo, round(r.mesi_st, 3), r.prof, r.coef,
    r.base_v, r.esp, r.ord, r.fabb, r.fp, r.fa,
    CASE WHEN r.fa > 0 THEN round((r.esp + r.ord) / r.fa, 4) END,
$old$, $new$    r.ciclo, round(r.mesi_st, 3), r.prof, r.coef,
    r.base_v, r.esp, r.ord, r.fabb, r.fp_frenato, r.fa,
    CASE WHEN r.fa > 0 THEN round((r.esp + r.ord) / r.fa, 4) END,
$new$);
  d := replace(d, $old$               || r.m_dorm::int || ' mesi fa: nessun fido. Se torna serve una nuova richiesta fido; intanto pagamento in contanti.'
               || CASE WHEN r.fp > 0 THEN ' ' || public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, false) || ': il fido copre quanto ci deve.' ELSE '' END
          WHEN 'mai_acquistato' THEN 'Nessun acquisto registrato: nessun fido.'
$old$, $new$               || r.m_dorm::int || ' mesi fa: nessun fido. Se torna serve una nuova richiesta fido; intanto pagamento in contanti.'
               || CASE WHEN r.fp_frenato > 0 THEN ' ' || public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, false) || ': il fido copre quanto ci deve.' ELSE '' END
          WHEN 'mai_acquistato' THEN 'Nessun acquisto registrato: nessun fido.'
$new$);
  d := replace(d, $old$               || translate(rtrim(to_char(r.base_v, 'FM999,999,990.99'), '.'), ',.', '.,') || ' €. Da verificare.'
               || CASE WHEN r.fp > r.base_v THEN ' ' || public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, false) || ': il fido copre quanto ci deve.' ELSE '' END
          ELSE (
$old$, $new$               || translate(rtrim(to_char(r.base_v, 'FM999,999,990.99'), '.'), ',.', '.,') || ' €. Da verificare.'
               || CASE WHEN r.fp_frenato > r.base_v THEN ' ' || public.testo_impegni_fido(r.esp, r.ord, r.scaduto, r.ddt, false) || ': il fido copre quanto ci deve.' ELSE '' END
          ELSE (
$new$);
  d := replace(d, $old$            || '.'
            || ' Per lavorare tranquillo gli servono ' || replace(to_char(r.fp, 'FM999,999,999'), ',', '.') || ' €'
            || CASE WHEN r.con_mt THEN ' (lasciamo un margine del 20%).' ELSE '.' END
$old$, $new$            || '.'
            || ' Per lavorare tranquillo gli servono ' || replace(to_char(r.fp_frenato, 'FM999,999,999'), ',', '.') || ' €'
            || CASE WHEN r.con_mt THEN ' (lasciamo un margine del 20%).' ELSE '.' END
$new$);
  d := replace(d, $old$    || CASE WHEN r.ord > 0 THEN ' Ha anche ordini clienti aperti per ' || replace(to_char(round(r.ord), 'FM999,999,999'), ',', '.') || ' €'
         || CASE WHEN r.esp + r.ord > r.fp THEN ', che se consegnati supererebbero il fido' ELSE '' END || '.' ELSE '' END
    || CASE WHEN r.fp > public.arrotonda_fido_v2(r.base_v * COALESCE((SELECT NULLIF(trim(replace(valore, ',', '.')), '')::numeric FROM public.configurazioni WHERE chiave='fido_v2_tetto_base'), 1.5))
         THEN ' Sta comprando molto più del solito (oltre una volta e mezza il fido giusto): va autorizzato.' ELSE '' END
  FROM b5 r;
$function$
$old$, $new$    || CASE WHEN r.ord > 0 THEN ' Ha anche ordini clienti aperti per ' || replace(to_char(round(r.ord), 'FM999,999,999'), ',', '.') || ' €'
         || CASE WHEN r.esp + r.ord > r.fp_frenato THEN ', che se consegnati supererebbero il fido' ELSE '' END || '.' ELSE '' END
    || CASE WHEN r.fp_frenato > r.fa AND r.fp_frenato > public.arrotonda_fido_v2(r.base_v * COALESCE((SELECT NULLIF(trim(replace(valore, ',', '.')), '')::numeric FROM public.configurazioni WHERE chiave='fido_v2_tetto_base'), 1.5))
         THEN ' Sta comprando molto più del solito (oltre una volta e mezza il fido giusto): va autorizzato.' ELSE '' END
    || CASE WHEN r.fp_frenato > r.fp THEN ' Negli ultimi 30 giorni è arrivato a doverci '
         || replace(to_char(round(r.esp_picco), 'FM999,999,999'), ',', '.')
         || ' €: per non bloccarlo il fido non scende sotto '
         || replace(to_char(r.fp_frenato, 'FM999,999,999'), ',', '.') || ' €.' ELSE '' END
  FROM freno r;
$function$
$new$);
  IF md5(d) <> '248ecf914f845cb16fea74109980f22e' THEN RAISE EXCEPTION 'Replace incompleto: public.get_fido_teorico_v2(uuid[])'; END IF;
  EXECUTE d; -- solo CREATE OR REPLACE
END
$migration$;
REVOKE EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fido_teorico_v2(uuid[]) TO authenticated, service_role;

DO $migration$
DECLARE d text := pg_get_functiondef('public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure);
BEGIN
  IF md5(d) <> '0e5c8fe98afddb170d98c504ab810f24' THEN RAISE EXCEPTION 'MD5 inatteso: public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)'; END IF;
  d := replace(d, $old$    CASE WHEN COALESCE(_regola,'') NOT IN ('scaduto_non_incassato','cliente_bloccato','gestione_legale') AND v.so > cfg.sc_imp THEN 'scaduto_da_incassare' END,
    CASE WHEN v.fp > public.arrotonda_fido_v2(v.b * cfg.tb) THEN 'oltre_normale' END,
    CASE WHEN v.fab + v.ord > v.fp THEN 'ordini_oltre_fido' END,
$old$, $new$    CASE WHEN COALESCE(_regola,'') NOT IN ('scaduto_non_incassato','cliente_bloccato','gestione_legale') AND v.so > cfg.sc_imp THEN 'scaduto_da_incassare' END,
    CASE WHEN v.fp > public.arrotonda_fido_v2(v.b * cfg.tb) AND v.fp > v.fg THEN 'oltre_normale' END,
    CASE WHEN v.fab + v.ord > v.fp THEN 'ordini_oltre_fido' END,
$new$);
  IF md5(d) <> '811dfd379d75ff5cf56f33dd5553fedc' THEN RAISE EXCEPTION 'Replace incompleto: public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)'; END IF;
  EXECUTE d; -- solo CREATE OR REPLACE
END
$migration$;
REVOKE EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.segnalazioni_fido(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) TO authenticated, service_role;

DO $migration$
DECLARE d text := pg_get_functiondef('public.ricalcola_fido_teorico_blocco(uuid,integer)'::regprocedure);
BEGIN
  IF md5(d) <> 'a29039150fe05ddacbb105637da8da4a' THEN RAISE EXCEPTION 'MD5 inatteso: public.ricalcola_fido_teorico_blocco(uuid,integer)'; END IF;
  d := replace(d, $old$ WHERE f.cliente_id=f2.cliente_id AND f.cliente_id=ANY(v_ids);
 -- FM55: segnalazioni (fonte unica segnalazioni_fido) sulle colonne appena pubblicate.
$old$, $new$ WHERE f.cliente_id=f2.cliente_id AND f.cliente_id=ANY(v_ids);
 -- FM55: picco ricostruito solo come differenza sull'esposizione Gamma di oggi.
 UPDATE public.fido_teorico_cliente f SET
 esposizione_picco_30gg=GREATEST(f.esposizione_corrente, f.esposizione_corrente + p.aperto_picco - p.aperto_oggi)
 FROM public.esposizione_picco_cliente(v_ids,30) p
 WHERE f.cliente_id=p.cliente_id;
 -- FM55: segnalazioni (fonte unica segnalazioni_fido) sulle colonne appena pubblicate.
$new$);
  IF md5(d) <> '4c3594704f4dc1e49e0d8383b66bd25b' THEN RAISE EXCEPTION 'Replace incompleto: public.ricalcola_fido_teorico_blocco(uuid,integer)'; END IF;
  EXECUTE d; -- solo CREATE OR REPLACE
END
$migration$;
REVOKE EXECUTE ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid,integer) TO authenticated, service_role;

DO $migration$
DECLARE d text := pg_get_functiondef('public.cliente_privato_fido(public.clienti)'::regprocedure);
BEGIN
  IF md5(d) <> 'd2bf22fa77683da187b367861f629a03' THEN RAISE EXCEPTION 'MD5 inatteso: public.cliente_privato_fido(public.clienti)'; END IF;
  d := replace(d, $old$AS $function$
  SELECT public.cliente_privato_fido($1.partita_iva);
$function$
$old$, $new$AS $function$
  SELECT public.cliente_privato_fido($1.partita_iva)
    OR COALESCE($1.store_id = 'b07c4c61-12e4-4a87-8e79-bbb9c181ffe9'::uuid, false); -- perimetro giro fidi, non classificazione fiscale
$function$
$new$);
  IF md5(d) <> 'cb504131fba148c6c5e4bf1465e18492' THEN RAISE EXCEPTION 'Replace incompleto: public.cliente_privato_fido(public.clienti)'; END IF;
  EXECUTE d; -- solo CREATE OR REPLACE
END
$migration$;
REVOKE EXECUTE ON FUNCTION public.cliente_privato_fido(public.clienti) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_privato_fido(public.clienti) TO authenticated, service_role;

DO $migration$
DECLARE d text := pg_get_functiondef('public.aggiorna_alert_fidi()'::regprocedure);
BEGIN
  IF md5(d) <> '6a0da790259bacb7596b0aee06879385' THEN RAISE EXCEPTION 'MD5 inatteso: public.aggiorna_alert_fidi()'; END IF;
  d := replace(d, $old$  WHERE v.regola IN ('calcolo', 'scaduto_non_incassato')
    AND NOT public.cliente_privato_fido(c.partita_iva);
  CREATE INDEX ON _af_dati (cliente_id);
$old$, $new$  WHERE v.regola IN ('calcolo', 'scaduto_non_incassato')
    AND NOT public.cliente_privato_fido(c);
  CREATE INDEX ON _af_dati (cliente_id);
$new$);
  IF md5(d) <> 'e038ef1707f4243265f94a1bff5b8e62' THEN RAISE EXCEPTION 'Replace incompleto: public.aggiorna_alert_fidi()'; END IF;
  EXECUTE d; -- solo CREATE OR REPLACE
END
$migration$;
REVOKE EXECUTE ON FUNCTION public.aggiorna_alert_fidi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aggiorna_alert_fidi() TO authenticated, service_role;
