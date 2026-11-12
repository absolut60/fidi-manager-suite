// FM62 G4: HTML già sanificato (sanificaHtmlEmailFornitore) → blocchi per il PDF
// lettera. Pura, senza DOM: gira nel Worker e nei test. Resa: grassetto, corsivo,
// sottolineato, elenchi puntati/numerati, allineamento; caratteri e colori ignorati.
import { decodificaEntita } from "@/lib/comunicazioni-fornitore";

export type RunLettera = { t: string; b: boolean; i: boolean; u: boolean };
export type BloccoLettera = { runs: RunLettera[]; elenco: string | null; allineamento: "left" | "center" | "right" | "justify"; vuoto: boolean };

const BLOCCHI = new Set(["p", "div", "li", "ul", "ol"]);

export function htmlInBlocchiLettera(html: string): BloccoLettera[] {
  const out: BloccoLettera[] = [];
  const stile: { b: number; i: number; u: number } = { b: 0, i: 0, u: 0 };
  const pila: { nome: string; b: boolean; i: boolean; u: boolean }[] = [];
  const allin: string[] = [];
  const elenchi: { tipo: "ul" | "ol"; n: number }[] = [];
  let cur: BloccoLettera | null = null;
  const nuovo = (elenco: string | null = null) => {
    chiudi();
    cur = { runs: [], elenco, allineamento: (allin[allin.length - 1] as BloccoLettera["allineamento"]) || "left", vuoto: false };
  };
  const chiudi = () => {
    if (!cur) return;
    const c = cur as BloccoLettera;
    while (c.runs.length && c.runs[c.runs.length - 1].t === "\n") c.runs.pop();
    const testo = c.runs.map(r => r.t).join("").trim();
    if (testo || c.elenco) out.push(c); else out.push({ runs: [], elenco: null, allineamento: "left", vuoto: true });
    cur = null;
  };
  const testo = (t: string) => {
    const v = decodificaEntita(t).replace(/\u00a0/g, " ").replace(/[\r\n\t]+/g, " ");
    if (!v) return;
    if (!cur) { if (!v.trim()) return; nuovo(); }
    (cur as unknown as BloccoLettera).runs.push({ t: v, b: stile.b > 0, i: stile.i > 0, u: stile.u > 0 });
  };
  const re = /<(\/?)([a-z]+)([^>]*)>/gi;
  let ultimo = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    testo(html.slice(ultimo, m.index)); ultimo = re.lastIndex;
    const chiusura = m[1] === "/"; const nome = m[2].toLowerCase(); const att = m[3];
    if (nome === "br") { if (!cur) nuovo(); (cur as unknown as BloccoLettera).runs.push({ t: "\n", b: false, i: false, u: false }); continue; }
    if (!chiusura) {
      const al = /text-align:\s*(left|center|right|justify)/i.exec(att)?.[1]?.toLowerCase();
      const ef = { nome, b: nome === "b" || nome === "strong" || /font-weight:\s*(bold|[6-9]00)/i.test(att), i: nome === "i" || nome === "em", u: nome === "u" };
      if (nome === "ul" || nome === "ol") { chiudi(); elenchi.push({ tipo: nome, n: 0 }); }
      if (BLOCCHI.has(nome)) allin.push(al ?? allin[allin.length - 1] ?? "");
      if (nome === "li") { const e = elenchi[elenchi.length - 1]; const seg = !e ? "•" : e.tipo === "ol" ? `${++e.n}.` : "•"; nuovo(seg); }
      else if (nome === "p" || nome === "div") nuovo();
      pila.push(ef); if (ef.b) stile.b++; if (ef.i) stile.i++; if (ef.u) stile.u++;
    } else {
      const idx = pila.map(p => p.nome).lastIndexOf(nome);
      if (idx < 0) continue;
      while (pila.length > idx) { const p = pila.pop()!; if (p.b) stile.b--; if (p.i) stile.i--; if (p.u) stile.u--; if (BLOCCHI.has(p.nome)) allin.pop(); if (p.nome === "ul" || p.nome === "ol") elenchi.pop(); }
      if (BLOCCHI.has(nome)) chiudi();
    }
  }
  testo(html.slice(ultimo));
  chiudi();
  // Niente righe vuote ripetute o in testa/coda.
  const pulito: BloccoLettera[] = [];
  for (const b of out) { if (b.vuoto && (!pulito.length || pulito[pulito.length - 1].vuoto)) continue; pulito.push(b); }
  while (pulito.length && pulito[pulito.length - 1].vuoto) pulito.pop();
  return pulito;
}
