// Fonte unica del secondo fattore (FM44, fetta 1): TOTP facoltativo via Auth MFA.
// Usa solo il client dell'utente (nessun service role).
import { supabase } from "@/integrations/supabase/client";

export type LivelloAccesso = "aal1" | "aal2";

export type StatoSecondoFattore = {
  haFattoreVerificato: boolean;
  livelloAttuale: LivelloAccesso;
  livelloRichiesto: LivelloAccesso;
};

function livello(v: string | null | undefined): LivelloAccesso {
  return v === "aal2" ? "aal2" : "aal1";
}

export async function statoSecondoFattore(): Promise<StatoSecondoFattore> {
  const [{ data: fattori, error: e1 }, { data: aal, error: e2 }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return {
    haFattoreVerificato: (fattori?.totp ?? []).some((f) => f.status === "verified"),
    livelloAttuale: livello(aal?.currentLevel),
    livelloRichiesto: livello(aal?.nextLevel),
  };
}

/** Unica regola: la sessione richiede il codice e non l'ha ancora fornito. */
export function serveCodice(stato: StatoSecondoFattore): boolean {
  return stato.livelloRichiesto === "aal2" && stato.livelloAttuale !== "aal2";
}

/** Primo fattore TOTP verificato dell'utente, se esiste. */
export async function fattoreTotpVerificato(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? []).find((f) => f.status === "verified")?.id ?? null;
}

/** Rimuove i fattori TOTP non verificati (attivazioni lasciate a metà). */
export async function rimuoviFattoriNonVerificati(): Promise<void> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const residui = (data?.all ?? []).filter((f) => f.factor_type === "totp" && f.status !== "verified");
  for (const f of residui) await supabase.auth.mfa.unenroll({ factorId: f.id });
}

/** challenge + verify sul fattore indicato. Lancia errore se il codice non è valido. */
export async function verificaCodice(factorId: string, codice: string): Promise<void> {
  const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId });
  if (e1) throw e1;
  const { error: e2 } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: codice.trim() });
  if (e2) throw e2;
}

export const MESSAGGIO_CODICE_NON_VALIDO = "Codice non valido o scaduto, riprova.";

/** Data URL dell'immagine QR restituita da enroll (svg o già data URL). */
export function srcQr(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`;
}
