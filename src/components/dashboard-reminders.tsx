import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function DashboardReminders() {
  const { user, role } = useAuth();
  const enabled = !!user?.id && (role === "amministratore" || role === "approvatore_liv3");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-reminders", user?.id],
    enabled,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("reminder" as never)
        .select("id, titolo, descrizione, data_reminder, cliente_id, tipo, letto, clienti(ragione_sociale)")
        .eq("utente_id", user!.id)
        .lte("data_reminder", today)
        .eq("letto", false)
        .order("data_reminder", { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; titolo: string; descrizione: string | null; data_reminder: string;
        cliente_id: string | null; tipo: string; letto: boolean;
        clienti: { ragione_sociale: string } | null;
      }>;
    },
  });

  if (!enabled) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning" />
          Reminder da gestire
        </h2>
        {data && data.length > 0 && (
          <Badge variant="destructive">{data.length}</Badge>
        )}
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Caricamento…</p>
      ) : !data || data.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          Nessun reminder in scadenza oggi.
        </div>
      ) : (
        <ul className="divide-y">
          {data.map((r) => (
            <li key={r.id} className="py-2.5">
              <Link
                to={r.cliente_id ? `/clienti/${r.cliente_id}` : "/dashboard"}
                className="flex items-center justify-between gap-3 hover:bg-muted/40 -mx-2 px-2 py-1 rounded"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.titolo}</p>
                  {r.clienti?.ragione_sociale && (
                    <p className="text-xs text-muted-foreground truncate">{r.clienti.ragione_sociale}</p>
                  )}
                  {r.descrizione && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.descrizione}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="outline" className="text-[10px]">
                    {new Date(r.data_reminder).toLocaleDateString("it-IT")}
                  </Badge>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
