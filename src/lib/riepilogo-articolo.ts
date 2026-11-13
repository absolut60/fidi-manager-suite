/** FM65 punto 4: parte pura della finestra "Riepilogo articolo". Nessun calcolo di prezzo: solo testi. */
import { formatScontiGamma } from "./riga-preventivo";

/** Sconti d'acquisto del listino fornitore in forma Gamma "17+5"; "—" se nessuno. */
export function scontiAcquistoTesto(r: { acq_sc1?: number | null; acq_sc2?: number | null; acq_sc3?: number | null } | null | undefined): string {
  if (!r) return "—";
  return formatScontiGamma([r.acq_sc1 ?? null, r.acq_sc2 ?? null, r.acq_sc3 ?? null]) || "—";
}

const it = (v: number, dec: number) => v.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Trasporto d'acquisto: "3% + 0,5000 €", solo la parte presente; "—" se nessuno. */
export function trasportoAcquistoTesto(r: { acq_trasporto_perc?: number | null; acq_trasporto_euro?: number | null } | null | undefined): string {
  const p = Number(r?.acq_trasporto_perc ?? 0), e = Number(r?.acq_trasporto_euro ?? 0);
  const parti = [p ? `${p.toLocaleString("it-IT", { maximumFractionDigits: 4 })}%` : "", e ? `${it(e, 4)} €` : ""].filter(Boolean);
  return parti.join(" + ") || "—";
}

const FONTI: Record<string, string> = {
  listino: "Prezzo del listino del cliente",
  deposito: "Prezzo del deposito della sede del cliente",
  piu_articoli: "Prezzo speciale del listino + articoli",
  cliente_articolo: "Prezzo speciale del cliente per questo articolo",
};
/** Testo leggibile della fonte del prezzo del motore (fonte_prezzo di prezzi_preventivo_cliente). */
export function fontePrezzoTesto(fonte: string | null | undefined, avvisi?: readonly string[] | null): string {
  if (avvisi?.includes("cliente_senza_listino")) return "Il cliente non ha un listino in Gamma";
  if (!fonte) return "Prezzo non disponibile per questo cliente";
  return FONTI[fonte] ?? "Prezzo da Gamma";
}
