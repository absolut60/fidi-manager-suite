/**
 * Stato di EVASIONE di un preventivo, derivato dalle quantità ordinate
 * delle sue righe (qta_ordinata vs quantita). Si applica SOLO ai documenti
 * di tipo 'preventivo' — gli ordini mantengono il loro stato proprio.
 */
/** Stati già presentati dall'interfaccia; la chiusura sarà esposta nella fetta 2. */
export type StatoEvasione = "aperto" | "parziale" | "evaso";
export type StatoEvasioneDocumento = StatoEvasione | "chiuso";

export const EVASIONE_LABEL: Record<StatoEvasione, string> = {
  aperto: "Aperto",
  parziale: "Parz. evaso",
  evaso: "Evaso",
};

const EPS = 0.0001;

export interface RigaQta {
  tipo_riga: string;
  quantita: number | null;
  qta_ordinata: number | null;
}

/** Le righe valorizzate (escludono nota/separatore/sotto_totale). */
export function isRigaOrdinabile(t: string): boolean {
  return t === "articolo_singolo" || t === "da_kit" || t === "manuale";
}

export function statoEvasioneRiga(riga: RigaQta): {
  stato: "aperta" | "parziale" | "evasa";
  residuo: number;
  quantita: number;
  ordinata: number;
  valorizzata: boolean;
} {
  const valorizzata = isRigaOrdinabile(riga.tipo_riga);
  const quantita = Math.max(0, Number(riga.quantita ?? 0));
  const ordinata = Math.max(0, Number(riga.qta_ordinata ?? 0));
  const residuo = valorizzata ? Math.max(0, quantita - ordinata) : 0;
  const stato = !valorizzata || quantita <= 0 || ordinata <= EPS
    ? "aperta" : residuo <= EPS ? "evasa" : "parziale";
  return { stato, residuo, quantita, ordinata, valorizzata };
}

export function statoEvasionePreventivo({ righe, chiuso_at }: {
  righe: readonly RigaQta[];
  chiuso_at: string | null;
}): { stato: StatoEvasioneDocumento; evaso_in_parte: boolean } {
  let qtaTot = 0;
  let ordTot = 0;
  for (const r of righe) {
    const { valorizzata, quantita: q, ordinata: o } = statoEvasioneRiga(r);
    if (!valorizzata) continue;
    if (q <= 0) continue;
    qtaTot += q;
    ordTot += Math.min(o, q);
  }
  const stato = qtaTot <= EPS || ordTot <= EPS ? "aperto"
    : qtaTot - ordTot <= EPS ? "evaso" : "parziale";
  return { stato: chiuso_at ? "chiuso" : stato, evaso_in_parte: !!chiuso_at && stato === "parziale" };
}

/** Adattatore di compatibilità: nessun nuovo stato visibile prima della fetta 2. */
export function computeEvasione(righe: readonly RigaQta[]): StatoEvasione {
  const { stato } = statoEvasionePreventivo({ righe, chiuso_at: null });
  return stato === "chiuso" ? "aperto" : stato;
}
