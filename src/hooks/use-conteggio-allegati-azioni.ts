import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const conteggioAllegatiAzioniKey = (clienteId: string) => ["conteggio-allegati-azioni", clienteId] as const;

/** Un'unica lettura per tutti gli id del cliente; record serializzabile, non Map. */
export function useConteggioAllegatiAzioni(clienteId: string, ids: string[]) {
  const ordinati = [...new Set(ids)].sort();
  return useQuery({
    queryKey: [...conteggioAllegatiAzioniKey(clienteId), ordinati],
    enabled: ordinati.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("allegati")
        .select("entita_id")
        .eq("entita_tipo", "azione_recupero")
        .in("entita_id", ordinati);
      if (error) throw error;
      const conteggi: Record<string, number> = {};
      for (const r of data ?? []) conteggi[r.entita_id] = (conteggi[r.entita_id] ?? 0) + 1;
      return conteggi;
    },
  });
}