import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RichiesteTable, type RichiestaRow } from "@/components/richieste-interne/richieste-table";
import { useRichiesteNonLette } from "@/hooks/use-richieste-non-lette";

export const Route = createFileRoute("/_app/richieste-interne/approva")({
  component: ApprovaRichieste,
});

const SELECT =
  "id,title,description,requester_name,sede_name,type,fornitore,amount,status,admin_status,created_at,richieste_interne_allegati(id)";

function ApprovaRichieste() {
  const { roles } = useAuth();
  const userRoles = roles as string[];
  const isLiv1 = userRoles.includes("approvatore_richieste_liv1");
  const isLiv2 = userRoles.includes("approvatore_richieste_liv2");

  const statuses = isLiv1 && isLiv2
    ? ["pending", "forwarded"]
    : isLiv1
      ? ["pending"]
      : isLiv2
        ? ["forwarded"]
        : [];

  const sottotitolo = isLiv1 && isLiv2
    ? "Pending (Liv.1) e inoltrate (Liv.2)"
    : isLiv1
      ? "Richieste in attesa del tuo esame"
      : isLiv2
        ? "Richieste inoltrate dal Resp. Generale"
        : "Nessun ruolo di approvazione";

  const { data, isLoading } = useQuery({
    queryKey: ["richieste-interne", "approva", statuses.join(",")],
    enabled: statuses.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_interne")
        .select(SELECT)
        .eq("archived", false)
        .in("status", statuses)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RichiestaRow[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Da approvare</h1>
          <p className="text-sm text-muted-foreground">{sottotitolo}</p>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{data?.length ?? 0}</span> in attesa
        </div>
      </div>
      <RichiesteTable rows={data} isLoading={isLoading} showAdminBadge={false} emptyLabel="Nessuna richiesta da approvare" unreadIds={unreadIds} />
    </div>
  );
}
