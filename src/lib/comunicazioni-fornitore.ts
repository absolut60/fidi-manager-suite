// FM62 G3: schemi e logica pura dell'invio email al fornitore (browser-safe,
// nessun import server). Usati da comunicazioni-fornitore.functions.ts, dalla
// finestra InviaEmailFornitoreDialog e dai test.
import { z } from "zod";
import { isEmailValida } from "@/lib/email-validazione";

export const MAX_DESTINATARI_A = 5;
export const MAX_INDIRIZZI_FORNITORE = 10;
export const MAX_ALLEGATI_FORNITORE_BYTES = 10 * 1024 * 1024;
export const MAX_TESTO_FORNITORE = 20000;
export const MAX_HTML_FORNITORE = 100000;

// ---- Sanificazione HTML (pura, senza DOM: gira anche nel Worker) ----------
const TAG_AMMESSI = new Set(["p", "br", "div", "span", "b", "strong", "i", "em", "u", "ul", "ol", "li", "a", "font"]);
const VUOTI = new Set(["br"]);
/** Tag eliminati insieme a tutto il loro contenuto. */
const TAG_PERICOLOSI = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "head", "title", "xml", "svg", "math", "textarea", "select", "frameset", "frame", "applet", "base", "link", "meta"]);
const NOMI_ENTITA: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", colon: ":", tab: "\t", newline: "\n", lpar: "(", rpar: ")", sol: "/", period: "." };

export function decodificaEntita(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    const v = NOMI_ENTITA[e.toLowerCase()];
    return v ?? m;
  });
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function hrefSicuro(raw: string): string | null {
  const v = decodificaEntita(raw).replace(/[\u0000-\u0020\u007f-\u009f]/g, "").trim();
  return /^(https?:\/\/|mailto:)/i.test(v) ? v : null;
}
const RE_COLORE = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*(,\s*(0|1|0?\.\d+)\s*)?\)|[a-z]{3,20})$/i;
const RE_DIMENSIONE = /^(\d{1,3}(\.\d{1,2})?(px|pt|em|rem|%)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/i;
const RE_FONT = /^[a-z0-9 ,'"-]{1,120}$/i;

/** Tiene solo font-family, font-size, color, text-align con valori innocui. */
export function filtraStile(raw: string): string {
  const out: string[] = [];
  for (const decl of decodificaEntita(raw).split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const k = decl.slice(0, i).trim().toLowerCase();
    const v = decl.slice(i + 1).trim().replace(/\s*!important$/i, "");
    if (/[\\(]/.test(v) && !(k === "color" && /^rgba?\(/i.test(v))) continue;
    if (k === "font-family" && RE_FONT.test(v)) out.push(`font-family:${v.replace(/"/g, "'")}`);
    else if (k === "font-size" && RE_DIMENSIONE.test(v)) out.push(`font-size:${v}`);
    else if (k === "color" && RE_COLORE.test(v) && !/^(expression|url)/i.test(v)) out.push(`color:${v}`);
    else if (k === "text-align" && /^(left|center|right|justify)$/i.test(v)) out.push(`text-align:${v.toLowerCase()}`);
  }
  return out.join(";");
}

function leggiAttributi(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

/**
 * Allowlist HTML per il corpo delle email ai fornitori: p, br, div, span, b,
 * strong, i, em, u, ul, ol, li, a[href http/https/mailto], font; style solo
 * font-family/font-size/color/text-align. Tutto il resto viene scartato (tag
 * sconosciuti: resta il testo; script/style/iframe…: eliminati col contenuto).
 */
export function sanificaHtmlEmailFornitore(input: string): string {
  const html = input.replace(/<!--[\s\S]*?(-->|$)/g, "").replace(/<!\[CDATA\[[\s\S]*?(\]\]>|$)/g, "").replace(/<![^>]*>/g, "").replace(/<\?[^>]*>/g, "");
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const pila: string[] = [];
  let out = "";
  let ultimo = 0;
  let saltaFino: string | null = null;
  let m: RegExpExecArray | null;
  const testo = (t: string) => esc(decodificaEntita(t));
  while ((m = re.exec(html))) {
    const prima = html.slice(ultimo, m.index);
    ultimo = re.lastIndex;
    const chiusura = m[1] === "/";
    const nome = m[2].toLowerCase();
    if (saltaFino) { if (chiusura && nome === saltaFino) saltaFino = null; continue; }
    out += testo(prima);
    if (TAG_PERICOLOSI.has(nome)) { if (!chiusura && !/\/\s*$/.test(m[3])) saltaFino = nome; continue; }
    if (!TAG_AMMESSI.has(nome)) continue;
    if (chiusura) {
      const i = pila.lastIndexOf(nome);
      if (i < 0) continue;
      while (pila.length > i) out += `</${pila.pop()}>`;
      continue;
    }
    const att = leggiAttributi(m[3]);
    const parti: string[] = [];
    if (nome === "a") {
      const h = att.href != null ? hrefSicuro(att.href) : null;
      if (h) parti.push(`href="${esc(h)}"`, `target="_blank"`, `rel="noopener noreferrer"`);
    }
    if (nome === "font") {
      if (att.face && RE_FONT.test(decodificaEntita(att.face))) parti.push(`face="${esc(decodificaEntita(att.face).replace(/"/g, "'"))}"`);
      if (att.size && /^[1-7]$/.test(att.size.trim())) parti.push(`size="${att.size.trim()}"`);
      if (att.color && RE_COLORE.test(decodificaEntita(att.color).trim())) parti.push(`color="${esc(decodificaEntita(att.color).trim())}"`);
    }
    if (att.style) { const st = filtraStile(att.style); if (st) parti.push(`style="${esc(st)}"`); }
    if (att.align && /^(left|center|right|justify)$/i.test(att.align.trim()) && nome !== "a") parti.push(`style="text-align:${att.align.trim().toLowerCase()}"`);
    const attr = parti.length ? " " + [...new Map(parti.map(p => [p.split("=")[0], p])).values()].join(" ") : "";
    out += `<${nome}${attr}>`;
    if (!VUOTI.has(nome)) pila.push(nome);
  }
  if (!saltaFino) out += testo(html.slice(ultimo));
  while (pila.length) out += `</${pila.pop()}>`;
  return out;
}

/** Versione testo semplice di un HTML (anteprima riga, ricerca, limite caratteri). */
export function htmlInTesto(html: string): string {
  const t = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|div|li|ul|ol)>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodificaEntita(t).replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const indirizzi = z.array(z.string().transform(v => v.trim()));

export const inviaEmailFornitoreInput = z.object({
  fornitoreId: z.string().uuid(),
  chiaveInvio: z.string().uuid(),
  a: indirizzi.min(1, "Indica almeno un destinatario.").max(MAX_DESTINATARI_A, `Massimo ${MAX_DESTINATARI_A} destinatari nel campo A.`),
  cc: indirizzi,
  ccn: indirizzi,
  oggetto: z.string().transform(v => v.trim()).pipe(z.string().min(1, "L'oggetto è obbligatorio.").max(200, "Oggetto: massimo 200 caratteri.")),
  // Corpo HTML dall'editor: sanificato qui (allowlist) prima di ogni uso.
  html: z.string().max(MAX_HTML_FORNITORE, "Testo formattato troppo lungo (massimo 100.000 caratteri di HTML).")
    .transform(v => { const html = sanificaHtmlEmailFornitore(v); return { html, testo: htmlInTesto(html) }; })
    .refine(v => v.testo.trim().length > 0, "Il testo è obbligatorio.")
    .refine(v => v.testo.length <= MAX_TESTO_FORNITORE, "Testo: massimo 20.000 caratteri."),
  allegatiIds: z.array(z.string().uuid()).max(20),
  nuoviAllegati: z.array(z.object({ filename: z.string().min(1).max(200), contentType: z.string().max(200), base64: z.string() })).max(20),
}).superRefine((d, ctx) => {
  const tutti = [...d.a, ...d.cc, ...d.ccn];
  for (const e of tutti) if (!isEmailValida(e)) ctx.addIssue({ code: "custom", message: `Indirizzo email non valido: ${e || "(vuoto)"}` });
  if (tutti.length > MAX_INDIRIZZI_FORNITORE) ctx.addIssue({ code: "custom", message: `Massimo ${MAX_INDIRIZZI_FORNITORE} indirizzi in totale tra A, CC e CCN.` });
  const visti = new Set<string>();
  for (const e of tutti.map(x => x.toLowerCase())) {
    if (visti.has(e)) ctx.addIssue({ code: "custom", message: `Indirizzo ripetuto: ${e}` });
    visti.add(e);
  }
});
export type InviaEmailFornitoreInput = z.input<typeof inviaEmailFornitoreInput>;
export type DatiInvioFornitore = z.output<typeof inviaEmailFornitoreInput>;

/** Byte reali di una stringa base64 (senza decodificarla). */
export function byteBase64(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

/** Testo semplice → HTML: escape e a capo rispettati. */
export function testoInHtml(testo: string): string {
  const esc = testo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return `<div style="white-space:normal;">${esc.replace(/\r?\n/g, "<br/>")}</div>`;
}

/** Corpo salvato nell'attività: testo + elenco dei file scelti tra gli allegati del fornitore. */
export function corpoAttivitaInvio(testo: string, nomiAllegatiFornitore: string[]): string {
  if (!nomiAllegatiFornitore.length) return testo;
  return `${testo}\n\n— Allegati dalla scheda fornitore: ${nomiAllegatiFornitore.join(", ")}`;
}

export type EsitoInvioFornitore = { attivitaId: string; stato: "in_invio" | "inviata" | "errore"; errore: string | null; giaInviata: boolean; avvisi: string[] };

/**
 * Sequenza anti-"email partita, storico non scritto": 1) riga in_invio con chiave
 * 2) invio 3) aggiornamento esito. Se la chiave esiste già non si reinvia.
 */
export async function eseguiInvioFornitore(dep: {
  inserisci: () => Promise<{ id: string } | { duplicato: true }>;
  leggiEsistente: () => Promise<{ id: string; stato: string; errore: string | null } | null>;
  invia: () => Promise<{ ok: boolean; messageId?: string | null; err?: string | null }>;
  aggiorna: (id: string, v: { stato: "inviata" | "errore"; message_id: string | null; errore: string | null }) => Promise<void>;
}): Promise<EsitoInvioFornitore> {
  const ins = await dep.inserisci();
  if ("duplicato" in ins) {
    const r = await dep.leggiEsistente();
    if (!r) throw new Error("Invio già registrato ma non leggibile: ricarica la pagina.");
    const stato = r.stato === "inviata" || r.stato === "errore" ? r.stato : "in_invio";
    return { attivitaId: r.id, stato, errore: r.errore, giaInviata: true, avvisi: [] };
  }
  let esito: { ok: boolean; messageId?: string | null; err?: string | null };
  try { esito = await dep.invia(); } catch (e) { esito = { ok: false, err: e instanceof Error ? e.message : String(e) }; }
  const v = esito.ok
    ? { stato: "inviata" as const, message_id: esito.messageId ?? null, errore: null }
    : { stato: "errore" as const, message_id: null, errore: messaggioErroreInvio(esito.err) };
  const avvisi: string[] = [];
  try { await dep.aggiorna(ins.id, v); } catch (e) { avvisi.push(`Esito non salvato nello storico: ${e instanceof Error ? e.message : String(e)}`); }
  return { attivitaId: ins.id, stato: v.stato, errore: v.errore, giaInviata: false, avvisi };
}

export function messaggioErroreInvio(err: string | null | undefined): string {
  const t = (err ?? "").trim();
  if (!t) return "Invio non riuscito per un errore sconosciuto.";
  return t.length > 500 ? `${t.slice(0, 500)}…` : t;
}
