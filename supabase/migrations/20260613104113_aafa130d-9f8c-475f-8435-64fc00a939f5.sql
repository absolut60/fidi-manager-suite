ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS insegna text;

UPDATE public.stores SET insegna = 'GARAVAGLIA | MADE' WHERE codice = '1';
UPDATE public.stores SET insegna = 'CMV | MADE'         WHERE codice = '2';
UPDATE public.stores SET insegna = 'MADE CAMBIAGO'      WHERE codice = '3';
UPDATE public.stores SET insegna = 'COSSO | MADE'       WHERE codice = '4';
UPDATE public.stores SET insegna = 'GINI | MADE'        WHERE codice = '5';
UPDATE public.stores SET insegna = 'FATIGA | MADE'      WHERE codice = '6';
UPDATE public.stores SET insegna = 'COMED | MADE'       WHERE codice = '7';
UPDATE public.stores SET insegna = 'SISTEMA MADE'       WHERE codice = '8';
UPDATE public.stores SET insegna = 'SAVI-EDIL | MADE'   WHERE codice = '9';