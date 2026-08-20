DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='fascia_listino') THEN
    CREATE TYPE public.fascia_listino AS ENUM ('A','B','C','SOCI');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='stato_articolo') THEN
    CREATE TYPE public.stato_articolo AS ENUM ('attivo','potenziale');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='kit_famiglia') THEN
    CREATE TYPE public.kit_famiglia AS ENUM ('PARETE','CONTROPARETE','CTS_CARTONGESSO','CTS_MODULARE','VELETTA','ALTRO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_driver') THEN
    CREATE TYPE public.tipo_driver AS ENUM ('CONSUMO','PASSO','LATI','INCIDENZA_FISSA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_documento') THEN
    CREATE TYPE public.tipo_documento AS ENUM ('preventivo','ordine');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='stato_preventivo') THEN
    CREATE TYPE public.stato_preventivo AS ENUM ('bozza','inviato','confermato');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_doc_preventivo') THEN
    CREATE TYPE public.tipo_doc_preventivo AS ENUM ('PREVENTIVO','PROPOSTA_RAPIDA','LISTA_MATERIALI','LISTA_MAT_FORNITORE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_riga_preventivo') THEN
    CREATE TYPE public.tipo_riga_preventivo AS ENUM ('da_kit','articolo_singolo','manuale','sotto_totale','nota','separatore');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='categoria_allegato') THEN
    CREATE TYPE public.categoria_allegato AS ENUM ('capitolato','disegni','scheda_tecnica','certificazioni','foto_cantiere','documenti_commerciali','altro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='categoria_allegato_articolo') THEN
    CREATE TYPE public.categoria_allegato_articolo AS ENUM ('scheda_tecnica','scheda_sicurezza','certificazione_ce_dop','certificazione_antincendio','certificazione_acustica','dichiarazione_conformita','voce_capitolato','manuale_posa','certificato_ambientale','immagine_prodotto','disegno_tecnico','altro');
  END IF;
END$$;

ALTER TABLE public.fornitori
  ADD COLUMN IF NOT EXISTS categoria_fornitore text NOT NULL DEFAULT 'servizi',
  ADD COLUMN IF NOT EXISTS ragione_sociale text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.fornitori SET ragione_sociale = nome WHERE ragione_sociale IS NULL;
UPDATE public.fornitori SET categoria_fornitore = 'servizi' WHERE categoria_fornitore IS NULL OR categoria_fornitore = '';

DROP TRIGGER IF EXISTS trg_fornitori_updated_at ON public.fornitori;
CREATE TRIGGER trg_fornitori_updated_at
  BEFORE UPDATE ON public.fornitori
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS fascia_listino_default public.fascia_listino;