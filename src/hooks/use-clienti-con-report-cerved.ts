import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Chiave dedicata (forma: Set di cliente_id con almeno un Light Report), non condivisa con altre letture. */
export const chiaveClientiConReportCerved = (ids: string[]) =>
  ["clienti-con-report-cerved", [...ids].sort().join(",")] as const;

const BLOCCO = 150;

/**
 * FM84: lookup leggero e separato dalla lista clienti — una query per blocco sugli id
 * della pagina visibile (`select cliente_id from cerved_report where cliente_id in (...)`),
 * con il client autenticato (RLS cerved_report_select già allineata a chi vede il cliente).
 * Restituisce un Set sempre definito; se la query fallisce il simbolo semplicemente
 * non compare (insieme vuoto, nessun errore a schermo).
 */
export function useClientiConReportCerved(ids: string[], enabled = true) {
  return useQuery({
    queryKey: chiaveClientiConReportCerved(ids),
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<Set<string>> => {
      const out = new Set<string>();
      const unici = [...new Set(ids)];
      for (let i = 0; i < unici.length; i += BLOCCO) {
        const blocco = unici.slice(i, i + BLOCCO);
        const { data, error } = await supabase
          .from("cerved_report")
          .select("cliente_id")
          .in("cliente_id", blocco);
        if (error) return out; // fallimento silenzioso: nessun simbolo, nessun errore a schermo
        for (const r of (data ?? []) as { cliente_id: string }[]) out.add(r.cliente_id);
      }
      return out;
    },
  });
}
