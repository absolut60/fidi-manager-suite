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
  // 'multipla' = dopo split su ; , o uno+ spazi ci sono ALMENO 2 pezzi VALIDI.
  // Richiediamo 2+ pezzi validi (non solo 2 pezzi) per evitare falsi positivi
  // come "info @termoidralicags.it" (spazio interno -> 0 pezzi validi -> resta
  // 'malformata') o "s.lualdi@... AMMNE" (1 valido + 1 testo -> NON multipla).
  const pezziValidi = v
    .split(/[;,]|\s+/)
    .map((s) => s.trim())
    .filter((s) => s && isEmailValida(s));
  if (pezziValidi.length >= 2) return "multipla";
  if (!v.includes("@")) return "non_email";
  if (EMAIL_REGEX.test(v)) return "ok";
  return "malformata";
}

/**
 * Split di un campo email/pec con più indirizzi.
 * Fonte unica usata sia dalla barriera import (applyEmailPec) sia dalla
 * bonifica una-tantum. Separatori: ';' ',' e UNO O PIÙ spazi (gestisce sia
 * il doppio spazio del gestionale sia lo spazio singolo "email1 email2").
 * La salvaguardia (validare ogni pezzo con isEmailValida a valle dello split)
 * protegge dai falsi split come "info @termoidralicags.it" (0 pezzi validi).
 * NOTA: NON usare per il telefono — "Ramona 3247806191" verrebbe spezzato
 * a torto. Il telefono ha regole proprie in classificaTelefono.
 */
export function splitEmailsMultiple(raw: string | null | undefined): string[] {
  if (raw == null) return [];
  return String(raw)
    .split(/[;,]|\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}


// ============================================================================
// TELEFONO — fonte unica di verità per validazione/classificazione
// ============================================================================
/**
 * Regola telefono (basata su diagnosi composizione campo telefono clienti):
 *  - NULL/vuoto -> non valido
 *  - Solo testo/placeholder senza cifre significative -> non valido (".", "-", nomi)
 *  - Numerico puro <= 6 cifre (tolti separatori/spazi) -> non valido
 *    (sono ID gestionale o seriali data Excel, NON telefoni)
 *  - < 4 cifre totali -> non valido
 *  - >= 8 cifre significative -> valido (anche con prefisso +/00, separatori - / spazi)
 *  - 7 cifre -> valido (fissi vecchi, prudenza)
 *  - ATTENZIONE: '/' NON è separatore di multipli (notazione italiana prefisso/numero
 *    es. "035/986692"); è considerato separatore interno valido.
 */
export type ClassificazioneTelefono =
  | "ok"
  | "vuoto"
  | "testo"
  | "id_o_data"
  | "corto";

export function classificaTelefono(
  raw: string | null | undefined,
): ClassificazioneTelefono {
  if (raw == null) return "vuoto";
  const v = String(raw).trim();
  if (v === "") return "vuoto";

  // Conta cifre totali
  const digits = v.replace(/\D/g, "");
  if (digits.length === 0) return "testo";
  if (digits.length < 4) return "corto";

  // "Numerico puro" = solo cifre e separatori "neutri" (spazi, -, (, ))
  // ma SENZA / e SENZA + (cioè senza segnali tipici di formato telefonico).
  // I valori con '/', '+' o lettere di prefisso vengono trattati come telefonici.
  const senzaSeparatoriBase = v.replace(/[\s\-().]/g, "");
  const isNumericoPuro = /^\d+$/.test(senzaSeparatoriBase);
  if (isNumericoPuro && digits.length <= 6) return "id_o_data";

  return "ok";
}

export function isTelefonoValido(raw: string | null | undefined): boolean {
  return classificaTelefono(raw) === "ok";
}
