import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { idSoggettoDiEntita } from "@/lib/cerved/cerved-letture";
import type { EntitaCerved } from "@/lib/cerved/cerved-entita";

/** Dati del Light Report (normalizzaLightReportXml) salvati nell'ultima fotografia. */
export type LightReportDati = Record<string, any>;

export const chiaveLightReportCliente = (clienteId: string | null | undefined) => ["cerved-light-report", clienteId] as const;

/** Chiave per entità: per il cliente coincide con chiaveLightReportCliente. */
export const chiaveLightReportEntita = (entita: EntitaCerved, id: string | null | undefined) =>
  entita === "cliente" ? chiaveLightReportCliente(id) : (["cerved-light-report", "lead", id] as const);

/** Fonte unica: ultima fotografia 'light_report' del soggetto Cerved collegato all'entità (per id_soggetto, RLS). */
export function useLightReportEntita(entita: EntitaCerved, id: string | null | undefined) {
  return useQuery({
    queryKey: chiaveLightReportEntita(entita, id),
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LightReportDati | null> => {
      const idSoggetto = await idSoggettoDiEntita(entita, id!);
      if (!idSoggetto) return null;
      const { data, error } = await supabase.from("cerved_fotografie")
        .select("dati, letta_il").eq("id_soggetto", idSoggetto).eq("tipo", "light_report")
        .order("letta_il", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data?.dati as LightReportDati) ?? null;
    },
  });
}

/** Involucro per il cliente: stessa firma e stessa chiave di sempre. */
export function useLightReportCliente(clienteId: string | null | undefined) {
  return useLightReportEntita("cliente", clienteId);
}
