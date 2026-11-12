import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";

/** Elenco ordinato delle tab: per aggiungere Contatti/Attività (G2/G3) basta inserirle qui con titolo e permesso. */
export const TAB_SCHEDA_FORNITORE = ["riepilogo", "anagrafica", "contatti", "articoli", "clienti", "attivita", "allegati"] as const;
export type TabSchedaFornitore = typeof TAB_SCHEDA_FORNITORE[number];
export function tabSchedaFornitore(value: string): TabSchedaFornitore {
  if (value === "panoramica") return "riepilogo"; // link salvati prima di G1
  return TAB_SCHEDA_FORNITORE.find(tab => tab === value) ?? "riepilogo";
}
/** Tab visibili: "articoli" solo a chi vede articoli e costi (puo_vedere_articoli). */
export function tabVisibiliFornitore(puoVedereArticoli: boolean): TabSchedaFornitore[] {
  return TAB_SCHEDA_FORNITORE.filter(t => t !== "articoli" || puoVedereArticoli);
}
/** Riga sotto il titolo, come la scheda cliente: "Cod. … — P.IVA … — Città (PR)". */
export function sottotitoloFornitore(f: { codice_gestionale: number | string | null; partita_iva: string | null; citta: string | null; provincia: string | null }): string {
  const luogo = [f.citta?.trim(), f.provincia?.trim() ? `(${f.provincia.trim()})` : null].filter(Boolean).join(" ");
  return [f.codice_gestionale != null && f.codice_gestionale !== "" ? `Cod. ${f.codice_gestionale}` : null, f.partita_iva?.trim() ? `P.IVA ${f.partita_iva.trim()}` : null, luogo || null].filter(Boolean).join(" — ");
}
export function sitoFornitore(value: string | null | undefined): string | null {
  const testo = value?.trim();
  if (!testo) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(testo) && !/^https?:\/\//i.test(testo)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(testo) ? testo : `https://${testo}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}
export function origineLegameFornitore(origine: string, coincideSu: string | null): string {
  if (origine === "gamma") return "Collegato in Gamma";
  return `Stessa P.IVA/CF${coincideSu ? ` · ${coincideSu}` : ""}`;
}
export function paginaFornitore(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}
export const ricercaFornitori = zodValidator(z.object({
  q: fallback(z.string(), "").default(""),
  ancheCliente: fallback(z.string(), "tutti").default("tutti"),
  conArticoli: fallback(z.string(), "tutti").default("tutti"),
  conEmail: fallback(z.string(), "tutti").default("tutti"),
  manuali: fallback(z.boolean(), false).default(false),
  macro: fallback(z.array(z.string()), []).default([]),
  tipo: fallback(z.array(z.string()), []).default([]),
  pagina: fallback(z.number(), 1).default(1),
}));
export const ricercaSchedaFornitore = zodValidator(z.object({
  tab: fallback(z.string(), "riepilogo").default("riepilogo"),
  qArticoli: fallback(z.string(), "").default(""),
  preferenziali: fallback(z.boolean(), false).default(false),
  paginaArticoli: fallback(z.number(), 1).default(1),
}));
/** Filtro macrocategoria: valori = COD_MACROCAT Gamma; "nd" = senza macrocategoria (gestito in cerca_fornitori). */
export const OPZIONI_MACROCATEGORIA = [
  { valore: "01", label: "Merci" }, { valore: "03", label: "Servizi" }, { valore: "nd", label: "Da classificare" },
] as const;
export function macrocategorieValide(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ammessi: string[] = OPZIONI_MACROCATEGORIA.map(o => o.valore);
  return value.filter((v): v is string => typeof v === "string" && ammessi.includes(v));
}
export type TonoMacrocategoria = "merci" | "servizi" | "nd";
export function badgeMacrocategoria(cod: string | null | undefined, desc: string | null | undefined): { tono: TonoMacrocategoria; testo: string } {
  const c = cod?.trim();
  if (!c) return { tono: "nd", testo: "Da classificare" };
  const d = desc?.trim();
  const testo = d ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase() : `Macrocategoria ${c}`;
  return { tono: c === "01" ? "merci" : c === "03" ? "servizi" : "nd", testo: testo.replace(/^Fornitori\b/, "Fornitore") };
}
export function filtroSiNo(value: string): boolean | null {
  return value === "si" ? true : value === "no" ? false : null;
}
/** FM62 F6: filtro "Tipo fornitore" sul tipo effettivo (Gamma 01/03, altrimenti app). */
export const OPZIONI_TIPO_FORNITORE = [
  { valore: "merci", label: "Merci" }, { valore: "servizi", label: "Servizi" }, { valore: "da_classificare", label: "Da classificare" },
] as const;
export type TipoFornitoreFiltro = typeof OPZIONI_TIPO_FORNITORE[number]["valore"];
/** Valori validi dall'URL; i link vecchi con `macro` (01/03/nd) diventano il tipo corrispondente. */
export function tipiFornitoreValidi(tipo: unknown, macroVecchio?: unknown): TipoFornitoreFiltro[] {
  const ammessi: string[] = OPZIONI_TIPO_FORNITORE.map(o => o.valore);
  const da = Array.isArray(tipo) ? tipo.filter((v): v is TipoFornitoreFiltro => typeof v === "string" && ammessi.includes(v)) : [];
  if (da.length || !Array.isArray(macroVecchio)) return da;
  const mappa: Record<string, TipoFornitoreFiltro> = { "01": "merci", "03": "servizi", nd: "da_classificare" };
  return [...new Set(macrocategorieValide(macroVecchio).map(m => mappa[m]))];
}
export function badgeTipoFornitore(tipo: string | null | undefined, fonte: string | null | undefined): { tono: TonoMacrocategoria; testo: string; daGamma: boolean } {
  const daGamma = fonte === "gamma";
  if (tipo === "merci") return { tono: "merci", testo: "Merci", daGamma };
  if (tipo === "servizi") return { tono: "servizi", testo: "Servizi", daGamma };
  return { tono: "nd", testo: "Da classificare", daGamma: false };
}
/** Il tipo si cambia nell'app solo se non lo decide Gamma. */
export const tipoModificabile = (fonte: string | null | undefined) => fonte !== "gamma";
/** Proposta di classificazione (regola di Andrea): da classificare CON articoli → Merci; senza articoli si guarda a mano. */
export const daControllareInProposta = (f: { tipo_effettivo: string | null; n_articoli: number }) => f.tipo_effettivo === "da_classificare" && f.n_articoli === 0;
