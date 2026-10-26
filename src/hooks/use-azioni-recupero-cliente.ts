// Fonte unica delle azioni di recupero di un cliente (tab "Attività di recupero"
// e striscia recupero nello scadenziario). Stesso queryKey ovunque → una sola cache.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNomiUtentiQuery } from "@/hooks/use-nomi-utenti";
import type { TipoAzione } from "@/components/reminder-controls";

export type EsitoAzione =
  | "da_fare" | "fatto" | "nessuna_risposta" | "contestazione" | "pagato";

export type Azione = {
  id: string;
  cliente_id: string;
  operatore_id: string | null;
  tipo: TipoAzione | "promemoria_scadenza" | "promessa_pagamento";
  esito: EsitoAzione;
  data_azione: string;
  data_promessa_pagamento: string | null;
  importo_riferimento: number | null;
  stato_promessa?: string | null;
  note: string | null;
  email_oggetto: string | null;
  email_corpo_html: string | null;
  email_destinatario: string | null;
  email_cc?: string | null;
  email_bcc?: string | null;
  livello_sollecito: number | null;
  created_at: string;
};

export function azioniRecuperoClienteQueryKey(clienteId: string | null) {
  return ["azioni-recupero-cliente", clienteId] as const;
}

export function useAzioniRecuperoCliente(clienteId: string | null) {
  const { data: azioni, isLoading, dataUpdatedAt } = useQuery({
    queryKey: azioniRecuperoClienteQueryKey(clienteId),
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("azioni_recupero")
        .select("id, cliente_id, operatore_id, tipo, esito, data_azione, data_promessa_pagamento, importo_riferimento, stato_promessa, note, email_oggetto, email_corpo_html, email_destinatario, email_cc, email_bcc, livello_sollecito, created_at")
        .eq("cliente_id", clienteId!)
        .order("data_azione", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Azione[];
    },
  });

  const daFare = useMemo(
    () => (azioni ?? []).filter((a) => a.esito === "da_fare")
      .sort((a, b) => new Date(a.data_azione).getTime() - new Date(b.data_azione).getTime()),
    [azioni],
  );
  const concluse = useMemo(() => (azioni ?? []).filter((a) => a.esito !== "da_fare"), [azioni]);
  const prossima = daFare[0] ?? null;
  // Gemello TS della CTE `ultima` di get_recupero_clienti_aggregato
  // (esclude i promemoria_scadenza automatici).
  const ultimaFatta = useMemo(
    () => concluse.find((a) => a.esito === "fatto" && a.tipo !== "promemoria_scadenza") ?? null,
    [concluse],
  );
  const adesso = Date.now();
  const inRitardo = daFare.some((a) => new Date(a.data_azione).getTime() < adesso);

  return { azioni, isLoading, dataUpdatedAt, daFare, concluse, prossima, ultimaFatta, inRitardo };
}

// Elenco operatori per mostrare i nomi nelle azioni di recupero.
// Sopra la fonte unica get_nomi_utenti (id, nome, cognome; niente email).
export function useOperatoriAttivita() {
  return useNomiUtentiQuery();
}

// Stadio di sollecito del cliente (0 o 1 riga dalla RPC aggregata).
// Fonte unica: striscia recupero dello scadenziario e riepilogo del tab attività.
export function useStadioSollecitoCliente(clienteId: string) {
  return useQuery({
    queryKey: ["recupero-stadio-cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_recupero_clienti_aggregato", { _cliente_id: clienteId });
      if (error) throw error;
      return (data?.[0] ?? null) as { stadio_sollecito: number; stadio_data: string | null; stadio_giorni: number | null } | null;
    },
  });
}
