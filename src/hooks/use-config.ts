import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppConfig {
  soglia_livello_1: number;
  soglia_livello_2: number;
  durata_default_mesi: number;
  reminder_giorni_scadenza: number;
  cutoff_cliente_attivo_anno: number;
}

const DEFAULTS: AppConfig = {
  soglia_livello_1: 10000,
  soglia_livello_2: 50000,
  durata_default_mesi: 12,
  reminder_giorni_scadenza: 30,
  cutoff_cliente_attivo_anno: 2025,
};

export function useConfig(): AppConfig {
  const { data } = useQuery({
    queryKey: ["configurazioni"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configurazioni")
        .select("chiave, valore");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!data) return DEFAULTS;

  const cfg = { ...DEFAULTS };
  data.forEach((row) => {
    const v = parseFloat(row.valore ?? "");
    if (!isNaN(v) && row.chiave in cfg) {
      (cfg as any)[row.chiave] = v;
    }
  });
  return cfg;
}

// Calcola se un cliente è attivo in base all'ultima data fatturazione
// e al cutoff configurato — usa questo invece del campo cliente_attivo dal DB
export function isClienteAttivo(
  ultimaDataFatturazione: string | null | undefined,
  config: AppConfig
): boolean {
  if (!ultimaDataFatturazione) return false;
  const cutoffDate = new Date(`${config.cutoff_cliente_attivo_anno}-01-01`);
  const dataFatt = new Date(ultimaDataFatturazione);
  return dataFatt >= cutoffDate;
}
