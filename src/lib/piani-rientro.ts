// Piani di rientro — tipi condivisi e helper client-side.
// Le tabelle sono nuove: usiamo `as never` sui .from() finché
// i tipi Supabase non sono rigenerati (stesso pattern di assicurazioni_credito).
import { supabase } from "@/integrations/supabase/client";

export type PianoStato = "attivo" | "completato" | "non_rispettato" | "annullato";
export type RataStato = "da_pagare" | "pagata" | "saltata";

export type PianoRientro = {
  id: string;
  cliente_id: string;
  livello: 1 | 2;
  stato: PianoStato;
  note: string | null;
  creato_da: string | null;
  created_at: string;
  updated_at: string;
};

export type PianoDocumento = {
  piano_id: string;
  scadenza_id: string;
  importo_alla_selezione: number | null;
  created_at: string;
};

export type PianoRata = {
  id: string;
  piano_id: string;
  numero_rata: number;
  data_rata: string;
  importo: number;
  stato: RataStato;
  data_pagamento_confermata: string | null;
  note: string | null;
  reminder_inviato_il: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------- Queries ----------------

export async function fetchPianiCliente(clienteId: string): Promise<PianoRientro[]> {
  const { data, error } = await supabase
    .from("piani_rientro" as never)
    .select("*")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PianoRientro[];
}

export async function fetchPiano(pianoId: string): Promise<PianoRientro | null> {
  const { data, error } = await supabase
    .from("piani_rientro" as never)
    .select("*")
    .eq("id", pianoId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PianoRientro | null) ?? null;
}

export async function fetchRatePiano(pianoId: string): Promise<PianoRata[]> {
  const { data, error } = await supabase
    .from("piani_rientro_rate" as never)
    .select("*")
    .eq("piano_id", pianoId)
    .order("numero_rata", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PianoRata[];
}

export async function fetchDocumentiPiano(pianoId: string): Promise<Array<PianoDocumento & { scadenza: {
  id: string; numero_documento: string | null; data_scadenza: string | null;
  importo_scadenza: number | null; data_pagamento_effettiva: string | null;
  importo_pagato: number | null;
}}>> {
  const { data, error } = await supabase
    .from("piani_rientro_documenti" as never)
    .select("piano_id, scadenza_id, importo_alla_selezione, created_at, scadenza:scadenze(id, numero_documento, data_scadenza, importo_scadenza, data_pagamento_effettiva, importo_pagato)")
    .eq("piano_id", pianoId);
  if (error) throw error;
  return (data ?? []) as never;
}

export function fmtEuro(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
}
export function fmtDate(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("it-IT"); } catch { return String(v); }
}

/** Rata "prossima da pagare" del piano (la più vecchia con stato da_pagare). */
export function prossimaRata(rate: PianoRata[]): PianoRata | null {
  const dp = rate.filter((r) => r.stato === "da_pagare");
  if (dp.length === 0) return null;
  return [...dp].sort((a, b) => a.data_rata.localeCompare(b.data_rata))[0];
}

/** Calcola l'incasso rilevato sui documenti del piano — usato per la proposta
 *  automatica "possibile pagamento rilevato" sulla prossima rata. */
export function totaleIncassatoDocumenti(docs: Array<{ scadenza: { importo_pagato: number | null; data_pagamento_effettiva: string | null } }>): number {
  return docs
    .filter((d) => d.scadenza.data_pagamento_effettiva != null)
    .reduce((acc, d) => acc + Number(d.scadenza.importo_pagato ?? 0), 0);
}
