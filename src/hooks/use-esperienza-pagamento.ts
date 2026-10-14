// Fonte unica lato interfaccia del dato "pagate in ritardo" (RPC
// get_esperienza_pagamento_cliente, che applica la tolleranza configurata).
// Stessa queryKey ovunque → una sola cache.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EsperienzaPagamento = {
  nPagate: number;
  nInRitardo: number;
  pctInRitardo: number | null;
  ritardoMedio: number | null;
  maxRitardo: number | null;
  nInRitardo12m: number;
  ritardoMedioRitardi: number | null;
  tolleranza: number;
};

export function useEsperienzaPagamentoCliente(clienteId: string | null | undefined) {
  return useQuery({
    queryKey: ["esperienza-pagamento", clienteId],
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: !!clienteId,
    queryFn: async (): Promise<EsperienzaPagamento | null> => {
      const { data, error } = await supabase.rpc("get_esperienza_pagamento_cliente", {
        p_cliente_id: clienteId!,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        nPagate: Number(row.n_pagate ?? 0),
        nInRitardo: Number(row.n_in_ritardo ?? 0),
        pctInRitardo: row.perc_in_ritardo != null ? Number(row.perc_in_ritardo) : null,
        ritardoMedio: row.ritardo_medio_gg != null ? Number(row.ritardo_medio_gg) : null,
        maxRitardo: row.max_ritardo_gg != null ? Number(row.max_ritardo_gg) : null,
        nInRitardo12m: Number(row.n_in_ritardo_12m ?? 0),
        ritardoMedioRitardi: row.ritardo_medio_ritardi_gg != null ? Number(row.ritardo_medio_ritardi_gg) : null,
        tolleranza: Number(row.tolleranza_gg ?? 5),
      };
    },
  });
}

/** Testi formattati della cella "Pagate in ritardo" (lo stile lo decide la pagina). */
export function testiPagateInRitardo(esp: EsperienzaPagamento | null | undefined) {
  const label = "Pagate in ritardo";
  if (!esp) return { label, valore: "—", dettaglio: undefined, titolo: undefined, inRitardo: false };
  const titolo = `Scadenze pagate oltre ${esp.tolleranza} giorni dalla scadenza (bonifici e altri pagamenti non RiBa; le RiBa non pagate sono negli insoluti), su tutto lo storico disponibile`;
  if (esp.nPagate === 0) return { label, valore: "Nessun pagamento non RiBa", dettaglio: undefined, titolo, inRitardo: false };
  const media = esp.ritardoMedioRitardi != null
    ? ` · media +${esp.ritardoMedioRitardi.toLocaleString("it-IT", { maximumFractionDigits: 1 })} gg`
    : "";
  return {
    label,
    valore: `${esp.nInRitardo} su ${esp.nPagate}`,
    dettaglio: `${esp.nInRitardo12m} negli ultimi 12 mesi${media}`,
    titolo,
    inRitardo: esp.nInRitardo > 0,
  };
}
