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
  /** Data (AAAA-MM-GG) del primo pagamento conteggiato: inizio dello storico. */
  primaPagata: string | null;
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
        primaPagata: row.prima_pagata ?? null,
      };
    },
  });
}

/** "AAAA-MM-GG…" → "MM/AAAA" con sola manipolazione di stringa. */
function meseAnno(d: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(d ?? "");
  return m ? `${m[2]}/${m[1]}` : null;
}

/** Testi di "Pagamenti non puntuali": unico helper, lo stile lo decide la pagina. */
export function testiEsperienzaPagamento(esp: EsperienzaPagamento | null | undefined) {
  const label = "Pagamenti non puntuali";
  const vuoto = undefined as string | undefined;
  if (!esp) return { label, valore: "—", dettaglio: vuoto, titolo: vuoto, nonPuntuali12m: false };
  const titolo = `Non puntuale = pagato oltre ${esp.tolleranza} giorni dalla scadenza, RiBa tornate indietro comprese. I pagamenti in anticipo contano come puntuali. Esclusi i documenti di anticipo.`;
  if (esp.nPagate === 0) return { label, valore: "Nessun pagamento registrato", dettaglio: vuoto, titolo, nonPuntuali12m: false };
  const dal = meseAnno(esp.primaPagata);
  const storico = `storico ${esp.nInRitardo} su ${esp.nPagate}${dal ? ` dal ${dal}` : ""}`;
  const nonPuntuali12m = esp.nInRitardo12m > 0;
  if (esp.nPagate12m === 0) {
    return { label, valore: "Nessun pagamento negli ultimi 12 mesi", dettaglio: storico, titolo, nonPuntuali12m };
  }
  return { label, valore: `${esp.nInRitardo12m} su ${esp.nPagate12m} negli ultimi 12 mesi`, dettaglio: storico, titolo, nonPuntuali12m };
}
