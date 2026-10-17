-- FM45 fetta 2b: l'agente vede le variazioni blocco dei propri clienti (stessa forma di scadenze, 0039).
ALTER POLICY "Lettura variazioni blocco per accesso cliente"
  ON public.clienti_blocco_variazioni
  USING ((SELECT public.auth_ha_ruolo_globale_clienti()) OR cliente_id IN (SELECT public.clienti_ambito_utente_ids()));