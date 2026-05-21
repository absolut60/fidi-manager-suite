
-- Enum ruoli
CREATE TYPE public.app_role AS ENUM ('store_manager', 'approvatore_liv1', 'approvatore_liv2', 'approvatore_liv3', 'amministratore');

-- Profili
CREATE TABLE public.profili (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  cognome TEXT,
  email TEXT,
  store_id UUID,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profili ENABLE ROW LEVEL SECURITY;

-- User roles (tabella separata per sicurezza)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Funzione has_role (security definer per evitare ricorsione RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Funzione helper: ottiene il ruolo "più alto" di un utente
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'amministratore' THEN 1
    WHEN 'approvatore_liv3' THEN 2
    WHEN 'approvatore_liv2' THEN 3
    WHEN 'approvatore_liv1' THEN 4
    WHEN 'store_manager' THEN 5
  END
  LIMIT 1
$$;

-- RLS Policies profili
CREATE POLICY "Utenti vedono il proprio profilo"
  ON public.profili FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'amministratore'));

CREATE POLICY "Utenti aggiornano il proprio profilo"
  ON public.profili FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'amministratore'));

CREATE POLICY "Admin inserisce profili"
  ON public.profili FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'amministratore'));

-- RLS Policies user_roles
CREATE POLICY "Utenti vedono i propri ruoli"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'amministratore'));

CREATE POLICY "Solo admin gestisce ruoli"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'amministratore'))
  WITH CHECK (public.has_role(auth.uid(), 'amministratore'));

-- Trigger: crea profilo + assegna ruolo automaticamente al signup
-- Il primo utente diventa amministratore, gli altri store_manager di default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  utenti_esistenti INT;
  ruolo_assegnato public.app_role;
BEGIN
  -- Conta utenti esistenti (escluso quello appena creato)
  SELECT COUNT(*) INTO utenti_esistenti FROM public.profili;
  
  -- Crea profilo
  INSERT INTO public.profili (id, email, nome, cognome)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    COALESCE(NEW.raw_user_meta_data->>'cognome', '')
  );
  
  -- Assegna ruolo: primo utente = admin, altri = store_manager
  IF utenti_esistenti = 0 THEN
    ruolo_assegnato := 'amministratore';
  ELSE
    ruolo_assegnato := 'store_manager';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, ruolo_assegnato);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profili_updated_at
  BEFORE UPDATE ON public.profili
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
