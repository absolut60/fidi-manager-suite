import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { puoVedereAreaFidi } from "@/lib/permessi-fidi";

/** Cancello schermo dell'area Fidi (regola unica puoVedereAreaFidi). La RLS resta il vero filtro dei dati. */
export function AccessoAreaFidi({ pagina, children }: { pagina: string; children: ReactNode }) {
  const { user, roles } = useAuth();
  if (!user) return <div className="mx-auto w-full max-w-7xl p-4"><Skeleton className="h-40 w-full" /></div>;
  if (!puoVedereAreaFidi(roles as string[])) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <Card className="p-6 text-center">
          <p className="font-medium">Accesso riservato</p>
          <p className="mt-1 text-sm text-muted-foreground">Il tuo ruolo non prevede la pagina {pagina}.</p>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
