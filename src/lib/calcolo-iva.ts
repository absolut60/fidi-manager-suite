/**
 * FM75 F3b — Fonte unica del riepilogo IVA del preventivo (regola FM74 "IVA beni significativi").
 * Gemello SQL documentato: public.calcola_riepilogo_iva(p_preventivo_id) — ogni modifica va fatta in entrambi.
 * Non ancora collegato ai totali: fino a F3c i totali restano su iva_perc.
 *
 * Conti in centesimi interi; IVA per aliquota = round(imponibile × aliquota / 100), arrotondamento
 * metà lontano da zero (come ROUND numeric di PostgreSQL). Gruppi con imponibile 0 omessi.
 */
export type RegimeIva = 'ordinaria' | 'agevolata_10' | 'agevolata_10_bs';

export interface RigaIva {
  importo: number | null;
  bene_significativo?: boolean | null;
  aliquota_iva?: number | null;
}
export interface VoceRiepilogoIva { aliquota: number; imponibile: number; iva: number }
export interface DettaglioBeniSignificativi { totaleIntervento: number; totaleBeni: number; quota22: number }
export interface RiepilogoIva {
  regime: RegimeIva;
  voci: VoceRiepilogoIva[];
  imponibileTotale: number;
  ivaTotale: number;
  totale: number;
  /** Solo regime agevolata_10_bs. */
  dettaglioBs: DettaglioBeniSignificativi | null;
}

export const ALIQUOTA_ORDINARIA = 22;
export const ALIQUOTA_AGEVOLATA = 10;

const cent = (n: number | null | undefined) => (n != null && Number.isFinite(n) ? Math.round(n * 100) : 0);
const roundHalfAway = (x: number) => Math.sign(x) * Math.round(Math.abs(x));
const euro = (c: number) => c / 100 + 0; // +0 evita -0

export function riepilogoIva(input: { regime: RegimeIva; ivaTestataPerc?: number | null; righe: RigaIva[] }): RiepilogoIva {
  const { regime, righe } = input;
  const ivaTestata = input.ivaTestataPerc ?? ALIQUOTA_ORDINARIA;
  const gruppi = new Map<number, number>();
  const somma = (aliq: number, c: number) => gruppi.set(aliq, (gruppi.get(aliq) ?? 0) + c);
  let dettaglioBs: DettaglioBeniSignificativi | null = null;

  if (regime === 'agevolata_10') {
    somma(ALIQUOTA_AGEVOLATA, righe.reduce((s, r) => s + cent(r.importo), 0));
  } else if (regime === 'agevolata_10_bs') {
    const T = righe.reduce((s, r) => s + cent(r.importo), 0);
    const B = righe.reduce((s, r) => s + (r.bene_significativo ? cent(r.importo) : 0), 0);
    const q22 = Math.max(0, 2 * B - T);
    somma(ALIQUOTA_AGEVOLATA, T - q22);
    somma(ALIQUOTA_ORDINARIA, q22);
    dettaglioBs = { totaleIntervento: euro(T), totaleBeni: euro(B), quota22: euro(q22) };
  } else {
    for (const r of righe) somma(r.aliquota_iva ?? ivaTestata, cent(r.importo));
  }

  const voci = [...gruppi.entries()]
    .filter(([, c]) => c !== 0)
    .sort(([a], [b]) => a - b)
    .map(([aliquota, c]) => ({ aliquota, c, ivaC: roundHalfAway((c * aliquota) / 100) }));
  const impC = voci.reduce((s, v) => s + v.c, 0);
  const ivaC = voci.reduce((s, v) => s + v.ivaC, 0);
  return {
    regime,
    voci: voci.map(v => ({ aliquota: v.aliquota, imponibile: euro(v.c), iva: euro(v.ivaC) })),
    imponibileTotale: euro(impC),
    ivaTotale: euro(ivaC),
    totale: euro(impC + ivaC),
    dettaglioBs,
  };
}

/** FM75 F3c: etichette del selettore in testata (ordine di presentazione). */
export const REGIMI_IVA: { value: RegimeIva; label: string }[] = [
  { value: 'ordinaria', label: '22% ordinaria' },
  { value: 'agevolata_10', label: '10% agevolata' },
  { value: 'agevolata_10_bs', label: '10% + beni significativi' },
];

export function regimeIvaValido(v: unknown): RegimeIva {
  return v === 'agevolata_10' || v === 'agevolata_10_bs' ? v : 'ordinaria';
}

/** FM75 F3c: avvisi morbidi (solo testo, mai blocchi). `posa` = la riga è un raccoglitore posa (isRaccoglitorePosa). */
export function avvisiRegimeIva(regime: RegimeIva, righe: { bene_significativo?: boolean | null; posa: boolean }[]): string[] {
  const avvisi: string[] = [];
  if (regime === 'agevolata_10_bs' && !righe.some(r => r.bene_significativo)) avvisi.push('Nessun bene significativo indicato');
  if (regime !== 'ordinaria' && !righe.some(r => r.posa)) avvisi.push('Regime agevolato senza riga di posa: verifica la coerenza');
  return avvisi;
}
