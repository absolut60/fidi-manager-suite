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
  fido_attuale: number;
  fido_base: number;
  fido_proposto: number;
  giorni: number;
  giorni_mancanti: boolean;
  regola_applicata: string;
  scostamento: number;
};

/** Etichetta breve, per tabelle e badge. */
export const REGOLA_LABEL: Record<string, string> = {
  sede_esclusa: "Sede esclusa",
  esclusa_gruppo: "Società del gruppo",
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
    fido_attuale: Number(r.fido_attuale ?? 0),
    fido_base: Number(r.fido_base ?? 0),
    fido_proposto: Number(r.fido_proposto ?? 0),
    giorni: Number(r.giorni ?? 0),
    giorni_mancanti: !!r.giorni_mancanti,
    regola_applicata: String(r.regola_applicata ?? ""),
    scostamento: Number(r.scostamento ?? 0),
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

/** Fido teorico per TUTTI i clienti (usato dalla lista per ordinare/filtrare). */
export async function fetchFidoTeoricoTutti(): Promise<Map<string, FidoTeoricoRow>> {
  const map = new Map<string, FidoTeoricoRow>();
  let offset = 0;
  const size = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await (supabase as any)
      .rpc("get_fido_teorico", {})
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
