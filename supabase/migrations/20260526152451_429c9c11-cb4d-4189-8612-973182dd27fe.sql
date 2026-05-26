INSERT INTO public.configurazioni (chiave, valore, descrizione)
VALUES (
  'cutoff_cliente_attivo_anno',
  '2025',
  'Anno di riferimento per considerare un cliente attivo. Un cliente è attivo se ha almeno una fattura con data >= 01/01/[anno].'
)
ON CONFLICT (chiave) DO NOTHING;