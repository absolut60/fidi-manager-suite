// Fonte unica per mostrare il nome di altri utenti (autori, operatori, assegnatari).
// La policy di `profili` permette di leggere solo il proprio profilo: per i nomi
// altrui si usa la RPC `get_nomi_utenti()` (solo id, nome, cognome; include i
// profili non attivi per lo storico).
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NomeUtenteRow = { id: string; nome: string | null; cognome: string | null };

export const NOMI_UTENTI_QUERY_KEY = ["nomi-utenti"] as const;

export function useNomiUtentiQuery() {
  return useQuery({
    queryKey: NOMI_UTENTI_QUERY_KEY,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_nomi_utenti" as never);
      if (error) throw error;
      return (data ?? []) as unknown as NomeUtenteRow[];
    },
  });
}

export function formatNomeUtente(p: { nome: string | null; cognome: string | null }): string | null {
  return `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || null;
}

export function useNomiUtenti() {
  const query = useNomiUtentiQuery();
  const mappa = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of query.data ?? []) {
      const n = formatNomeUtente(p);
      if (n) m.set(p.id, n);
    }
    return m;
  }, [query.data]);
  const nomeUtente = useCallback(
    (id: string | null | undefined): string | null => (id ? mappa.get(id) ?? null : null),
    [mappa],
  );
  return { mappa, nomeUtente, isLoading: query.isLoading };
}
