import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Legge solo l'id sotto RLS: non usa le RPC lite per decidere l'accesso alla scheda completa. */
export function ClienteVisibileLink({ clienteId, children, className }: { clienteId: string; children: ReactNode; className?: string }) {
  const { data: visibile } = useQuery({
    queryKey: ["cliente-visibile-lead", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clienti").select("id").eq("id", clienteId).maybeSingle();
      return !error && !!data;
    },
    staleTime: 30_000,
  });
  return visibile ? <Link to="/clienti/$clienteId" params={{ clienteId }} className={className}>{children}</Link>
    : <span aria-disabled="true" title="Scheda cliente fuori dal tuo ambito o non disponibile" className="text-xs text-muted-foreground">Cliente non accessibile</span>;
}