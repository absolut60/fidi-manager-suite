-- FM54 fetta 8: le due funzioni nuove della migrazione 0093 hanno SET search_path = public.
-- Una funzione SQL con clausola SET non può essere incorporata (inlined) dal planner,
-- quindi viene chiamata riga per riga su ~99.000 scadenze: get_scadenziario_totali con
-- p_netto_coperture = true impiega 8,3 s e supera lo statement_timeout di 8 s del ruolo
-- authenticated (il filtro "Al netto di piani e promesse" non abbassa più i totali).
-- Togliendo la clausola SET le funzioni tornano incorporabili: netto 0,5 s, lordo 0,3 s,
-- risultati identici (verificato in transazione di prova annullata).
-- I corpi usano già nomi qualificati public., come categoria_scadenza che non ha search_path.
-- Corpo, firma, IMMUTABLE e permessi non cambiano.

ALTER FUNCTION public.scadenza_chiusa_anticipata(text, date, text, numeric) RESET search_path;

ALTER FUNCTION public.categoria_scadenza_riga(text, date, date, integer, date, text, numeric) RESET search_path;