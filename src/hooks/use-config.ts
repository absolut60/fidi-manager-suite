import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppConfig {
  soglia_livello_1: number;
  soglia_livello_2: number;
  durata_default_mesi: number;
  reminder_giorni_scadenza: number;
  cutoff_cliente_attivo_anno: number;
  sollecito_massivo_blocco: number;
  sollecito_massivo_pausa_sec: number;
  spese_insoluto_riba_eur: number;
}

const DEFAULTS: AppConfig = {
  soglia_livello_1: 10000,
  soglia_livello_2: 50000,
  durata_default_mesi: 12,
  reminder_giorni_scadenza: 30,
  cutoff_cliente_attivo_anno: 2025,
  sollecito_massivo_blocco: 12,
  sollecito_massivo_pausa_sec: 60,
  spese_insoluto_riba_eur: 3,
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

// Flag "config pronto": true solo quando la query configurazioni ha risolto
// dal DB. Serve a evitare che query dipendenti dal config partano con i
// DEFAULTS e producano risultati sbagliati (es. cutoff cliente attivo).
export function useConfigReady(): boolean {
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
  return !!data;
}

// Calcola se un cliente è attivo in base all'ultima data fatturazione
// e al cutoff configurato — usa questo invece del campo cliente_attivo dal DB
// Regola "cliente ATTIVO" (centralizzata, unica fonte di verità):
//   A) ha fatturato dall'anno di riferimento in poi (ultima_data_fatturazione >= cutoff)
//   OPPURE
//   B) ha documenti / DDT ancora da fatturare (doc_da_fatturare > 0)
// Se nessuna delle due => Non attivo.
export function isClienteAttivo(
  ultimaDataFatturazione: string | null | undefined,
  docDaFatturare: number | string | null | undefined,
  config: AppConfig
): boolean {
  // Condizione B: DDT/documenti da fatturare aperti
  const docNum =
    typeof docDaFatturare === "string"
      ? parseFloat(docDaFatturare)
      : docDaFatturare ?? 0;
  if (docNum && !isNaN(docNum) && docNum > 0) return true;
  // Condizione A: fatturato nell'anno di riferimento o successivo
  if (!ultimaDataFatturazione) return false;
  const cutoffDate = new Date(`${config.cutoff_cliente_attivo_anno}-01-01`);
  const dataFatt = new Date(ultimaDataFatturazione);
  return dataFatt >= cutoffDate;
}
