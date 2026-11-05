import { useAuth } from "@/hooks/use-auth";
import { isSoloShowroom } from "@/lib/permessi-showroom";

/** True per l'utente "solo showroom" (fonte unica: isSoloShowroom). */
export function useSoloShowroom(): boolean {
  const { roles } = useAuth();
  return isSoloShowroom(roles as string[]);
}
