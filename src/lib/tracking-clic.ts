/**
 * Riscrittura dei link delle email di campagna per il tracciamento dei clic.
 * SOLO clic: nessun pixel di apertura.
 *
 * Contiene anche la fonte unica della regola anti "rimando aperto" (FM41)
 * usata da src/routes/r.$token.ts: funzioni PURE, nessun accesso a DB o rete.
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

/** Regex unica degli href (apici singoli e doppi). */
const HREF_RE = /href\s*=\s*(["'])(.*?)\1/gi;

/** Decodifica unica dell'href così come finisce nel parametro `u`. */
function urlOriginale(href: string): string {
  return href.replace(/&amp;/g, "&").trim();
}

/**
 * Sostituisce ogni href http/https con il link tracciato
 * {appUrl}/r/{trackingToken}?u={URL_ORIGINALE_ENCODED}.
 * Gestisce apici singoli e doppi. Funzione pura.
 */
export function riscriviLinkTracciati(html: string, trackingToken: string, appUrl: string): string {
  if (!html || !trackingToken) return html;
  const base = appUrl.replace(/\/+$/, "");
  return html.replace(HREF_RE, (match, quote: string, url: string) => {
    if (daEscludere(url)) return match;
    const originale = urlOriginale(url);
    const tracciato = `${base}/r/${encodeURIComponent(trackingToken)}?u=${encodeURIComponent(originale)}`;
    return `href=${quote}${tracciato}${quote}`;
  });
}

/**
 * Host dei link FISSI inseriti dalla cornice delle email di campagna
 * (wrapEmailHtml in src/lib/template-email-render.ts: link del logo).
 * Se si aggiunge un link fisso alla cornice, aggiungere qui il suo host.
 */
export const HOST_ISTITUZIONALI_EMAIL: readonly string[] = ["www.gruppomade.eu", "gruppomade.eu"];

function hostDi(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Host ammessi come destinazione dei clic tracciati di una campagna. */
export function hostAmmessiCampagna(corpoHtml: string, appUrl: string): Set<string> {
  const out = new Set<string>(HOST_ISTITUZIONALI_EMAIL.map((h) => h.toLowerCase()));
  const app = hostDi(appUrl);
  if (app) out.add(app);
  for (const m of (corpoHtml ?? "").matchAll(HREF_RE)) {
    const href = m[2] ?? "";
    if (daEscludere(href)) continue;
    const h = hostDi(urlOriginale(href));
    if (h) out.add(h);
  }
  return out;
}

/** True solo se `url` è http/https valido e il suo host è (esattamente) ammesso. */
export function destinazioneConsentita(url: string, corpoHtml: string, appUrl: string): boolean {
  const h = hostDi(url);
  if (!h) return false;
  return hostAmmessiCampagna(corpoHtml, appUrl).has(h);
}
