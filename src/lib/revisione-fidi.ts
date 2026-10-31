// Supporto condiviso a "Lascia così" in Alert fidi.
import { supabase } from "@/integrations/supabase/client";

/** Ultima decisione "Lascia così" del cliente (public.revisione_fidi_lasciati). */
export type LasciatoCosi = {
  cliente_id: string;
  fido_gamma: number;
  deciso_da_nome: string | null;
  deciso_il: string;
  valido_fino: string; // aaaa-mm-gg
};

/** Data di oggi aaaa-mm-gg nel fuso Europe/Rome. */
export function oggiIso(d: Date = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

/**
 * "Lasciato così" vale finché: oggi ≤ valido_fino E fido in Gamma uguale a quello salvato
 * E regola ≠ 'scaduto_non_incassato'. Se una condizione cade il cliente torna nel suo gruppo.
 */
export function lasciatoCosiValido(
  l: Pick<LasciatoCosi, "fido_gamma" | "valido_fino"> | null | undefined,
  stato: { fidoGamma: number | null | undefined; regola: string | null | undefined; oggi?: string },
): boolean {
  if (!l) return false;
  const oggi = stato.oggi ?? oggiIso();
  if (oggi > l.valido_fino) return false;
  if (Number(stato.fidoGamma ?? 0) !== Number(l.fido_gamma ?? 0)) return false;
  if (stato.regola === "scaduto_non_incassato") return false;
  return true;
}

/** Ultima decisione per cliente, letta a blocchi. */
export async function fetchUltimiLasciati(ids: string[]): Promise<Map<string, LasciatoCosi>> {
  const map = new Map<string, LasciatoCosi>();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += 500) {
    const { data, error } = await (supabase as any)
      .from("revisione_fidi_lasciati")
      .select("cliente_id, fido_gamma, deciso_da_nome, deciso_il, valido_fino")
      .in("cliente_id", uniq.slice(i, i + 500))
      .order("deciso_il", { ascending: false })
      .limit(5000);
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      if (!map.has(r.cliente_id)) map.set(r.cliente_id, { ...r, fido_gamma: Number(r.fido_gamma ?? 0) });
    }
  }
  return map;
}

/** "Lascia così 30 giorni" per qualunque cliente: public.lascia_cosi_revisione (conferma anche l'alert). */
export async function lasciaCosiRevisione(clienteId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("lascia_cosi_revisione", { _cliente_id: clienteId });
  if (error) throw error;
}

