CREATE OR REPLACE FUNCTION public.normalizza_numero_it(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH cifre AS (SELECT regexp_replace(coalesce(_raw,''), '[^0-9]', '', 'g') AS d),
  norm AS (
    SELECT CASE
      WHEN length(d) = 12 AND left(d,2) = '39' THEN right(d,10)
      WHEN length(d) = 10 THEN d
      WHEN length(d) > 12 AND right(d,10) ~ '^3[0-9]{9}$' THEN right(d,10)
      ELSE NULL END AS n
    FROM cifre
  )
  SELECT CASE WHEN n ~ '^3[0-9]{9}$' THEN n ELSE NULL END FROM norm;
$$;