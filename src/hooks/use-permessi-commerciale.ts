// Permessi di eliminazione del modulo commerciale (rispecchiano le policy RLS DELETE).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type ConAgente = { agente_codice?: string | null; clienti?: { codice_agente?: string | null } | null };

export function usePermessiCommerciale() {
  const { user, roles } = useAuth();
  const isDirezionale = roles.some((r) =>
    ["amministratore", "amministrazione", "direzione"].includes(r),
  );
  const isAgente = roles.includes("agente");

  const { data: mioCodice = "" } = useQuery({
    queryKey: ["mio-codice-agente", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("profili").select("codice_agente").eq("id", user!.id).maybeSingle();
      return (data as { codice_agente: string | null } | null)?.codice_agente ?? "";
    },
    staleTime: 300_000,
  });

  /** Opportunità: direzionali sempre, agente solo le proprie. */
  function puoEliminareOpportunita(o: ConAgente | null | undefined): boolean {
    if (isDirezionale) return true;
    if (!o || !isAgente || !mioCodice) return false;
    return o.agente_codice === mioCodice;
  }

  /** Cantieri: direzionali sempre, agente i propri (intestati a lui o del suo cliente). */
  function puoEliminareCantiere(c: ConAgente | null | undefined): boolean {
    if (isDirezionale) return true;
    if (!c || !isAgente || !mioCodice) return false;
    return c.agente_codice === mioCodice || c.clienti?.codice_agente === mioCodice;
  }

  return { mioCodice, isDirezionale, isAgente, puoEliminareOpportunita, puoEliminareCantiere };
}
