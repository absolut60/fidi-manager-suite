-- FM47: CTE eff (store_id_effettivo) materializzata in 12 funzioni.
-- Trasformazione unica e deterministica: 'WITH eff AS (' -> 'WITH eff AS MATERIALIZED ('.
-- Corpo, firma, SECURITY DEFINER, search_path e permessi restano identici (CREATE OR REPLACE).
-- Guardie: ogni funzione deve esistere una sola volta e contenere la forma attesa una sola volta, altrimenti errore e nessuna modifica.
DO $mig$
DECLARE
  v_nome text;
  v_oid oid;
  v_n int;
  v_def text;
  v_occ int;
BEGIN
  FOREACH v_nome IN ARRAY ARRAY[
    'count_fidi_quasi_saturi','get_clienti_fermi_ids','get_cruscotto_incassi_mensile',
    'get_cruscotto_incassi_mese_dettaglio','get_cruscotto_incassi_mese_scadenze',
    'get_dso_aggregato','get_dso_serie_mensile','get_fatturato_clienti_scadenziario',
    'get_incassi_periodo','get_incassi_periodo_dettaglio','get_promemoria_scadenze_dettaglio',
    'get_scaduto_dashboard'
  ] LOOP
    SELECT count(*), min(p.oid) INTO v_n, v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FM47: % trovata % volte (attesa 1)', v_nome, v_n;
    END IF;
    v_def := pg_get_functiondef(v_oid);
    v_occ := (length(v_def) - length(replace(v_def, 'WITH eff AS (', ''))) / length('WITH eff AS (');
    IF v_occ <> 1 THEN
      RAISE EXCEPTION 'FM47: % contiene % occorrenze di "WITH eff AS (" (attesa 1)', v_nome, v_occ;
    END IF;
    EXECUTE replace(v_def, 'WITH eff AS (', 'WITH eff AS MATERIALIZED (');
  END LOOP;
END
$mig$;