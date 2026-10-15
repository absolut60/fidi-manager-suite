// Permessi sui contatti dei clienti (FM44).
// La regola vive SOLO nel database: auth_puo_scrivere_contatti_cliente(_cliente_id)
// e auth_puo_eliminare_contatti_clienti(). Qui nessun elenco di ruoli.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePuoScrivereContattiCliente(clienteId: string | null | undefined) {
  return useQuery({
    queryKey: ["permessi-contatti", "scrivere", clienteId],
    enabled: !!clienteId,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("auth_puo_scrivere_contatti_cliente", {
        _cliente_id: clienteId!,
      });
      if (error) throw error;
      return data === true;
    },
  });
}

export function usePuoEliminareContattiClienti() {
  return useQuery({
    queryKey: ["permessi-contatti", "eliminare"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("auth_puo_eliminare_contatti_clienti");
      if (error) throw error;
      return data === true;
    },
  });
}

type AzioneContatto = "creare" | "modificare" | "eliminare";

export function erroreScritturaContatto(
  error: { code?: string; message?: string } | null | undefined,
  azione: AzioneContatto,
): string {
  const msg = error?.message ?? "";
  if (error?.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return `Non hai il permesso di ${azione} questo contatto`;
  }
  return msg || "Errore";
}
