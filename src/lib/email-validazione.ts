/**
 * Fonte unica di verità per la validazione/classificazione email cliente.
 *
 * Pattern usato (allineato ai dialog già in produzione):
 *   /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 *
 * Conseguenza voluta — vengono rifiutati:
 *  - null / stringa vuota / solo spazi
 *  - stringhe con spazi interni
 *  - più indirizzi nello stesso campo (separati da ';' o ',')
 *  - stringhe con più di un '@'
 *  - stringhe senza '@' (es. date Excel serializzate come "43999")
 *  - mancanza del punto nel dominio
 *
 * Replicato anche nell'edge function `send-email` come ultima difesa server-side.
 * Se modifichi il pattern qui, aggiorna anche `supabase/functions/send-email/index.ts`.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailValida(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const v = String(raw).trim();
  if (v === "") return false;
  return EMAIL_REGEX.test(v);
}

export type ClassificazioneEmail =
  | "ok"
  | "vuota"
  | "multipla"
  | "non_email"
  | "malformata";

/**
 * Classificazione dettagliata, utile per reporting/diagnostica
 * (export "clienti con email sporca", anomalie import, ecc.).
 */
export function classificaEmail(
  raw: string | null | undefined,
): ClassificazioneEmail {
  if (raw == null) return "vuota";
  const v = String(raw).trim();
  if (v === "") return "vuota";
  if (/[;,]/.test(v)) return "multipla";
  if (!v.includes("@")) return "non_email";
  if (EMAIL_REGEX.test(v)) return "ok";
  return "malformata";
}
