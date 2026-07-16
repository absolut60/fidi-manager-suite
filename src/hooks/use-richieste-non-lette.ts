import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Restituisce un Set con gli id delle richieste interne che contengono
 * almeno un messaggio non ancora letto dall'utente corrente.
 * Una sola RPC, calcolo lato server, niente N+1.
 */
export function useRichiesteNonLette() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const query = useQuery({
    queryKey: ["richieste-interne", "non-lette", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_richieste_con_messaggi_non_letti");
      if (error) throw error;
      return new Set<string>(((data ?? []) as string[]));
    },
    staleTime: 15_000,
  });
  return query.data ?? new Set<string>();
}
