/**
 * Fonte UNICA del "fido proposto" lato client.
 * Tutto ciò che mostra un fido teorico (scheda cliente, proposta massiva,
 * richiesta singola, lista clienti) legge il precalcolo persistente
 * public.fido_teorico_cliente, che da FM55 pubblica i valori v2. Nessun calcolo locale.
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

/** Fido teorico per tutte le richieste: una sola fonte, regole non proponibili invariate. */
export async function fetchFidoTeoricoPerRichiesta(
  clienteIds: string[],
  _userId: string | null | undefined,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const m = await fetchFidoTeorico(clienteIds);
  for (const [id, r] of m) out.set(id, isProponibile(r.regola_applicata) ? r.fido_proposto : null);
  return out;
}
