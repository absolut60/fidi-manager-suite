-- FM75 F2a: l'ordine generato conserva stampabile riga per riga. Eseguire come amministratore (BEGIN/ROLLBACK).
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_id FROM public.user_roles WHERE role='amministratore' LIMIT 1), 'role','authenticated','aal','aal2')::text, true);
CREATE TEMP TABLE t AS SELECT gen_random_uuid() p, gen_random_uuid() b, gen_random_uuid() r1, gen_random_uuid() r2;
INSERT INTO public.preventivi (id, tipo, data, titolo) SELECT p, 'preventivo', CURRENT_DATE, 'FM75 prova' FROM t;
INSERT INTO public.blocchi_preventivo (id, preventivo_id, descrizione, ordine) SELECT b, p, 'B', 0 FROM t;
INSERT INTO public.righe_preventivo (id, blocco_id, tipo_riga, descrizione, quantita, prezzo_unit, importo, ordine, stampabile)
  SELECT r1, b, 'manuale', 'visibile', 2, 10, 20, 1, true FROM t UNION ALL
  SELECT r2, b, 'manuale', 'nascosta', 3, 5, 15, 2, false FROM t;
SELECT r.descrizione, r.stampabile, (r.descrizione='visibile') = r.stampabile AS ok
FROM t, public.righe_preventivo r JOIN public.blocchi_preventivo bb ON bb.id = r.blocco_id
WHERE bb.preventivo_id = public.trasforma_preventivo_in_ordine(t.p, jsonb_build_array(jsonb_build_object('blocco_id', t.b,
  'righe', jsonb_build_array(jsonb_build_object('riga_id', t.r1, 'quantita', 2), jsonb_build_object('riga_id', t.r2, 'quantita', 3)))))
ORDER BY r.ordine;
ROLLBACK;
