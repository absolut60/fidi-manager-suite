ALTER TABLE public.profili ADD COLUMN IF NOT EXISTS password_cambiata_il timestamptz NULL;
COMMENT ON COLUMN public.profili.password_cambiata_il IS 'FM44: istante dell''ultimo cambio password fatto dall''utente. NULL = da cambiare. Scadenza in configurazioni.scadenza_password_giorni; fonte unica passwordDaCambiare (src/lib/regole-password.ts).';
INSERT INTO public.configurazioni (chiave, valore, descrizione)
VALUES ('scadenza_password_giorni', '180', 'Giorni di validità della password prima del cambio obbligatorio (FM44)')
ON CONFLICT (chiave) DO NOTHING;