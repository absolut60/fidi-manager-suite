import { anomaliaRossa, etichetteSegnalazioni } from "@/lib/fido-segnalazioni";

/**
 * Visibilità delle righe nella proposta fido massiva.
 * Le righe toccate dall'utente restano visibili (e nella stessa posizione) finché
 * non cambiano i filtri: così una riga non sparisce mentre la si modifica.
 */
export interface FiltriProposta<T extends string = string> {
  tipi: (T | "rinnovo_da_guardare")[];
}

export type CategoriaProposta = "nuovo_fido" | "aumento" | "diminuzione" | "rinnovo_da_guardare" | "rinnovo";
export const CATEGORIE_PROPOSTA_DEFAULT: CategoriaProposta[] = ["aumento", "diminuzione", "nuovo_fido", "rinnovo_da_guardare"];

export interface RigaVisibilita<T extends string = string> {
  cliente_id: string;
  tipo: T;
  regola: string;
  fido_proposto: number;
  fido_attuale?: number;
  richiestaInCorso?: unknown;
  segnalazioni?: string[];
  /** Solo alert di consumo con statoEffettivoAlert = aperto. */
  alertAperto?: boolean;
}

/** Solo consumo effettivamente aperto o rosso con fido Gamma positivo; zero su zero mai da guardare. */
export function daValutareProposta<T extends string>(r: RigaVisibilita<T>): boolean {
  if (r.fido_proposto === 0 && r.fido_attuale === 0) return false;
  return r.tipo === "rinnovo" && (!!r.alertAperto || (anomaliaRossa(r.segnalazioni) && Number(r.fido_attuale ?? 0) > 0));
}

export function categoriaProposta<T extends string>(r: RigaVisibilita<T>): T | "rinnovo_da_guardare" {
  return daValutareProposta(r) ? "rinnovo_da_guardare" : r.tipo;
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

/** Rosse non spuntate, salvo riduzioni a zero di bloccati/legali; nessuna modifica agli importi. */
export function inclusoInizialeProposta({ proponibile, rossa, regola, fidoAttuale, fidoProposto }: {
  proponibile: boolean;
  rossa: boolean;
  regola: string;
  fidoAttuale: number;
  fidoProposto: number;
}): boolean {
  const azzeramentoBloccatoLegale = (regola === "cliente_bloccato" || regola === "gestione_legale")
    && fidoAttuale > 0 && fidoProposto === 0;
  return proponibile && (!rossa || azzeramentoBloccatoLegale);
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
  const categoria = categoriaProposta(r);
  if (!f.tipi.includes(categoria)) return categoria === "rinnovo" ? "rinnovo" : "tipo_spento";
  return null;
}

export interface RiepilogoVisibilita {
  totale: number;
  visibili: number;
  /** Rinnovi da guardare proponibili, senza richiesta in corso, anche quando visibili. */
  daDecidere: number;
  altriRinnovi: number;
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
  let visibili = 0, daDecidere = 0, altriRinnovi = 0, nonProponibiliTotale = 0;
  for (const r of righe) {
    if (!r.proponibile) {
      nonProponibili[r.regola] = (nonProponibili[r.regola] ?? 0) + 1;
      nonProponibiliTotale++;
      continue;
    }
    if (!r.richiestaInCorso && daValutareProposta(r)) {
      daDecidere++;
      const motivi = etichetteSegnalazioni((r.segnalazioni ?? []).filter((c) => anomaliaRossa([c])));
      if (r.alertAperto) motivi.push("alert_aperto");
      for (const motivo of motivi) daDeciderePerMotivo[motivo] = (daDeciderePerMotivo[motivo] ?? 0) + 1;
    }
    if (!r.richiestaInCorso && categoriaProposta(r) === "rinnovo") altriRinnovi++;
    const m = r.richiestaInCorso ? "in_corso" : toccate.has(r.cliente_id) || mostraSempre?.has(r.cliente_id) ? null : motivoNascostoProposta(r, filtri);
    if (!m) { visibili++; continue; }
    nascosti[m]++;
    if (m === "tipo_spento") {
      const categoria = categoriaProposta(r);
      tipiSpenti[categoria] = (tipiSpenti[categoria] ?? 0) + 1;
    }
  }
  return { totale: righe.length, visibili, daDecidere, altriRinnovi, daDeciderePerMotivo, nascosti, tipiSpenti, nonProponibili, nonProponibiliTotale };
}

/** Frasi brevi per i gruppi canonici, senza copiare la classificazione delle segnalazioni. */
export function testoMotivoDaGuardare(motivo: string, numero: number): string {
  const singolare = numero === 1;
  if (motivo === "alert_aperto") return singolare ? "ha quasi finito il fido (alert aperto)" : "hanno quasi finito il fido (alert aperto)";
  if (etichetteSegnalazioni(["oltre_normale"]).includes(motivo)) return singolare ? "è molto sopra il suo normale" : "sono molto sopra il loro normale";
  if (etichetteSegnalazioni(["impegni_sopra_base"]).includes(motivo)) return `${singolare ? "compra" : "comprano"} più del solito (${motivo})`;
  if (etichetteSegnalazioni(["scaduto_non_incassato", "scaduto_da_incassare"]).includes(motivo)) return `${singolare ? "ha" : "hanno"} scaduto non pagato`;
  if (etichetteSegnalazioni(["bloccato"]).includes(motivo)) return singolare ? "è bloccato" : "sono bloccati";
  return motivo;
}
