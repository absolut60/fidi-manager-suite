import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type SoggettoTabPreventivi = { tipo: "cliente" | "lead"; id: string; etichetta: string };
export type PreventivoSoggetto = Pick<Database["public"]["Tables"]["preventivi"]["Row"],
  "id" | "tipo" | "tipo_doc" | "numero" | "data" | "titolo" | "stato" | "totale" | "lead_origine_id" | "linea">;
// tipo_doc serve al badge canonico della lista, tipo distingue preventivo/ordine.
const SELECT = "id, tipo, tipo_doc, numero, data, titolo, stato, totale, lead_origine_id, linea";

export async function fetchPreventiviSoggetto(soggetto: SoggettoTabPreventivi, originati = false): Promise<PreventivoSoggetto[]> {
  if (originati && soggetto.tipo !== "lead") return [];
  const colonna = originati ? "lead_origine_id" : soggetto.tipo === "cliente" ? "cliente_id" : "lead_id";
  const { data, error } = await supabase.from("preventivi").select(SELECT).eq(colonna, soggetto.id)
    .order("data", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw new Error("Impossibile caricare i preventivi. Riprova.");
  return data ?? [];
}