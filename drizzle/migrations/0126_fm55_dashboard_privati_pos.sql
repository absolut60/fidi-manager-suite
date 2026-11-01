-- FM55: card Dashboard Fidi "Privati (senza partita IVA)" e "POS / contanti con fido". Sola lettura.
-- Gemello SQL di isSedeCentraleFido (src/lib/fido-teorico.ts).
CREATE OR REPLACE FUNCTION public.cliente_sede_centrale_fido(_store_id uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT COALESCE(_store_id = 'b07c4c61-12e4-4a87-8e79-bbb9c181ffe9'::uuid, false); $$;
REVOKE EXECUTE ON FUNCTION public.cliente_sede_centrale_fido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_sede_centrale_fido(uuid) TO authenticated, service_role;

-- Stesso ambito negozio di get_dashboard_fidi (store_id_effettivo).
-- Privati = senza partita IVA (cliente_privato_fido(text)), Sede Centrale esclusa.
CREATE OR REPLACE FUNCTION public.get_dashboard_fidi_giro()
RETURNS TABLE(privati_con_fido_n bigint, privati_concesso_eur numeric, privati_proposto_eur numeric,
              privati_esposizione_eur numeric, pos_con_fido_n bigint, pos_concesso_eur numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH eff AS MATERIALIZED (SELECT public.store_id_effettivo(NULL) AS sid),
  cl AS MATERIALIZED (
    SELECT c.id, c.fido_gestionale, c.totale_rischio,
           public.cliente_privato_fido(c.partita_iva) AND NOT public.cliente_sede_centrale_fido(c.store_id) AS privato
    FROM public.clienti c CROSS JOIN eff
    WHERE eff.sid IS NULL OR c.store_id = eff.sid
  )
  SELECT
    COUNT(*) FILTER (WHERE cl.privato AND COALESCE(cl.fido_gestionale,0) > 0),
    COALESCE(SUM(cl.fido_gestionale) FILTER (WHERE cl.privato AND COALESCE(cl.fido_gestionale,0) > 0), 0),
    COALESCE(SUM(f.fido_proposto) FILTER (WHERE cl.privato), 0),
    COALESCE(SUM(GREATEST(COALESCE(cl.totale_rischio,0),0)) FILTER (WHERE cl.privato), 0),
    COUNT(*) FILTER (WHERE f.regola_applicata = 'pagamento_immediato' AND COALESCE(cl.fido_gestionale,0) > 0),
    COALESCE(SUM(cl.fido_gestionale) FILTER (WHERE f.regola_applicata = 'pagamento_immediato' AND COALESCE(cl.fido_gestionale,0) > 0), 0)
  FROM cl LEFT JOIN public.fido_teorico_cliente f ON f.cliente_id = cl.id
$$;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_fidi_giro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_fidi_giro() TO authenticated, service_role;

-- Id per i link "Vedi la lista": stessi criteri e stesso ambito della card.
CREATE OR REPLACE FUNCTION public.get_clienti_giro_fidi_ids(_tipo text)
RETURNS TABLE(cliente_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH eff AS MATERIALIZED (SELECT public.store_id_effettivo(NULL) AS sid)
  SELECT c.id
  FROM public.clienti c CROSS JOIN eff
  LEFT JOIN public.fido_teorico_cliente f ON f.cliente_id = c.id
  WHERE (eff.sid IS NULL OR c.store_id = eff.sid)
    AND COALESCE(c.fido_gestionale,0) > 0
    AND CASE _tipo
      WHEN 'privati_con_fido' THEN public.cliente_privato_fido(c.partita_iva) AND NOT public.cliente_sede_centrale_fido(c.store_id)
      WHEN 'pos_con_fido' THEN f.regola_applicata = 'pagamento_immediato'
      ELSE false END
$$;
REVOKE EXECUTE ON FUNCTION public.get_clienti_giro_fidi_ids(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clienti_giro_fidi_ids(text) TO authenticated, service_role;
