import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";

export const TAB_SCHEDA_FORNITORE = ["panoramica", "articoli", "clienti"] as const;
export type TabSchedaFornitore = typeof TAB_SCHEDA_FORNITORE[number];
export function tabSchedaFornitore(value: string): TabSchedaFornitore {
  return TAB_SCHEDA_FORNITORE.find(tab => tab === value) ?? "panoramica";
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
  manuali: fallback(z.boolean(), false).default(false),
  macro: fallback(z.array(z.string()), []).default([]),
  pagina: fallback(z.number(), 1).default(1),
}));
export const ricercaSchedaFornitore = zodValidator(z.object({
  tab: fallback(z.string(), "panoramica").default("panoramica"),
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