import { anomaliaRossa, etichetteSegnalazioni } from "@/lib/fido-segnalazioni";
import { arrotondaFidoV2, fidoPerTornareSottoSoglia, type ExtraFidoProtetto } from "@/lib/fido-teorico";
import { giaDeciso } from "@/lib/alert-fidi";

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
  /** Fonte SQL extra_fido_protetti: le protezioni scadute non sono restituite. */
  protezione?: ExtraFidoProtetto;
  /** Riferimento canonico della richiesta, non l'importo editabile della riga. */
  riferimentoRichiesta?: number | null;
}

/** Solo consumo effettivamente aperto o rosso con fido Gamma positivo; zero su zero mai da guardare. */
export function daValutareProposta<T extends string>(r: RigaVisibilita<T>): boolean {
  if (giaDeciso(r.protezione, r.riferimentoRichiesta, r.fido_attuale)) return false;
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

/** Rosse non spuntate, salvo riduzioni a zero di bloccati/legali; scaduto non incassato portato a zero
 *  da un fido > 0 sempre non spuntato (va valutato); nessuna modifica agli importi. */
export function inclusoInizialeProposta({ proponibile, rossa, regola, fidoAttuale, fidoProposto, segnalazioni }: {
  proponibile: boolean;
  rossa: boolean;
  regola: string;
  fidoAttuale: number;
  fidoProposto: number;
  segnalazioni?: readonly string[] | null;
}): boolean {
  // Bloccato/legale resta spuntato a zero anche in presenza di scaduto.
  const azzeramentoBloccatoLegale = (regola === "cliente_bloccato" || regola === "gestione_legale" || !!segnalazioni?.includes("bloccato"))
    && fidoAttuale > 0 && fidoProposto === 0;
  const azzeramentoScaduto = motivoRigaProposta({ regola, segnalazioni }).motivo === "scaduto" && fidoAttuale > 0 && fidoProposto === 0;
  if (azzeramentoScaduto && !azzeramentoBloccatoLegale) return false;
  return proponibile && (!rossa || azzeramentoBloccatoLegale);
}

/**
 * Motivo principale della riga (fonte unica: colore, etichetta e spunta iniziale).
 * Priorità se più motivi: bloccato/legale > scaduto > da autorizzare > ordini.
 * Il motivo vincente decide colore ed etichetta; gli altri restano solo nei dettagli.
 */
export type MotivoRigaProposta = "scaduto" | "bloccato" | "legale" | "da_autorizzare" | "ordini_oltre_fido" | null;

export function motivoRigaProposta({ regola, segnalazioni, dati }: {
  regola: string;
  segnalazioni?: readonly string[] | null;
  dati?: {
    fidoAttuale: number;
    consigliato: number;
    esposizione_corrente: number;
    ordini_aperti?: number | null;
    scaduto_oltre?: number | null;
    scaduto_oltre_giorni?: number | null;
    acquisto_mensile?: number | null;
    ciclo_gg?: number | null;
    valore_senza_tetto?: number | null;
    spiegazione?: string | null;
  };
}): { motivo: MotivoRigaProposta; frase: string | null; perCoprire: number | null } {
  const s = segnalazioni ?? [];
  const motivo: MotivoRigaProposta = regola === "cliente_bloccato" || s.includes("bloccato") ? "bloccato"
    : regola === "gestione_legale" ? "legale"
    : regola === "scaduto_non_incassato" || s.includes("scaduto_non_incassato") ? "scaduto"
    : s.includes("oltre_normale") ? "da_autorizzare"
    : s.includes("ordini_oltre_fido") ? "ordini_oltre_fido" : null;
  if (!dati) return { motivo, frase: null, perCoprire: null };
  const euro = (n: number) => `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" } as unknown as Intl.NumberFormatOptions).format(Math.round(n))} €`;
  const ordini = Number(dati.ordini_aperti ?? 0);
  // Confronto informativo fisso all'80%, mai usato per importi o spunte.
  const perCoprire = fidoPerTornareSottoSoglia(dati.esposizione_corrente + ordini, 0.80);
  let frase: string | null = null;
  if (motivo === "bloccato") frase = "Cliente bloccato: proposta a zero.";
  else if (motivo === "legale") frase = "Cliente in legale: proposta a zero.";
  else if (motivo === "scaduto") {
    // Importo e giorni dello scaduto restano solo nei dettagli.
    frase = Number(dati.consigliato) === 0
      ? "Cliente con scaduto: proposta a zero."
      : `Cliente con scaduto: fido già confermato a ${euro(dati.consigliato)}.`;
  } else if (motivo === "da_autorizzare") frase = `Compra molto più del solito: per coprirlo servono ${euro(perCoprire)}.`;
  else if (motivo === "ordini_oltre_fido") frase = `Ordini in arrivo ${euro(ordini)}: con la consegna supera il fido.`;
  // FM55 fetta 6: il DB (get_fido_teorico_v2 + public.cliente_attivo) certifica il non attivo nella spiegazione.
  // Riga bianca (nessun motivo), spunta invariata: non è un'anomalia.
  else if (Number(dati.consigliato) === 0 && /^Cliente non attivo:/.test(dati.spiegazione ?? "")) frase = "Cliente non attivo: proposta a zero.";
  else if (dati.consigliato < dati.fidoAttuale) {
    // Il DB certifica il freno nella spiegazione; mt.valore è il valore prima del freno.
    // Non ricostruiamo qui profili, margini o il picco.
    const frenoOrdini = /Ha ordini aperti per/.test(dati.spiegazione ?? "");
    const frenoPicco = /Negli ultimi 30 giorni è arrivato a doverci/.test(dati.spiegazione ?? "");
    const prima = dati.valore_senza_tetto == null ? null : arrotondaFidoV2(dati.valore_senza_tetto);
    frase = (frenoOrdini || frenoPicco) && prima != null && prima < dati.consigliato
      ? `Ne basterebbero ${euro(prima)}, ma ${frenoOrdini ? "con gli ordini in arrivo" : "per quanto ci doveva negli ultimi 30 giorni"} servono ${euro(dati.consigliato)}.`
      : `Usa meno fido del solito: ne bastano ${euro(dati.consigliato)}.`;
  } else if (Number(dati.acquisto_mensile ?? 0) > 0 && dati.ciclo_gg != null) {
    frase = `Paga in ${Math.round(dati.ciclo_gg).toLocaleString("it-IT")} giorni.`;
  }
  // Coda su tutte le righe: acquisto medio arrotondato alle centinaia.
  const acquisto = Number(dati.acquisto_mensile ?? 0);
  const coda = acquisto > 0 ? `Compra in media ${euro(Math.max(100, Math.round(acquisto / 100) * 100))} al mese.` : "Nessun acquisto recente.";
  frase = frase ? `${frase} ${coda}` : coda;
  return { motivo, frase, perCoprire };
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
  /** Sottoinsieme dei rinnovi nascosti già decisi, raggruppato per fine protezione. */
  giaDecisiPerScadenza: Record<string, number>;
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
  const giaDecisiPerScadenza: Record<string, number> = {};
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
    if (m === "rinnovo" && giaDeciso(r.protezione, r.riferimentoRichiesta, r.fido_attuale) && r.protezione) {
      const fino = r.protezione.protetto_fino_al.slice(0, 10);
      giaDecisiPerScadenza[fino] = (giaDecisiPerScadenza[fino] ?? 0) + 1;
    }
    if (m === "tipo_spento") {
      const categoria = categoriaProposta(r);
      tipiSpenti[categoria] = (tipiSpenti[categoria] ?? 0) + 1;
    }
  }
  return { totale: righe.length, visibili, daDecidere, altriRinnovi, daDeciderePerMotivo, nascosti, tipiSpenti, giaDecisiPerScadenza, nonProponibili, nonProponibiliTotale };
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
