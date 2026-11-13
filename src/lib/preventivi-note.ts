import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type NotaPreventivo = Database["public"]["Tables"]["preventivi_note"]["Row"];
export function campiNota(titolo: string, testo: string) {
  const pulito = titolo.trim();
  if (!pulito) throw new Error("Inserisci il titolo della nota");
  return { titolo: pulito, testo: testo || null };
}
export const noteDaCopiare = (note: Pick<NotaPreventivo, "titolo" | "testo" | "ordine">[], preventivoId: string) =>
  note.map(({ titolo, testo, ordine }) => ({ preventivo_id: preventivoId, titolo, testo, ordine }));
export const chiaveNotePreventivo = (id: string) => ["preventivi-note", id] as const;
export async function fetchNotePreventivo(id: string): Promise<NotaPreventivo[]> {
  const { data, error } = await supabase.from("preventivi_note").select("*").eq("preventivo_id", id).order("ordine").order("created_at");
  if (error) throw error;
  return data ?? [];
}
export async function salvaNotaPreventivo(preventivoId: string, nota: { id?: string; titolo: string; testo: string; ordine: number | null }) {
  const campi = { ...campiNota(nota.titolo, nota.testo), ordine: nota.ordine };
  const query = nota.id
    ? supabase.from("preventivi_note").update(campi).eq("id", nota.id).eq("preventivo_id", preventivoId)
    : supabase.from("preventivi_note").insert({ ...campi, preventivo_id: preventivoId });
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}
export async function eliminaNotaPreventivo(preventivoId: string, id: string) {
  const { error } = await supabase.from("preventivi_note").delete().eq("id", id).eq("preventivo_id", preventivoId);
  if (error) throw error;
}
export async function copiaNotePreventivo(sourceId: string, destinationId: string) {
  const note = await fetchNotePreventivo(sourceId);
  if (!note.length) return;
  const { error } = await supabase.from("preventivi_note").insert(noteDaCopiare(note, destinationId));
  if (error) throw error;
}
