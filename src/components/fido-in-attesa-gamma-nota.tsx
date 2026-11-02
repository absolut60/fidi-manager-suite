import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { fetchFidiInAttesaGamma, testoInAttesaGammaScheda } from "@/lib/fido-teorico";

/** Riga informativa: fido approvato che Gamma non ha ancora recepito (fonte SQL fidi_approvati_in_attesa_gamma). */
export function FidoInAttesaGammaNota({ clienteId }: { clienteId: string }) {
  const { data } = useQuery({
    queryKey: ["fidi-in-attesa-gamma-cliente", clienteId],
    staleTime: 60_000,
    queryFn: () => fetchFidiInAttesaGamma([clienteId]),
  });
  const f = data?.get(clienteId);
  if (!f) return null;
  return (
    <p className="flex min-w-0 items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-foreground">
      <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 break-words">{testoInAttesaGammaScheda(f)}</span>
    </p>
  );
}
