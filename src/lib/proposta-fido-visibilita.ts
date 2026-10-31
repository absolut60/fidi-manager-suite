/**
 * Visibilità delle righe nella proposta fido massiva.
 * Le righe toccate dall'utente restano visibili (e nella stessa posizione) finché
 * non cambiano i filtri: così una riga non sparisce mentre la si modifica.
 */
export type Tri = "tutti" | "escludi" | "solo" | string;

export interface FiltriProposta<T extends string = string> {
  tipi: T[];
  pagImmediato: Tri;
  fidoZero: Tri;
  inCorso: Tri;
}

export interface RigaVisibilita<T extends string = string> {
  cliente_id: string;
  tipo: T;
  regola: string;
  fido_proposto: number;
  richiestaInCorso?: unknown;
  /** FM55 3C: cliente con alert aperto o segnalazione arancione/rossa (vedi daValutareProposta). */
  inAlertOAnomalia?: boolean;
}

/** Regola unica: un rinnovo di un cliente in alert o con anomalie non si nasconde dal filtro Tipo. */
export function daValutareProposta<T extends string>(r: RigaVisibilita<T>): boolean {
  return r.tipo === "rinnovo" && !!r.inAlertOAnomalia;
}

export function passaFiltriProposta<T extends string>(r: RigaVisibilita<T>, f: FiltriProposta<T>): boolean {
  if (!f.tipi.includes(r.tipo) && !daValutareProposta(r)) return false;
  const inCorso = !!r.richiestaInCorso;
  if (f.inCorso === "escludi" && inCorso) return false;
  if (f.inCorso === "solo" && !inCorso) return false;
  const isPagImmediato = r.regola === "pagamento_immediato";
  if (f.pagImmediato === "escludi" && isPagImmediato) return false;
  if (f.pagImmediato === "solo" && !isPagImmediato) return false;
  const isFidoZero = Number(r.fido_proposto) === 0;
  if (f.fidoZero === "escludi" && isFidoZero) return false;
  if (f.fidoZero === "solo" && !isFidoZero) return false;
  return true;
}

export function righeVisibiliProposta<T extends string, R extends RigaVisibilita<T>>(
  righe: R[], filtri: FiltriProposta<T>, toccate: ReadonlySet<string>,
): R[] {
  return righe.filter((r) => toccate.has(r.cliente_id) || passaFiltriProposta(r, filtri));
}

/** Motivo per cui una riga proponibile è nascosta: stessa sequenza di passaFiltriProposta. */
export type MotivoNascosto =
  | "rinnovo" | "protetto" | "tipo_spento"
  | "in_corso" | "non_in_corso"
  | "pag_immediato" | "non_pag_immediato"
  | "fido_zero" | "fido_non_zero";

export function motivoNascostoProposta<T extends string>(
  r: RigaVisibilita<T>, f: FiltriProposta<T>, protetto: boolean,
): MotivoNascosto | null {
  if (!f.tipi.includes(r.tipo) && !daValutareProposta(r)) {
    if (r.tipo === "rinnovo") return protetto ? "protetto" : "rinnovo";
    return "tipo_spento";
  }
  const inCorso = !!r.richiestaInCorso;
  if (f.inCorso === "escludi" && inCorso) return "in_corso";
  if (f.inCorso === "solo" && !inCorso) return "non_in_corso";
  const isPagImmediato = r.regola === "pagamento_immediato";
  if (f.pagImmediato === "escludi" && isPagImmediato) return "pag_immediato";
  if (f.pagImmediato === "solo" && !isPagImmediato) return "non_pag_immediato";
  const isFidoZero = Number(r.fido_proposto) === 0;
  if (f.fidoZero === "escludi" && isFidoZero) return "fido_zero";
  if (f.fidoZero === "solo" && !isFidoZero) return "fido_non_zero";
  return null;
}

export interface RiepilogoVisibilita {
  totale: number;
  visibili: number;
  /** Tra le visibili: rinnovi mostrati perché in alert o con anomalie. */
  daValutare: number;
  nascosti: Record<MotivoNascosto, number>;
  /** Tipi spenti nel filtro, per tipo (nuovo_fido, aumento, diminuzione…). */
  tipiSpenti: Record<string, number>;
  nonProponibili: Record<string, number>;
  nonProponibiliTotale: number;
}

/** Conteggi per il riquadro "cosa stai vedendo": visibili + nascosti + non proponibili = totale. */
export function riepilogoVisibilita<T extends string, R extends RigaVisibilita<T> & { proponibile: boolean }>(
  righe: R[], filtri: FiltriProposta<T>, toccate: ReadonlySet<string>, protetti: { has(id: string): boolean } | undefined,
): RiepilogoVisibilita {
  const nascosti: Record<MotivoNascosto, number> = {
    rinnovo: 0, protetto: 0, tipo_spento: 0, in_corso: 0, non_in_corso: 0,
    pag_immediato: 0, non_pag_immediato: 0, fido_zero: 0, fido_non_zero: 0,
  };
  const tipiSpenti: Record<string, number> = {};
  const nonProponibili: Record<string, number> = {};
  let visibili = 0, daValutare = 0, nonProponibiliTotale = 0;
  for (const r of righe) {
    if (!r.proponibile) {
      nonProponibili[r.regola] = (nonProponibili[r.regola] ?? 0) + 1;
      nonProponibiliTotale++;
      continue;
    }
    const m = toccate.has(r.cliente_id) ? null : motivoNascostoProposta(r, filtri, !!protetti?.has(r.cliente_id));
    if (!m) { visibili++; if (daValutareProposta(r)) daValutare++; continue; }
    nascosti[m]++;
    if (m === "tipo_spento") tipiSpenti[r.tipo] = (tipiSpenti[r.tipo] ?? 0) + 1;
  }
  return { totale: righe.length, visibili, daValutare, nascosti, tipiSpenti, nonProponibili, nonProponibiliTotale };
}
