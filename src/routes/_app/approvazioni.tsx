import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatEuro, formatDate } from "@/lib/fidi";

export const Route = createFileRoute("/_app/approvazioni")({
  component: ApprovazioniPage,
});

function ApprovazioniPage() {
  const { role } = useAuth();
  const isAdmin = role === "amministratore";
  const livello =
    role === "approvatore_liv3" ? 3 :
    role === "approvatore_liv2" ? 2 :
    role === "approvatore_liv1" ? 1 : 0;

  const { data, isLoading } = useQuery({
    queryKey: ["approvazioni-queue", role],
    queryFn: async () => {
      let q = supabase
        .from("richieste_fido")
        .select("*, clienti(ragione_sociale, partita_iva), stores(nome)")
        .eq("stato", "in_approvazione")
        .order("data_invio", { ascending: true });
      if (!isAdmin) q = q.eq("livello_corrente", livello);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: isAdmin || livello > 0,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Approvazioni</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? "Tutte le richieste in approvazione" : `Richieste in attesa al tuo livello (${livello})`}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="size-12 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-3">
            <CheckCheck className="size-5 text-success" />
          </div>
          <p className="font-medium">Nessuna richiesta in attesa</p>
          <p className="text-xs text-muted-foreground mt-1">Tutte le richieste sono state processate</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((r) => (
            <Link
              key={r.id}
              to="/richieste/$richiestaId"
              params={{ richiestaId: r.id }}
              className="block"
            >
              <Card className="p-4 hover:shadow-md transition-shadow hover:border-primary/30">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{(r as any).clienti?.ragione_sociale}</p>
                      <Badge variant="outline">Liv. {r.livello_corrente}/{r.livello_richiesto}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(r as any).stores?.nome ?? "—"} · Inviata il {formatDate(r.data_invio)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg tabular-nums">{formatEuro(Number(r.importo_richiesto))}</p>
                    <p className="text-xs text-muted-foreground">{r.durata_mesi} mesi</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
