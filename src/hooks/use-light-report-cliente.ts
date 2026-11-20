import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { idSoggettoDiEntita } from "@/lib/cerved/cerved-letture";

/** Dati del Light Report (normalizzaLightReportXml) salvati nell'ultima fotografia. */
export type LightReportDati = Record<string, any>;

export const chiaveLightReportCliente = (clienteId: string | null | undefined) => ["cerved-light-report", clienteId] as const;

/**
 * Fonte unica lato pagina: ultima fotografia 'light_report' del soggetto Cerved collegato al cliente
 * (FM90: per id_soggetto), letta con RLS. null se il cliente non è collegato o non ha un Light Report.
 */
export function useLightReportCliente(clienteId: string | null | undefined) {
  return useQuery({
    queryKey: chiaveLightReportCliente(clienteId),
    enabled: !!clienteId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LightReportDati | null> => {
      const idSoggetto = await idSoggettoDiEntita("cliente", clienteId!);
      if (!idSoggetto) return null;
      const { data, error } = await supabase.from("cerved_fotografie")
        .select("dati, letta_il").eq("id_soggetto", idSoggetto).eq("tipo", "light_report")
        .order("letta_il", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data?.dati as LightReportDati) ?? null;
    },
  });
}
