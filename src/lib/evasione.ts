/**
 * Stato di EVASIONE di un preventivo, derivato dalle quantità ordinate
 * delle sue righe (qta_ordinata vs quantita). Si applica SOLO ai documenti
 * di tipo 'preventivo' — gli ordini mantengono il loro stato proprio.
 */
export type StatoEvasione = "aperto" | "parziale" | "evaso";

export const EVASIONE_LABEL: Record<StatoEvasione, string> = {
  aperto: "Aperto",
  parziale: "Parz. evaso",
  evaso: "Evaso",
};

const EPS = 0.0001;

interface RigaQta {
  tipo_riga: string;
  quantita: number | null;
  qta_ordinata: number | null;
}

/** Le righe valorizzate (escludono nota/separatore/sotto_totale). */
function isRigaOrdinabile(t: string): boolean {
  return t === "articolo_singolo" || t === "da_kit" || t === "manuale";
}

export function computeEvasione(righe: RigaQta[]): StatoEvasione {
  let qtaTot = 0;
  let ordTot = 0;
  for (const r of righe) {
    if (!isRigaOrdinabile(r.tipo_riga)) continue;
    const q = Number(r.quantita ?? 0);
    const o = Number(r.qta_ordinata ?? 0);
    if (q <= 0) continue;
    qtaTot += q;
    ordTot += Math.min(o, q);
  }
  if (qtaTot <= EPS) return "aperto";
  if (ordTot <= EPS) return "aperto";
  if (qtaTot - ordTot <= EPS) return "evaso";
  return "parziale";
}
