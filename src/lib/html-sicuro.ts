// FM64: fonte unica per mostrare HTML (template, campagne, solleciti, email
// libere/inviate) dentro l'app senza che possa eseguire script.
// Non tocca ciò che viene INVIATO: vale solo per la visualizzazione.
import createDOMPurify from "dompurify";

/**
 * Sandbox per ogni iframe di anteprima: MAI allow-scripts.
 * Nessun componente misura l'altezza via contentDocument, quindi niente
 * allow-same-origin; i link si aprono in una nuova scheda fuori sandbox.
 */
export const SANDBOX_ANTEPRIMA = "allow-popups allow-popups-to-escape-sandbox";

const VIETATI = ["script", "iframe", "frame", "frameset", "object", "embed", "applet", "base", "form", "noscript"];

// Profilo email: tabelle, stili inline, <style>, immagini, link e classi restano;
// DOMPurify toglie on*, javascript:/vbscript: negli URL e i tag vietati.
const OPZIONI = {
  ADD_TAGS: ["style", "center", "font"],
  ADD_ATTR: ["target", "align", "valign", "bgcolor", "background", "border", "cellpadding", "cellspacing", "width", "height", "face", "color", "size"],
  FORBID_TAGS: VIETATI,
  FORCE_BODY: true,
  ALLOW_DATA_ATTR: false,
};

type Win = Parameters<typeof createDOMPurify>[0];
let istanza: ReturnType<typeof createDOMPurify> | null = null;
function purify(win?: Win) {
  if (win) return createDOMPurify(win);
  if (!istanza) {
    if (typeof window === "undefined") return null;
    istanza = createDOMPurify(window);
  }
  return istanza;
}

/** Frammento HTML (dangerouslySetInnerHTML, editor). Lato server ritorna "". */
export function sanificaHtml(html: string | null | undefined, win?: Win): string {
  const p = purify(win);
  if (!p || !html) return "";
  return p.sanitize(html, OPZIONI) as unknown as string;
}

/**
 * Documento completo per iframe srcDoc: conserva <html>/<head> con <style> e
 * meta, così l'anteprima resta identica. Lato server ritorna "".
 */
export function sanificaDocumentoHtml(html: string | null | undefined, win?: Win): string {
  const p = purify(win);
  if (!p || !html) return "";
  const out = p.sanitize(html, { ...OPZIONI, FORCE_BODY: false, WHOLE_DOCUMENT: true, ADD_TAGS: [...OPZIONI.ADD_TAGS, "meta", "head", "title"], ADD_ATTR: [...OPZIONI.ADD_ATTR, "charset", "content", "http-equiv", "name"] }) as unknown as string;
  return /^\s*<!doctype/i.test(html) ? `<!DOCTYPE html>${out}` : out;
}
