
-- ============================================================================
-- Rete di sicurezza DB: normalizza email/pec/telefono su clienti
-- FONTE DI VERITÀ della validazione: src/lib/email-validazione.ts
-- Queste funzioni SQL sono una COPIA della logica TS, da tenere allineata.
-- Se modifichi le regole nel file TS, aggiorna anche queste funzioni.
-- ============================================================================

-- Email: regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/ + nessun separatore multipli
CREATE OR REPLACE FUNCTION public.fn_email_valida(_raw text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE v text;
BEGIN
  IF _raw IS NULL THEN RETURN false; END IF;
  v := btrim(_raw);
  IF v = '' THEN RETURN false; END IF;
  -- separatori multipli
  IF v ~ '[;,]' THEN RETURN false; END IF;
  -- più di un @
  IF (length(v) - length(replace(v, '@', ''))) <> 1 THEN RETURN false; END IF;
  -- pattern base senza spazi
  RETURN v ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
END;
$$;

-- Telefono: regola di src/lib/email-validazione.ts (classificaTelefono / isTelefonoValido)
CREATE OR REPLACE FUNCTION public.fn_telefono_valido(_raw text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
  digits text;
  senza_sep_base text;
BEGIN
  IF _raw IS NULL THEN RETURN false; END IF;
  v := btrim(_raw);
  IF v = '' THEN RETURN false; END IF;

  digits := regexp_replace(v, '[^0-9]', '', 'g');
  IF length(digits) = 0 THEN RETURN false; END IF;        -- solo testo
  IF length(digits) < 4 THEN RETURN false; END IF;        -- troppo corto

  -- "numerico puro" = solo cifre + separatori neutri (spazi, -, (, ), .),
  -- senza '/', '+' o lettere (segnali di formato telefonico)
  senza_sep_base := regexp_replace(v, '[[:space:]\-().]', '', 'g');
  IF senza_sep_base ~ '^[0-9]+$' AND length(digits) <= 6 THEN
    RETURN false;                                         -- ID/seriale data Excel
  END IF;

  RETURN true;
END;
$$;

-- ============================================================================
-- Trigger function: BEFORE INSERT OR UPDATE su clienti
-- Strategia anti-doppione: logga SOLO il valore che il trigger sta azzerando
-- (NEW.campo era non-NULL e diventa NULL qui). Se la barriera applicativa
-- ha già messo NULL a monte, NEW.campo è già NULL → nessun log dal trigger.
-- Per le email multiple: il trigger si limita ad azzerare (lo split intelligente
-- è nella barriera applyEmailPec dell'import). Scelta: robustezza/semplicità.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_normalizza_contatti()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _anomalie jsonb[] := ARRAY[]::jsonb[];
  _a jsonb;
BEGIN
  -- EMAIL
  IF NEW.email IS NOT NULL AND NOT public.fn_email_valida(NEW.email) THEN
    _anomalie := _anomalie || jsonb_build_object('campo','email','val',NEW.email);
    NEW.email := NULL;
  END IF;

  -- PEC
  IF NEW.pec IS NOT NULL AND NOT public.fn_email_valida(NEW.pec) THEN
    _anomalie := _anomalie || jsonb_build_object('campo','pec','val',NEW.pec);
    NEW.pec := NULL;
  END IF;

  -- TELEFONO
  IF NEW.telefono IS NOT NULL AND NOT public.fn_telefono_valido(NEW.telefono) THEN
    _anomalie := _anomalie || jsonb_build_object('campo','telefono','val',NEW.telefono);
    NEW.telefono := NULL;
  END IF;

  -- CELLULARE
  IF NEW.cellulare IS NOT NULL AND NOT public.fn_telefono_valido(NEW.cellulare) THEN
    _anomalie := _anomalie || jsonb_build_object('campo','cellulare','val',NEW.cellulare);
    NEW.cellulare := NULL;
  END IF;

  -- TELEFONO_2
  IF NEW.telefono_2 IS NOT NULL AND NOT public.fn_telefono_valido(NEW.telefono_2) THEN
    _anomalie := _anomalie || jsonb_build_object('campo','telefono_2','val',NEW.telefono_2);
    NEW.telefono_2 := NULL;
  END IF;

  -- Log anomalie (solo per quelle effettivamente azzerate dal trigger)
  IF array_length(_anomalie, 1) > 0 THEN
    FOREACH _a IN ARRAY _anomalie LOOP
      INSERT INTO public.anomalie_import (
        importazione_id, cliente_id, codice_gestionale, ragione_sociale,
        tipo_anomalia, campo, valore_attuale, valore_nuovo, stato, created_at
      ) VALUES (
        NULL,
        NEW.id,
        NEW.codice_gestionale,
        NEW.ragione_sociale,
        CASE WHEN (_a->>'campo') IN ('email','pec') THEN 'email_non_valida'
             ELSE 'telefono_non_valido' END,
        _a->>'campo',
        _a->>'val',
        'azzerato_da_trigger',
        'risolta',
        now()
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop & ricrea trigger (idempotente)
DROP TRIGGER IF EXISTS trg_normalizza_contatti ON public.clienti;
CREATE TRIGGER trg_normalizza_contatti
BEFORE INSERT OR UPDATE OF email, pec, telefono, cellulare, telefono_2
ON public.clienti
FOR EACH ROW
EXECUTE FUNCTION public.fn_normalizza_contatti();
