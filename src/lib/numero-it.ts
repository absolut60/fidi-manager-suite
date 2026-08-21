/**
 * Utility per la gestione numeri in formato italiano (virgola decimale).
 * Internamente i numeri restano in formato JS (punto), solo UI usa la virgola.
 */

export function parseNumeroIt(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value).trim();
  if (s === "") return null;
  // Rimuovi spazi (separatori migliaia non-breaking)
  s = s.replace(/\s|\u00A0/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // "1.234,56" → punto = migliaia, virgola = decimale
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // "0,42" → "0.42"
    s = s.replace(",", ".");
  }
  // hasDot only → già formato JS
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatNumeroIt(
  value: number | string | null | undefined,
  opts: { minDecimals?: number; maxDecimals?: number } = {},
): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : parseNumeroIt(value);
  if (n === null || !Number.isFinite(n)) return "";
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: opts.minDecimals ?? 0,
    maximumFractionDigits: opts.maxDecimals ?? 4,
  });
}
