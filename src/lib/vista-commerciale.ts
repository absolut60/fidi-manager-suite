/**
 * FM75 F2b — Vista commerciale del preventivo (fonte unica TS). Regola: docs/regole/vista-commerciale.md.
 * Le righe con stampabile=false confluiscono nel raccoglitore (prima riga PEF*, isRaccoglitorePosa).
 * Invariante: totale stampato = totale vero, al centesimo. Funzione pura, nessun accesso a dati.
 */
import { isRaccoglitorePosa } from './riga-preventivo';

export interface RigaVistaInput {
  id?: string;
  descrizione?: string | null;
  importo?: number | string | null;
  quantita?: number | string | null;
  stampabile?: boolean | null;
  articolo_codice?: string | null;
  tipo_riga?: string | null;
}
export interface BloccoVistaInput<R extends RigaVistaInput = RigaVistaInput> { id?: string; righe: R[] }

export interface RigaVista<R extends RigaVistaInput = RigaVistaInput> {
  riga: R;
  /** Importo esposto: per il raccoglitore include le righe nascoste che assorbe. */
  importoStampato: number;
  /** Chiave del gruppo raccoglitore se questa riga è un raccoglitore, altrimenti null. */
  raccoglitore: string | null;
}
export interface BloccoVista<B extends BloccoVistaInput = BloccoVistaInput> {
  blocco: B;
  righe: RigaVista<B['righe'][number]>[];
  subtotaleStampato: number;
  /** true se nessuna riga è visibile (blocco interamente nascosto): può essere omesso. */
  vuoto: boolean;
}
/** Gruppo "nascoste → raccoglitore". Oggi uno solo (chiave 'posa'); F3 aggiungerà gruppi per natura fiscale. */
export interface GruppoRaccoglitore<R extends RigaVistaInput = RigaVistaInput> {
  chiave: string;
  raccoglitore: R;
  importoProprio: number;
  nascoste: R[];
  importoNascoste: number;
  importoStampato: number;
}
export interface VistaCommerciale<B extends BloccoVistaInput = BloccoVistaInput> {
  blocchi: BloccoVista<B>[];
  raccoglitori: GruppoRaccoglitore<B['righe'][number]>[];
  totaleVero: number;
  totaleStampato: number;
}

const cent = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const euro = (c: number): number => c / 100;

export function vistaCommerciale<B extends BloccoVistaInput>(blocchi: readonly B[]): VistaCommerciale<B> {
  type R = B['righe'][number];
  let raccoglitore: R | null = null;
  for (const b of blocchi) { for (const r of b.righe) if (isRaccoglitorePosa(r.articolo_codice)) { raccoglitore = r; break; } if (raccoglitore) break; }

  // Senza raccoglitore il flag è ignorato: tutto visibile.
  const nascosta = (r: R) => raccoglitore != null && r !== raccoglitore && r.stampabile === false;
  const nascoste: R[] = [];
  let centNascoste = 0, centVero = 0;
  for (const b of blocchi) for (const r of b.righe) {
    centVero += cent(r.importo);
    if (nascosta(r)) { nascoste.push(r); centNascoste += cent(r.importo); }
  }
  const gruppi: GruppoRaccoglitore<R>[] = raccoglitore ? [{
    chiave: 'posa', raccoglitore, importoProprio: euro(cent(raccoglitore.importo)), nascoste,
    importoNascoste: euro(centNascoste), importoStampato: euro(cent(raccoglitore.importo) + centNascoste),
  }] : [];

  let centStampato = 0;
  const vista = blocchi.map(blocco => {
    let sub = 0;
    const righe: RigaVista<R>[] = [];
    for (const r of blocco.righe as R[]) {
      if (nascosta(r)) continue;
      const c = r === raccoglitore ? cent(r.importo) + centNascoste : cent(r.importo);
      sub += c;
      righe.push({ riga: r, importoStampato: euro(c), raccoglitore: r === raccoglitore ? 'posa' : null });
    }
    centStampato += sub;
    return { blocco, righe, subtotaleStampato: euro(sub), vuoto: righe.length === 0 } as BloccoVista<B>;
  });
  return { blocchi: vista, raccoglitori: gruppi, totaleVero: euro(centVero), totaleStampato: euro(centStampato) };
}
