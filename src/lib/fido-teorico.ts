/**
 * Fonte UNICA del "fido proposto" lato client.
 * Tutto ciò che mostra un fido teorico (scheda cliente, proposta massiva,
 * richiesta singola, lista clienti) deve passare da qui: la RPC canonica
 * public.get_fido_teorico. Nessun calcolo locale.
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
};

/** Spiegazione in chiaro del coefficiente di comportamento. */
export function motivoCoefficiente(r: {
  coefficiente: number;
  giorni_oltre_accordo: number;
  profilo_pagamento: "sano" | "patologico";
}): string {
  const gg =
    r.giorni_oltre_accordo <= 0
      ? "pagamenti nei termini concordati"
      : `${r.giorni_oltre_accordo} giorni oltre l'accordo`;
  const profilo =
    r.profilo_pagamento === "patologico"
      ? "scaduto patologico (insoluti o ritardi oltre 60 giorni)"
      : "scaduto fisiologico";
  return `${gg} · ${profilo}`;
}


/** Etichetta breve, per tabelle e badge. */
export const REGOLA_LABEL: Record<string, string> = {
  sede_esclusa: "Sede esclusa",
  esclusa_gruppo: "Società del gruppo",
  cliente_bloccato: "Cliente bloccato",
  gestione_legale: "In gestione legale",
  condizione_mancante: "Condizione di pagamento mancante",
  nessun_fatturato: "Nessun fatturato",
  minimo_500: "Minimo 500",
  pagamento_immediato: "Pagamento immediato",
  fascia_500: "Fascia 500",
  fascia_5000: "Fascia 5.000",
};

/** Descrizione estesa, per il blocco informativo nella scheda cliente. */
export const REGOLA_DESCRIZIONE: Record<string, string> = {
  sede_esclusa: "Sede esclusa dal calcolo — fido attuale invariato",
  esclusa_gruppo: "Società del gruppo esclusa dal calcolo — fido attuale invariato",
  cliente_bloccato: "Cliente bloccato — nessuna proposta di fido",
  gestione_legale: "Cliente in gestione legale — nessuna proposta di fido",
  condizione_mancante: "Condizione di pagamento mancante in anagrafica — impossibile calcolare",
  nessun_fatturato: "Nessun fatturato nella finestra di calcolo",
  minimo_500: "Fatturato solo nell'anno precedente — minimo 500 €",
  pagamento_immediato: "Pagamento immediato (contanti/POS/assegno) — nessuna esposizione, fido non necessario",
  fascia_500: "Fido base ≤ 5.000 € — arrotondato per eccesso a 500 €",
  fascia_5000: "Fido base > 5.000 € — arrotondato al multiplo di 5.000 € più vicino",
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

function normalizza(r: any): FidoTeoricoRow {
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
  };

}

const CHUNK = 500;

/** Fido teorico per un insieme di clienti. Le chiamate sono paginate a 500 id. */
export async function fetchFidoTeorico(
  clienteIds: string[],
): Promise<Map<string, FidoTeoricoRow>> {
  const map = new Map<string, FidoTeoricoRow>();
  const ids = Array.from(new Set(clienteIds.filter(Boolean)));
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await (supabase as any)
      .rpc("get_fido_teorico", { _cliente_ids: chunk })
      .range(0, CHUNK - 1);
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

