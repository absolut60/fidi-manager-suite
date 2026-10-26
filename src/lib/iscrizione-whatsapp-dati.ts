/**
 * Fonte unica (client + server) per i dati anagrafici del modulo iscrizione
 * WhatsApp (FM48): normalizzazione/validazione P.IVA e CF, etichetta sede.
 * Gemello SQL della normalizzazione: registra_consenso_whatsapp
 * (P.IVA solo cifre, CF maiuscolo senza spazi).
 */

/** Toglie spazi ed eventuale prefisso IT. Ritorna stringa vuota se nulla. */
export function normalizzaPartitaIva(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, "").replace(/^IT/i, "");
}

/** Valida: 11 cifre dopo la normalizzazione. */
export function isPartitaIvaValida(raw: string | null | undefined): boolean {
  return /^\d{11}$/.test(normalizzaPartitaIva(raw));
}

/** Maiuscolo, senza spazi. */
export function normalizzaCodiceFiscale(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, "").toUpperCase();
}

/** Valida: 16 caratteri alfanumerici dopo la normalizzazione. */
export function isCodiceFiscaleValido(raw: string | null | undefined): boolean {
  return /^[A-Z0-9]{16}$/.test(normalizzaCodiceFiscale(raw));
}

/** Codice Gamma della sede centrale, esclusa dal menu delle sedi. */
export const CODICE_SEDE_CENTRALE = "0";

/** "SEDE DI MILANO AFFORI" → "Milano Affori". Fallback sulla città. */
export function etichettaSede(nome: string | null, citta: string | null): string {
  const base = (nome ?? "").replace(/^\s*SEDE\s+DI\s+/i, "").trim() || (citta ?? "").trim();
  return base
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}
