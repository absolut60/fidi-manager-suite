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
  nPagate12m: number;
  ritardoMedio12m: number | null;
  ritardoMedioRitardi12m: number | null;
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
        nPagate12m: Number(row.n_pagate_12m ?? 0),
        ritardoMedio12m: row.ritardo_medio_12m != null ? Number(row.ritardo_medio_12m) : null,
        ritardoMedioRitardi12m: row.ritardo_medio_ritardi_12m != null ? Number(row.ritardo_medio_ritardi_12m) : null,
      };
    },
  });
}

/** Testi formattati della cella "Pagate in ritardo" (lo stile lo decide la pagina). */
export function testiPagateInRitardo(esp: EsperienzaPagamento | null | undefined) {
  const label = "Pagate in ritardo";
  if (!esp) return { label, valore: "—", dettaglio: undefined as string | undefined, titolo: undefined as string | undefined, inRitardo: false };
  const titolo = `In ritardo = pagate oltre ${esp.tolleranza} giorni dalla scadenza. Il ritardo medio conta tutte le pagate degli ultimi 12 mesi (quelle puntuali valgono zero). Escluse RiBa (le non pagate sono negli insoluti) e anticipi.`;
  const storico = `storico ${esp.nInRitardo} su ${esp.nPagate}`;
  if (esp.nPagate === 0) return { label, valore: "Nessun pagamento non RiBa", dettaglio: undefined as string | undefined, titolo, inRitardo: false };
  if (esp.nPagate12m === 0) {
    return { label, valore: "Nessun pagamento negli ultimi 12 mesi", dettaglio: `${storico} in ritardo`, titolo, inRitardo: esp.nInRitardo12m > 0 };
  }
  return {
    label,
    valore: `${esp.nInRitardo12m} su ${esp.nPagate12m} negli ultimi 12 mesi`,
    dettaglio: `ritardo medio ${Math.round(esp.ritardoMedio12m ?? 0)} gg · ${storico}`,
    titolo,
    inRitardo: esp.nInRitardo12m > 0,
  };
}
