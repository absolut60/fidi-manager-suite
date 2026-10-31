// Riepilogo del piede del dialog "Proposta fido massiva" (FM55 sanatoria):
// totali e dettaglio per tipo calcolati sulle righe visibili e incluse.
// Fonte unica, pura e testata; il dialog la usa e basta.

export type RigaRiepilogoProposta = {
  fido_attuale: number;
  fido_proposto: number;
  tipo: "nuovo_fido" | "aumento" | "diminuzione" | "rinnovo";
};

export type DettaglioTipoProposta = {
  tipo: "aumento" | "diminuzione" | "nuovo_fido";
  /** Numero di righe di questo tipo. */
  n: number;
  /** Somma (proposto − attuale) sulle righe del tipo: positiva per aumenti/nuovi, negativa per diminuzioni. */
  somma: number;
};

export type RiepilogoProposte = {
  totaleAttuale: number;
  totaleProposto: number;
  /** totaleProposto − totaleAttuale (segno significativo). */
  differenza: number;
  /** Solo i tipi presenti tra le righe (rinnovo escluso: differenza sempre nulla). */
  dettaglio: DettaglioTipoProposta[];
};

export function riepilogoProposte(righe: RigaRiepilogoProposta[]): RiepilogoProposte {
  const num = (v: unknown) => Number(v) || 0;
  const totaleAttuale = righe.reduce((a, r) => a + num(r.fido_attuale), 0);
  const totaleProposto = righe.reduce((a, r) => a + num(r.fido_proposto), 0);
  const dettaglio: DettaglioTipoProposta[] = [];
  for (const tipo of ["aumento", "diminuzione", "nuovo_fido"] as const) {
    const rs = righe.filter((r) => r.tipo === tipo);
    if (rs.length === 0) continue;
    dettaglio.push({
      tipo,
      n: rs.length,
      somma: rs.reduce((a, r) => a + num(r.fido_proposto) - num(r.fido_attuale), 0),
    });
  }
  return { totaleAttuale, totaleProposto, differenza: totaleProposto - totaleAttuale, dettaglio };
}
