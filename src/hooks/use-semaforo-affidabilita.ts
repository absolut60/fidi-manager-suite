// Fonte unica lato interfaccia del semaforo di affidabilità del cliente
// (RPC get_semaforo_affidabilita_cliente). Stessa queryKey ovunque → una sola cache.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SemaforoStadio } from "@/lib/semaforo-ui";

export type SemaforoAffidabilitaDati = {
  stadio: SemaforoStadio;
  motivo: string;
  numero: number | null;
  numeroUnita: string | null;
} | null;

function normalizzaStadio(s: unknown): SemaforoStadio {
  return s === "rosso" || s === "arancione" || s === "giallo" || s === "verde" || s === "spento" ? s : null;
}

export function useSemaforoAffidabilitaCliente(clienteId: string | null | undefined) {
  return useQuery<SemaforoAffidabilitaDati>({
    queryKey: ["semaforo-affidabilita", clienteId],
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_semaforo_affidabilita_cliente", {
        p_cliente_id: clienteId!,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        stadio: normalizzaStadio(row.stadio),
        motivo: String(row.motivo ?? ""),
        numero: row.numero != null ? Number(row.numero) : null,
        numeroUnita: row.numero_unita ?? null,
      };
    },
  });
}
