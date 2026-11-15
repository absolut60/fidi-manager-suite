// Fonte unica (FM56, FM72 ④b): cosa vedono e possono fare "showroom" e "responsabile_showroom".
// Gemello SQL di isSoloShowroom: public.auth_solo_showroom() (aggiornata nella 0231). Se cambia uno, cambia l'altro.
// Il database applica il perimetro (showroom della sede, responsabile su tutte le sedi) e le scritture; questa regola decide solo lo schermo
// (nasconde i pulsanti che il database rifiuterebbe). Documentata in docs/regole/sicurezza-permessi.md.

/** Ruoli che, insieme a uno dei ruoli showroom, tolgono le restrizioni (come auth_solo_showroom()). */
export const RUOLI_SUPERANO_SHOWROOM = [
  "store_manager",
  "amministratore",
  "amministrazione",
  "direzione",
  "recupero_crediti",
] as const;

export function haRuoloShowroom(roles: readonly string[] | null | undefined): boolean {
  const r = roles ?? [];
  return r.includes("showroom") || r.includes("responsabile_showroom");
}

/** Vero con showroom o responsabile_showroom e nessuno dei ruoli che superano lo showroom. */
export function isSoloShowroom(roles: readonly string[] | null | undefined): boolean {
  const r = roles ?? [];
  return haRuoloShowroom(r) && !RUOLI_SUPERANO_SHOWROOM.some((x) => r.includes(x));
}

/**
 * Voci di menu dello showroom (oltre all'area fidi, che passa da puoVedereAreaFidi,
 * e ai preventivi, che passano da puoConsultarePreventivi).
 */
export const VOCI_MENU_SHOWROOM = new Set<string>([
  "/dashboard",
  "/clienti",
  "/contatti",
  "/lead",
  "/calendario-commerciale",
  "/task",
  "/chat",
  "/scadenziario",
  "/cruscotto-incassi",
]);

/** Visibilità di una voce di menu per l'utente solo showroom. */
export function voceMenuVisibileShowroom(
  voce: { to: string; group: string },
  haAccessoPreventivi: boolean,
): boolean {
  if (voce.group === "preventivi") return haAccessoPreventivi;
  return VOCI_MENU_SHOWROOM.has(voce.to);
}

/**
 * Attività commerciale modificabile dallo showroom: solo le proprie e non legate a un'opportunità
 * (policy "Showroom: modifiche solo attività della sede", migrazione 0144). Per gli altri ruoli: sempre vero
 * (decidono le regole già esistenti).
 */
export function puoModificareAttivitaCommerciale(
  roles: readonly string[] | null | undefined,
  userId: string | null | undefined,
  a: { operatore_id: string | null; opportunita_id: string | null },
): boolean {
  if (!isSoloShowroom(roles)) return true;
  return !!userId && a.operatore_id === userId && !a.opportunita_id;
}

/**
 * Contatto di un cliente modificabile: per lo showroom solo quelli creati da lui
 * (policy contatti della migrazione 0141). Per gli altri ruoli decide già il database.
 */
export function puoModificareContattoClienteShowroom(
  roles: readonly string[] | null | undefined,
  userId: string | null | undefined,
  createdBy: string | null | undefined,
): boolean {
  if (!isSoloShowroom(roles)) return true;
  return !!userId && createdBy === userId;
}

/** Ruoli che richiedono un punto vendita nel profilo (pagina Utenti e server). Null se tutto ok. */
export function erroreSedeObbligatoria(ruoli: readonly string[], storeId: string | null | undefined): string | null {
  if (storeId) return null;
  if (ruoli.includes("store_manager")) return "Il ruolo Store Manager richiede un punto vendita";
  if (ruoli.includes("showroom")) return "Il ruolo Showroom richiede un punto vendita: scegli la sede dello showroom";
  return null;
}
