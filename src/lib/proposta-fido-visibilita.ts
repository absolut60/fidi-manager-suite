import { etichetteSegnalazioni, segnalazioniAnomalia } from "@/lib/fido-segnalazioni";

/**
 * Visibilità delle righe nella proposta fido massiva.
 * Le righe toccate dall'utente restano visibili (e nella stessa posizione) finché
 * non cambiano i filtri: così una riga non sparisce mentre la si modifica.
 */
export interface FiltriProposta<T extends string = string> {
  tipi: T[];
}

export interface RigaVisibilita<T extends string = string> {
  cliente_id: string;
  tipo: T;
  regola: string;
  fido_proposto: number;
  richiestaInCorso?: unknown;
  /** FM55 3C: cliente con alert aperto o segnalazione arancione/rossa (vedi daValutareProposta). */
  inAlertOAnomalia?: boolean;
  segnalazioni?: string[];
  alertAperto?: boolean;
}

/** Rinnovi nascosti con alert o anomalie, contati nel riepilogo. */
export function daValutareProposta<T extends string>(r: RigaVisibilita<T>): boolean {
  return r.tipo === "rinnovo" && !!r.inAlertOAnomalia;
}

export function passaFiltriProposta<T extends string>(r: RigaVisibilita<T>, f: FiltriProposta<T>): boolean {
  return motivoNascostoProposta(r, f) === null;
}

export function righeVisibiliProposta<T extends string, R extends RigaVisibilita<T>>(
  righe: R[], filtri: FiltriProposta<T>, toccate: ReadonlySet<string>,
  mostraSempre?: ReadonlySet<string>,
): R[] {
  return righe.filter((r) => !r.richiestaInCorso && (toccate.has(r.cliente_id) || !!mostraSempre?.has(r.cliente_id) || passaFiltriProposta(r, filtri)));
}

/** Spunta iniziale: tutte le righe proponibili partono incluse, anche con anomalie. */
export function inclusoInizialeProposta(proponibile: boolean): boolean {
  return proponibile;
}

/** Evidenza "Controlla": riga con segnalazioni arancioni/rosse (fonti: segnalazioniAnomalia/anomaliaRossa). */
export type LivelloControllo = "rossa" | "arancione" | null;
export function livelloControlloProposta(nAnomalie: number, rossa: boolean): LivelloControllo {
  if (rossa) return "rossa";
  return nAnomalie > 0 ? "arancione" : null;
}

/** Motivo per cui una riga proponibile è nascosta: stessa sequenza di passaFiltriProposta. */
export type MotivoNascosto = "rinnovo" | "tipo_spento" | "in_corso";

export function motivoNascostoProposta<T extends string>(
  r: RigaVisibilita<T>, f: FiltriProposta<T>,
): MotivoNascosto | null {
  if (r.richiestaInCorso) return "in_corso";
  if (!f.tipi.includes(r.tipo)) return r.tipo === "rinnovo" ? "rinnovo" : "tipo_spento";
  return null;
}

export interface RiepilogoVisibilita {
  totale: number;
  visibili: number;
  /** Rinnovi nascosti con alert o anomalie, senza richiesta in corso. */
  daDecidere: number;
  /** Gruppi canonici senza duplicati per cliente; alert aperti contati separatamente. */
  daDeciderePerMotivo: Record<string, number>;
  nascosti: Record<MotivoNascosto, number>;
  /** Tipi spenti nel filtro, per tipo (nuovo_fido, aumento, diminuzione…). */
  tipiSpenti: Record<string, number>;
  nonProponibili: Record<string, number>;
  nonProponibiliTotale: number;
}

/** Conteggi per il riquadro "cosa stai vedendo": visibili + nascosti + non proponibili = totale. */
export function riepilogoVisibilita<T extends string, R extends RigaVisibilita<T> & { proponibile: boolean }>(
  righe: R[], filtri: FiltriProposta<T>, toccate: ReadonlySet<string>,
  mostraSempre?: ReadonlySet<string>,
): RiepilogoVisibilita {
  const nascosti: Record<MotivoNascosto, number> = { rinnovo: 0, tipo_spento: 0, in_corso: 0 };
  const tipiSpenti: Record<string, number> = {};
  const nonProponibili: Record<string, number> = {};
  const daDeciderePerMotivo: Record<string, number> = {};
  let visibili = 0, daDecidere = 0, nonProponibiliTotale = 0;
  for (const r of righe) {
    if (!r.proponibile) {
      nonProponibili[r.regola] = (nonProponibili[r.regola] ?? 0) + 1;
      nonProponibiliTotale++;
      continue;
    }
    const m = r.richiestaInCorso ? "in_corso" : toccate.has(r.cliente_id) || mostraSempre?.has(r.cliente_id) ? null : motivoNascostoProposta(r, filtri);
    if (!m) { visibili++; continue; }
    if (m === "rinnovo" && daValutareProposta(r)) {
      daDecidere++;
      const motivi = etichetteSegnalazioni(segnalazioniAnomalia(r.segnalazioni));
      if (r.alertAperto) motivi.push("alert_aperto");
      for (const motivo of motivi) daDeciderePerMotivo[motivo] = (daDeciderePerMotivo[motivo] ?? 0) + 1;
    }
    nascosti[m]++;
    if (m === "tipo_spento") tipiSpenti[r.tipo] = (tipiSpenti[r.tipo] ?? 0) + 1;
  }
  return { totale: righe.length, visibili, daDecidere, daDeciderePerMotivo, nascosti, tipiSpenti, nonProponibili, nonProponibiliTotale };
}
