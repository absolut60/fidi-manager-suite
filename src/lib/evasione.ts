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
/** Tolleranza di confronto alla precisione di visualizzazione (4 decimali). */
const EPS_VISUALIZZAZIONE = 0.0001;

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

export function etichettaEvasioneDocumento(esito: ReturnType<typeof statoEvasionePreventivo>): { etichetta: string; sottotesto: string | null } {
  return { etichetta: EVASIONE_LABEL[esito.stato], sottotesto: esito.evaso_in_parte ? 'evaso in parte' : null };
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

/**
 * Quantità da inviare in UM1 a partire da quella mostrata nell'unità scelta.
 * Il risultato non supera MAI il residuo UM1 reale: con fattori non interi
 * (es. 3,6 o 0,72) il residuo mostrato, arrotondato, riconvertito può
 * eccedere il residuo e la RPC rifiuterebbe con "Quantità richiesta superiore
 * al residuo". Se la quantità mostrata coincide col residuo mostrato (entro
 * la precisione di visualizzazione) si invia esattamente il residuo UM1.
 */
export function quantitaOrdineUm1(riga: RigaUnitaEvasione, quantitaMostrata: number): number {
  const { residuo: residuoUm1 } = statoEvasioneRiga(riga);
  const { residuo: residuoMostrato } = evasioneRigaInUnita(riga);
  if (Math.abs(quantitaMostrata - residuoMostrato) <= EPS_VISUALIZZAZIONE) return residuoUm1;
  const convertita = rigaInUnita({ ...riga, prezzo_unit: null }, riga.unita_gamma, { quantita: quantitaMostrata }).patchUm1.quantita ?? 0;
  return Math.max(0, Math.min(convertita, residuoUm1));
}
