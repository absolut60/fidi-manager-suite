/**
 * Fonte UNICA del "fido proposto" lato client.
 * Tutto ciò che mostra un fido teorico (scheda cliente, proposta massiva,
 * richiesta singola, lista clienti) legge il precalcolo persistente
 * public.fido_teorico_cliente, che da FM55 pubblica i valori v2.
 * Solo il riferimento delle richieste applica la protezione delle riduzioni qui sotto;
 * il fido teorico pubblicato e la scheda cliente restano invariati.
 */
import { supabase } from "@/integrations/supabase/client";

export type FidoTeoricoRow = {
  cliente_id: string;
  fatturato_rolling: number;
  ritmo_mensile: number;
  fido_attuale: number;
  fido_base: number;
  fido_base_lordo: number;
  ddt_da_fatturare: number;
  giorni_oltre_accordo: number;
  profilo_pagamento: "sano" | "patologico";
  coefficiente: number;
  fido_proposto: number;
  fido_proposto_senza_coefficiente: number;
  giorni: number;
  giorni_mancanti: boolean;
  regola_applicata: string;
  scostamento: number;
  sede_cinisello: boolean;
  richiede_verifica: boolean;
  nota_proposta: string;
  fido_teorico_puro: number;
  pavimento_applicato: boolean;
  esposizione_corrente: number;
  acquisto_storico: number | null;
  acquisto_tendenza: number | null;
  acquisto_mensile: number | null;
  ciclo_gg: number | null;
  mesi_stagionali: number | null;
  profilo: string | null;
  base: number | null;
  ordini_aperti: number | null;
  fabbisogno: number | null;
  consumo_perc: number | null;
  spiegazione: string | null;
  scaduto_oltre: number;
  scaduto_oltre_giorni: number;
  /** Incassato reale ultimi 12 mesi (public.scaduto_oltre_giorni). */
  pagato_12m: number;
  /** FM55 fetta 3A: ordini oltre N mesi di acquisti, tetto (base × fido_v2_tetto_base) e valore prima del tetto. */
  ordini_fuori: number;
  tetto: number | null;
  valore_senza_tetto: number | null;
  /** Codici di segnalazione pubblicati da public.segnalazioni_fido (v. fido-segnalazioni.ts). */
  segnalazioni: string[];
};

/** Spiegazione in chiaro del coefficiente di comportamento. */
export function motivoCoefficiente(r: { profilo: string | null }): string {
  return r.profilo ? PROFILO_FIDO_LABEL[r.profilo] ?? r.profilo : "Profilo non disponibile";
}

/** Etichetta breve, per tabelle e badge. */
export const REGOLA_LABEL: Record<string, string> = {
  calcolo: "Calcolo standard",
  sede_esclusa: "Sede esclusa",
  esclusa_gruppo: "Società del gruppo",
  cliente_bloccato: "Cliente bloccato",
  gestione_legale: "In gestione legale",
  scaduto_non_incassato: "Scaduto non incassato",
  condizione_mancante: "Condizione di pagamento mancante",
  nessun_fatturato: "Nessun fatturato",
  minimo_500: "Minimo 500",
  pagamento_immediato: "Pagamento immediato",
  nuovo_con_ddt: "Nuovo con merce da fatturare",
  fascia_500: "Fino a 5.000",
  fascia_5000: "Oltre 5.000",
};

/** Descrizione estesa, per il blocco informativo nella scheda cliente. */
export const REGOLA_DESCRIZIONE: Record<string, string> = {
  calcolo: "Calcolo su acquisti, stagionalità, giorni di pagamento e puntualità",
  sede_esclusa: "Sede esclusa dal calcolo — fido attuale invariato",
  esclusa_gruppo: "Società del gruppo esclusa dal calcolo — fido attuale invariato",
  cliente_bloccato: "Cliente bloccato — nessuna proposta di fido",
  gestione_legale: "Cliente in gestione legale — nessuna proposta di fido",
  scaduto_non_incassato: "Scaduto non incassato oltre soglia — fido a zero finché lo scaduto non rientra",
  condizione_mancante: "Condizione di pagamento mancante in anagrafica — impossibile calcolare",
  nessun_fatturato: "Nessun fatturato nella finestra di calcolo",
  minimo_500: "Fatturato solo nell'anno precedente — minimo 500 €",
  pagamento_immediato: "Pagamento immediato (contanti/POS/assegno) — nessuna esposizione, fido non necessario",
  nuovo_con_ddt:
    "Nessuno storico di fatturato ma merce già consegnata da fatturare — proposta basata sui documenti da fatturare, da verificare",
  fascia_500: "Fido base ≤ 5.000 € — arrotondato per eccesso (500 fino a 1.000 €, poi 1.000)",
  fascia_5000: "Fido base > 5.000 € — arrotondato per eccesso (5.000 fino a 50.000 €, poi 10.000)",
};

/** Regole per cui NON si può proporre un fido (né in massa né singolarmente). */
export const REGOLE_NON_PROPONIBILI = new Set([
  "condizione_mancante",
  "sede_esclusa",
  "esclusa_gruppo",
]);

export const MOTIVO_NON_PROPONIBILE: Record<string, string> = {
  condizione_mancante: "Condizione di pagamento mancante: importo non calcolabile",
  sede_esclusa: "Sede esclusa dal calcolo del fido teorico",
  esclusa_gruppo: "Società del gruppo: esclusa volutamente dal calcolo",
};

/** Etichette brevi dei motivi di non proponibilità (riquadro della proposta massiva: "3 senza condizione di pagamento"). */
export const MOTIVO_NON_PROPONIBILE_BREVE: Record<string, string> = {
  condizione_mancante: "senza condizione di pagamento",
  sede_esclusa: "di sede esclusa dal calcolo",
  esclusa_gruppo: "società del gruppo",
};

export function isProponibile(regola: string | null | undefined): boolean {
  return !!regola && !REGOLE_NON_PROPONIBILI.has(regola);
}

export function normalizza(r: any): FidoTeoricoRow {
  return {
    cliente_id: String(r.cliente_id),
    fatturato_rolling: Number(r.fatturato_rolling ?? 0),
    ritmo_mensile: Number(r.ritmo_mensile ?? 0),
    fido_attuale: Number(r.fido_attuale ?? 0),
    fido_base: Number(r.fido_base ?? 0),
    fido_base_lordo: Number(r.fido_base_lordo ?? r.fido_base ?? 0),
    ddt_da_fatturare: Number(r.ddt_da_fatturare ?? 0),
    giorni_oltre_accordo: Number(r.giorni_oltre_accordo ?? 0),
    profilo_pagamento: r.profilo_pagamento === "patologico" ? "patologico" : "sano",
    coefficiente: Number(r.coefficiente ?? 1),
    fido_proposto: Number(r.fido_proposto ?? 0),
    fido_proposto_senza_coefficiente: Number(
      r.fido_proposto_senza_coefficiente ?? r.fido_proposto ?? 0,
    ),
    giorni: Number(r.giorni ?? 0),
    giorni_mancanti: !!r.giorni_mancanti,
    regola_applicata: String(r.regola_applicata ?? ""),
    scostamento: Number(r.scostamento ?? 0),
    sede_cinisello: !!r.sede_cinisello,
    richiede_verifica: !!r.richiede_verifica,
    nota_proposta: String(r.nota_proposta ?? ""),
    fido_teorico_puro: Number(r.fido_teorico_puro ?? r.fido_proposto ?? 0),
    pavimento_applicato: !!r.pavimento_applicato,
    esposizione_corrente: Number(r.esposizione_corrente ?? 0),
    acquisto_storico: numOrNull(r.acquisto_storico),
    acquisto_tendenza: numOrNull(r.acquisto_tendenza),
    acquisto_mensile: numOrNull(r.acquisto_mensile),
    ciclo_gg: numOrNull(r.ciclo_gg),
    mesi_stagionali: numOrNull(r.mesi_stagionali),
    base: numOrNull(r.base),
    ordini_aperti: numOrNull(r.ordini_aperti),
    fabbisogno: numOrNull(r.fabbisogno),
    consumo_perc: numOrNull(r.consumo_perc),
    profilo: r.profilo ?? null,
    spiegazione: r.spiegazione ?? null,
    scaduto_oltre: Number(r.scaduto_oltre ?? 0),
    scaduto_oltre_giorni: Number(r.scaduto_oltre_giorni ?? 0),
    pagato_12m: Number(r.pagato_12m ?? 0),
    ordini_fuori: Number(r.ordini_fuori ?? 0),
    tetto: numOrNull(r.tetto),
    valore_senza_tetto: numOrNull(r.valore_senza_tetto),
    segnalazioni: Array.isArray(r.segnalazioni) ? r.segnalazioni.map(String) : [],
  };

}

const CHUNK = 500;

/** Fido teorico per un insieme di clienti. Legge il precalcolo persistente
 *  (fido_teorico_cliente) filtrando per id, a blocchi di 500. */
export async function fetchFidoTeorico(
  clienteIds: string[],
): Promise<Map<string, FidoTeoricoRow>> {
  const map = new Map<string, FidoTeoricoRow>();
  const ids = Array.from(new Set(clienteIds.filter(Boolean)));
  // Legge il precalcolo persistente (fido_teorico_cliente) invece della RPC live,
  // a blocchi di id per non superare i limiti della query string PostgREST.
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await (supabase as any)
      .from("fido_teorico_cliente")
      .select("*")
      .in("cliente_id", chunk);
    if (error) throw error;
    for (const r of ((data ?? []) as any[])) {
      const row = normalizza(r);
      map.set(row.cliente_id, row);
    }
  }
  return map;
}

/** Fido teorico per TUTTI i clienti (usato dalla lista per ordinare/filtrare).
 *  Legge il precalcolo persistente public.fido_teorico_cliente. */
export async function fetchFidoTeoricoTutti(): Promise<Map<string, FidoTeoricoRow>> {
  const map = new Map<string, FidoTeoricoRow>();
  let offset = 0;
  const size = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await (supabase as any)
      .from("fido_teorico_cliente")
      .select("*")
      .range(offset, offset + size - 1);
    if (error) throw error;
    const batch = ((data ?? []) as any[]);
    for (const r of batch) {
      const row = normalizza(r);
      map.set(row.cliente_id, row);
    }
    if (batch.length < size) break;
    offset += size;
    if (offset > 100000) break;
  }
  return map;
}


// ============================================================================
// FM55 — Vista dettagliata del fido teorico pubblicato per tutti
// ============================================================================

export type FidoTeoricoNuovoRow = {
  cliente_id: string;
  /** Riga canonica completa (per le segnalazioni). */
  riga: FidoTeoricoRow;
  acquisto_mensile: number | null;
  ciclo_gg: number | null;
  profilo: string | null;
  coefficiente: number | null;
  base: number | null;
  esposizione: number | null;
  ordini_aperti: number | null;
  fabbisogno: number | null;
  fido_proposto: number | null;
  fido_attuale: number | null;
  consumo_perc: number | null;
  regola: string | null;
  da_verificare: boolean | null;
  spiegazione: string | null;
  calcolato_at: string | null;
};

/** Etichette italiane dei profili di pagamento del fido nuovo (fonte unica). */
export const PROFILO_FIDO_LABEL: Record<string, string> = {
  puntuale: "Puntuale",
  ritardo_occasionale: "Ritardo occasionale",
  ritardo_abituale: "Ritardo abituale",
  ritardo_abituale_grave: "Ritardo abituale grave",
  insoluto_isolato: "Insoluto isolato",
  patologico_scaduto_fermo: "Patologico: scaduto fermo",
  patologico_insoluti_ripetuti: "Patologico: insoluti ripetuti",
  patologico_insoluto_pesante: "Patologico: insoluto pesante",
  dormiente: "Dormiente",
  perso: "Cliente perso",
  mai_acquistato: "Mai acquistato",
  nuovo_in_attesa: "Nuovo, in attesa del primo acquisto",
};

/** Motivazione automatica della proposta fido per profilo senza acquisti (fonte unica). */
export const MOTIVAZIONE_PROFILO_FIDO: Record<string, string> = {
  perso: "Cliente perso: nessun acquisto da oltre 18 mesi",
  mai_acquistato: "Cliente mai acquistato: fido non utilizzato",
  dormiente: "Cliente dormiente: fido ridotto al minimo di 500 €",
};

const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Riga canonica del cliente, adattata al contratto del riquadro dettagliato. */
export async function fetchFidoTeoricoNuovo(clienteId: string): Promise<FidoTeoricoNuovoRow | null> {
  const { data, error } = await (supabase as any)
    .from("fido_teorico_cliente")
    .select("*")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as any;
  return {
    cliente_id: r.cliente_id,
    riga: normalizza(r),
    acquisto_mensile: numOrNull(r.acquisto_mensile),
    ciclo_gg: numOrNull(r.ciclo_gg),
    profilo: r.profilo ?? null,
    coefficiente: numOrNull(r.coefficiente),
    base: numOrNull(r.base),
    esposizione: numOrNull(r.esposizione_corrente),
    ordini_aperti: numOrNull(r.ordini_aperti),
    fabbisogno: numOrNull(r.fabbisogno),
    fido_proposto: numOrNull(r.fido_proposto),
    fido_attuale: numOrNull(r.fido_attuale),
    consumo_perc: numOrNull(r.consumo_perc),
    regola: r.regola_applicata ?? null,
    da_verificare: r.richiede_verifica ?? null,
    spiegazione: r.spiegazione ?? null,
    calcolato_at: r.calcolato_at ?? null,
  };
}

/** Utenti abilitati all'anteprima: configurazioni.fido_v2_anteprima_utenti (id separati da virgola). */
export async function fetchUtentiAnteprimaFidoNuovo(): Promise<string[]> {
  const { data, error } = await supabase
    .from("configurazioni")
    .select("valore")
    .eq("chiave", "fido_v2_anteprima_utenti")
    .maybeSingle();
  if (error) throw error;
  return String(data?.valore ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ============================================================================
// FM55 — Fido teorico di riferimento per le RICHIESTE (fonte unica)
// ============================================================================

/** Gemello TS di public.arrotonda_fido_v2(numeric): oltre 5.000 sempre gradini di 5.000. */
export function arrotondaFidoV2(importo: number): number {
  if (importo <= 0) return 0;
  const passo = importo <= 1_000 ? 500 : importo <= 5_000 ? 1_000 : 5_000;
  return Math.ceil(importo / passo) * passo;
}

/** fido_riduzione_proposta — gemello della protezione SQL in aggiorna_alert_fidi.
 * Stesso debito/soglia e arrotonda_fido_v2; nelle richieste si conserva il teorico
 * negli aumenti e si limita la riduzione al fido attuale (al limite è un rinnovo).
 */
export function fidoPropostoPerRichiesta(
  fidoAttuale: number,
  teorico: number,
  debito: number,
  soglia = 0.80,
): number {
  if (!Number.isFinite(soglia) || soglia <= 0) throw new Error("Soglia di consumo del fido non valida");
  if (teorico >= fidoAttuale) return teorico;
  return Math.min(fidoAttuale, Math.max(teorico, arrotondaFidoV2(debito / soglia)));
}

export interface ExtraFidoProtetto {
  richiesta_id: string;
  importo_approvato: number;
  fido_teorico_riferimento: number;
  approvata_il: string;
  protetto_fino_al: string;
  /** Scaduto oltre soglia alla creazione della richiesta (null = richiesta precedente a FM55 3B). */
  scaduto_al_momento?: number | null;
  scaduto_attuale?: number;
  /** Calcolata solo da public.extra_fido_protetti (regola dello scaduto già noto). Assente = valida. */
  protezione_valida?: boolean;
}

/**
 * FM55: extra fido teorico approvato negli ultimi alert_fidi_extra_giorni.
 * Lettura della fonte unica SQL `extra_fido_protetti()`, usata anche da aggiorna_alert_fidi;
 * restituisce anche le protezioni decadute (protezione_valida = false) per mostrarne la nota.
 */
export async function fetchExtraFidoProtetti(clienteIds: string[]): Promise<Map<string, ExtraFidoProtetto>> {
  const out = new Map<string, ExtraFidoProtetto>();
  const ids = clienteIds.filter(Boolean);
  if (!ids.length) return out;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.rpc("extra_fido_protetti", { _cliente_ids: ids.slice(i, i + 200) });
    if (error) throw error;
    for (const r of data ?? []) {
      out.set(r.cliente_id, {
        richiesta_id: r.richiesta_id,
        importo_approvato: Number(r.importo_approvato),
        fido_teorico_riferimento: Number(r.fido_teorico_riferimento),
        approvata_il: r.approvata_il,
        protetto_fino_al: r.protetto_fino_al,
        scaduto_al_momento: r.scaduto_al_momento == null ? null : Number(r.scaduto_al_momento),
        scaduto_attuale: Number(r.scaduto_attuale ?? 0),
        protezione_valida: r.protezione_valida !== false,
      });
    }
  }
  return out;
}

/** Protezione in vigore: esiste e la regola SQL non l'ha fatta decadere. */
export function protezioneAttiva(protetto: ExtraFidoProtetto | undefined): protetto is ExtraFidoProtetto {
  return !!protetto && protetto.protezione_valida !== false;
}

/** Riferimento protetto: durante la protezione dell'extra non si scende sotto l'importo approvato. */
export function riferimentoConExtraProtetto(riferimento: number, protetto: ExtraFidoProtetto | undefined): number {
  return protezioneAttiva(protetto) ? Math.max(riferimento, protetto.importo_approvato) : riferimento;
}

/**
 * Riferimento della richiesta per una riga del teorico pubblicato.
 * Con regola 'scaduto_non_incassato' non si applica la protezione debito/soglia; l'extra approvato
 * resta protetto solo se lo scaduto era già noto alla decisione (protezione_valida da extra_fido_protetti).
 */
export function riferimentoRichiesta(
  r: { regola_applicata: string | null; fido_attuale: number; fido_proposto: number; esposizione_corrente: number; ordini_aperti?: number | null },
  soglia: number,
  protetto: ExtraFidoProtetto | undefined,
): number | null {
  if (!isProponibile(r.regola_applicata)) return null;
  if (r.regola_applicata === "scaduto_non_incassato") return riferimentoConExtraProtetto(r.fido_proposto, protetto);
  return riferimentoConExtraProtetto(
    fidoPropostoPerRichiesta(r.fido_attuale, r.fido_proposto, r.esposizione_corrente + (r.ordini_aperti ?? 0), soglia),
    protetto,
  );
}

const fmtGgMm = (iso: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(8, 10) + "/" + iso.slice(5, 7);
  return new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" });
};

/** Testo unico della nota dell'extra approvato (protetto, con scaduto noto, decaduto). */
export function notaExtraProtetto(p: ExtraFidoProtetto): { testo: string; decaduta: boolean } {
  const app = fmtGgMm(p.approvata_il);
  const fino = fmtGgMm(p.protetto_fino_al);
  const eur = (n: number) => formatEuro(n);
  if (p.protezione_valida === false) {
    return {
      decaduta: true,
      testo: `Approvato il ${app}, ma lo scaduto è salito da ${eur(p.scaduto_al_momento ?? 0)} a ${eur(p.scaduto_attuale ?? 0)}: protezione decaduta`,
    };
  }
  if ((p.scaduto_al_momento ?? 0) > 0) {
    return {
      decaduta: false,
      testo: `Approvato il ${app}: ${eur(p.importo_approvato)} con scaduto già noto di ${eur(p.scaduto_al_momento ?? 0)} (teorico ${eur(p.fido_teorico_riferimento)}) — protetto fino al ${fino}`,
    };
  }
  return {
    decaduta: false,
    testo: `Extra approvato il ${app}: ${eur(p.importo_approvato)} su teorico ${eur(p.fido_teorico_riferimento)} (+${eur(p.importo_approvato - p.fido_teorico_riferimento)}) — protetto fino al ${fino}`,
  };
}

/** Riferimento per tutte le richieste; non modifica il teorico pubblicato o le esclusioni. */
export async function fetchFidoTeoricoPerRichiesta(
  clienteIds: string[],
  _userId: string | null | undefined,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!clienteIds.some(Boolean)) return out;
  const [m, cfg, protetti] = await Promise.all([
    fetchFidoTeorico(clienteIds),
    supabase.from("configurazioni").select("valore").eq("chiave", "alert_fidi_soglia_1").maybeSingle(),
    fetchExtraFidoProtetti(clienteIds),
  ]);
  if (cfg.error) throw cfg.error;
  const valore = String(cfg.data?.valore ?? "").trim();
  const soglia = valore ? Number(valore) : 0.80;
  for (const [id, r] of m) {
    out.set(id, riferimentoRichiesta(r, soglia, protetti.get(id)));
  }
  return out;
}
