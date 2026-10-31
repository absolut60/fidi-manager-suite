// FM55 — Motivazione effettiva di una riga della proposta fido massiva.
// Fonte unica: usata sia per l'anteprima "Motivazione: …" sia per il payload salvato.
export function motivazioneEffettiva(
  r: { motivazione?: string; motivazione_auto?: string; fido_proposto: number; fido_iniziale: number },
  generale: string | null,
): string | null {
  // La motivazione automatica dal profilo (MOTIVAZIONE_PROFILO_FIDO) vale solo se
  // l'importo della riga è quello iniziale proposto dal sistema: se l'utente ha
  // cambiato l'importo, vale la motivazione personalizzata se c'è, altrimenti la
  // generale (il profilo contraddirebbe la scelta dell'utente).
  const auto = Number(r.fido_proposto) !== Number(r.fido_iniziale) ? undefined : r.motivazione_auto;
  return r.motivazione === undefined
    ? (auto ?? generale)
    : (r.motivazione.trim() === "" ? null : r.motivazione);
}
