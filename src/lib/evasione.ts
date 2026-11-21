/**
 * Stato di EVASIONE di un preventivo, derivato dalle quantità ordinate
 * delle sue righe (qta_ordinata vs quantita). Si applica SOLO ai documenti
 * di tipo 'preventivo' — gli ordini mantengono il loro stato proprio.
 */
import { rigaInUnita, type UnitaGammaRiga } from './riga-preventivo';

export type StatoEvasione = "aperto" | "parziale" | "evaso";
export type StatoEvasioneDocumento = StatoEvasione | "chiuso";

export const EVASIONE_LABEL: Record<StatoEvasioneDocumento, string> = {
  aperto: "Aperto",
  parziale: "Parz. evaso",
  evaso: "Evaso",
  chiuso: "Chiuso",
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

export function mostraColonnaEvasione({ tipo, righe, chiuso_at }: {
  tipo: string; righe: readonly RigaQta[]; chiuso_at: string | null;
}): boolean {
  return tipo === 'preventivo' && (!!chiuso_at || righe.some(r => statoEvasioneRiga(r).ordinata > 0));
}

export function etichettaEvasioneDocumento(esito: ReturnType<typeof statoEvasionePreventivo>): string {
  return esito.evaso_in_parte ? 'Chiuso · evaso in parte' : EVASIONE_LABEL[esito.stato];
}

export function motivoTrasformazioneDisabilitata(esito: ReturnType<typeof statoEvasionePreventivo>): string | null {
  return esito.stato === 'chiuso' ? 'Preventivo chiuso: riaprilo per trasformarlo'
    : esito.stato === 'evaso' ? 'Tutte le righe sono già state ordinate' : null;
}

type RigaUnitaEvasione = RigaQta & { um?: string | null; um_scelta?: string | null; unita_gamma?: UnitaGammaRiga | null };
export function evasioneRigaInUnita(riga: RigaUnitaEvasione) {
  const esito = statoEvasioneRiga(riga);
  const converti = (quantita: number) => rigaInUnita({ ...riga, prezzo_unit: null, quantita }, riga.unita_gamma).quantita ?? 0;
  return { ...esito, um: rigaInUnita({ ...riga, prezzo_unit: null }, riga.unita_gamma).um,
    quantita: converti(esito.quantita), ordinata: converti(esito.ordinata), residuo: converti(esito.residuo) };
}

export function quantitaOrdineUm1(riga: RigaUnitaEvasione, quantitaMostrata: number): number {
  return rigaInUnita({ ...riga, prezzo_unit: null }, riga.unita_gamma, { quantita: quantitaMostrata }).patchUm1.quantita ?? 0;
}
