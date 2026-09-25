import { supabase } from "@/integrations/supabase/client";

export type Notifica = {
  id: string;
  tipo: string;
  titolo: string;
  messaggio: string | null;
  link: string | null;
  letta: boolean;
  conteggio: number;
  created_at: string;
  aggiornata_at: string;
};

export const notificheNonLetteQueryKey = (userId: string | undefined) => [
  "notifiche",
  "non-lette",
  userId ?? "anonimo",
] as const;

export async function contaNonLette(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifiche")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("letta", false);

  if (error) throw error;
  return count ?? 0;
}
