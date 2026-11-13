// FM64: fonte unica contro le formule nei CSV esportati (CSV/formula injection).
// Una cella di TESTO che inizia con = + - @ tab o a capo viene prefissata con '
// così Excel/LibreOffice la mostrano come testo. I numeri veri (typeof number)
// restano numeri; null/undefined diventano "".
export function cellaCsvSicura(v: unknown): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  const s = String(v);
  return /^[=+\-@\t\r\n]/.test(s) ? `'${s}` : s;
}
