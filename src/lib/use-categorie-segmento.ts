import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CategoriaSegmento = {
  id: string;
  codice: string;
  label: string;
  parent_id: string | null;
};

export function useCategorieSegmento(dimensione: "mestiere" | "settore") {
  return useQuery({
    queryKey: ["categorie-segmento", dimensione],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorie_segmento")
        .select("id, codice, label, parent_id")
        .eq("dimensione", dimensione)
        .eq("attivo", true)
        .order("ordine");
      if (error) throw error;
      return (data ?? []) as CategoriaSegmento[];
    },
    staleTime: 5 * 60_000,
  });
}
