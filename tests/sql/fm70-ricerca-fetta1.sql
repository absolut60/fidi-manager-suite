-- Eseguire con authenticated autorizzato (MFA dove richiesto) o service_role.
-- Solo letture: nessun dato di prova persistente, nessuna modifica dei gate.
DO $test$
DECLARE
  _cod text; _descr text; _marca text; _n bigint; _p bigint;
  _first text; _second text; _sede uuid; _stock numeric;
BEGIN
  ASSERT public.normalizza_testo_ricerca('12,5')='12.5', 'Decimale 12,5';
  ASSERT public.normalizza_testo_ricerca('1200X2000')='1200x2000 120x200', 'Dimensioni: aggiunge, non sostituisce';
  ASSERT public.normalizza_testo_ricerca('  120 X 200   12,5  ')='120x200 12.5 12x20 1200x2000', 'Spazi, x e minuscole';
  ASSERT public.normalizza_testo_ricerca('120x200')='120x200 12x20 1200x2000', 'Varianti bidirezionali memorizzate';
  ASSERT public.normalizza_testo_ricerca('120x200',false)='120x200', 'Query senza varianti';
  ASSERT public.normalizza_testo_ricerca('90x100')='90x100 900x1000', 'Conversione centimetri';
  ASSERT public.normalizza_testo_ricerca('1201x2000 12.5x2000 120x200.5')='1201x2000 12.5x2000 120x200.5', 'Niente varianti non ammesse o decimali';
  ASSERT public.normalizza_testo_ricerca('1200x2000 1000x3000')='1200x2000 1000x3000 120x200 100x300', 'Tutte le coppie';
  ASSERT public.normalizza_testo_ricerca(NULL)='', 'NULL';
  ASSERT to_regprocedure('extensions.similarity(text,text)') IS NOT NULL, 'pg_trgm nello schema reale';
  -- La stessa misura deve trovare il testo originariamente espresso nell'altra unità.
  ASSERT EXISTS(SELECT 1 FROM public.cerca_articoli(testo=>'120x200',solo_gamma=>true,limite=>200) c
    JOIN public.articoli_gamma g ON g.codice=c.codice
    WHERE public.normalizza_testo_ricerca(g.descrizione,false) LIKE '%1200x2000%'
      AND public.normalizza_testo_ricerca(g.descrizione,false) NOT LIKE '%120x200%'), 'cm trova articolo in mm';
  ASSERT EXISTS(SELECT 1 FROM public.cerca_articoli(testo=>'1200x2000',solo_gamma=>true,limite=>200) c
    JOIN public.articoli_gamma g ON g.codice=c.codice
    WHERE public.normalizza_testo_ricerca(g.descrizione,false) LIKE '%120x200%'
      AND public.normalizza_testo_ricerca(g.descrizione,false) NOT LIKE '%1200x2000%'), 'mm trova articolo in cm';

  SELECT count(*) INTO _n FROM public.cerca_articoli(testo=>'lastra gyproc 13',solo_gamma=>true,limite=>200);
  ASSERT _n>0, 'Multi-parola trova lastra gyproc 13';
  SELECT count(*) INTO _p FROM public.cerca_articoli(testo=>'13 gyproc lastra',solo_gamma=>true,limite=>200);
  ASSERT _n=_p, 'Ordine sparso';
  SELECT g.codice,g.descrizione,m.descrizione INTO _cod,_descr,_marca
    FROM public.articoli_gamma g LEFT JOIN public.marche m ON m.codice=g.marca_codice
    WHERE g.attivo AND g.descrizione ILIKE '%lastra%' AND m.descrizione ILIKE '%gyproc%' LIMIT 1;
  ASSERT _cod IS NOT NULL, 'Campione reale presente';
  ASSERT EXISTS(SELECT 1 FROM public.cerca_articoli(testo=>_descr,solo_gamma=>true,limite=>200) WHERE codice=_cod), 'Frase intera ancora trovata';
  SELECT codice INTO _first FROM public.cerca_articoli(testo=>lower(_cod),_ordina=>'rilevanza',solo_gamma=>true,limite=>1);
  ASSERT _first=_cod, 'Tier 0: codice esatto';
  SELECT codice INTO _first FROM public.cerca_articoli(testo=>left(_cod,3),_ordina=>'rilevanza',solo_gamma=>true,limite=>1);
  ASSERT lower(_first) LIKE lower(left(_cod,3))||'%', 'Tier 1: prefisso codice';
  -- Tier 2: primo token prefisso, ma la frase intera non è prefisso del codice.
  SELECT codice INTO _first FROM public.cerca_articoli(testo=>_cod||' lastra',_ordina=>'rilevanza',solo_gamma=>true,limite=>1);
  ASSERT _first=_cod, 'Tier 2: prefisso primo token';
  SELECT codice,totale INTO _first,_n FROM public.cerca_articoli(testo=>'lastra gyproc 13',_ordina=>'rilevanza',solo_gamma=>true,limite=>1);
  SELECT codice,totale INTO _second,_p FROM public.cerca_articoli(testo=>'lastra gyproc 13',_ordina=>'rilevanza',solo_gamma=>true,limite=>1,"offset"=>1);
  ASSERT _first<>_second AND _n=_p AND _n>1, 'Paginazione e totale';
  ASSERT NOT EXISTS(SELECT 1 FROM public.cerca_articoli(testo=>'fm70_inesistente_%',solo_gamma=>true)), 'Percentuale e underscore letterali';

  SELECT s.store_id INTO _sede FROM public.giacenze_articoli_sede s WHERE s.articolo_codice=_cod AND NOT s.logistica LIMIT 1;
  IF _sede IS NOT NULL THEN
    SELECT coalesce(sum(s.giacenza),0) INTO _stock FROM public.giacenze_articoli_sede s WHERE s.articolo_codice=_cod AND s.store_id=_sede AND NOT s.logistica;
    ASSERT (SELECT giacenza_sede=_stock FROM public.cerca_articoli(testo=>_cod,_sede_giacenza=>_sede,solo_gamma=>true) WHERE codice=_cod), 'Giacenza della sola sede';
  END IF;
END;
$test$;