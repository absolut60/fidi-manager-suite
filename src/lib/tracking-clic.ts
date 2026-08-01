/**
 * Riscrittura dei link delle email di campagna per il tracciamento dei clic.
 * SOLO clic: nessun pixel di apertura.
 */

/** Schemi/URL mai tracciati. */
function daEscludere(url: string): boolean {
  const u = url.trim();
  if (!u) return true;
  const lower = u.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return true; // mailto:, tel:, cid:, #, {{...}}
  if (lower.includes("/recesso/")) return true; // il recesso non va mai tracciato
  return false;
}

/**
 * Sostituisce ogni href http/https con il link tracciato
 * {appUrl}/r/{trackingToken}?u={URL_ORIGINALE_ENCODED}.
 * Gestisce apici singoli e doppi. Funzione pura.
 */
export function riscriviLinkTracciati(html: string, trackingToken: string, appUrl: string): string {
  if (!html || !trackingToken) return html;
  const base = appUrl.replace(/\/+$/, "");
  return html.replace(
    /href\s*=\s*(["'])(.*?)\1/gi,
    (match, quote: string, url: string) => {
      if (daEscludere(url)) return match;
      const originale = url.replace(/&amp;/g, "&").trim();
      const tracciato = `${base}/r/${encodeURIComponent(trackingToken)}?u=${encodeURIComponent(originale)}`;
      return `href=${quote}${tracciato}${quote}`;
    },
  );
}
