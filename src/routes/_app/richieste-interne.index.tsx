import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Inbox, Hourglass, CheckCircle2, XCircle, ClipboardList, Wrench } from "lucide-react";
import { NuovaRichiestaDialog } from "@/components/richieste-interne/nuova-richiesta-dialog";

export const Route = createFileRoute("/_app/richieste-interne/")({
  component: DashboardRichiesteInterne,
});

function DashboardRichiesteInterne() {
  const { user, roles } = useAuth();
  const uid = user?.id ?? "";

  const isRichiedente = roles.includes("richiedente");
  const isApp1 = roles.includes("approvatore_richieste_liv1");
  const isApp2 = roles.includes("approvatore_richieste_liv2");
  const isGestore = roles.includes("gestore_richieste") || roles.includes("esecutore_richieste");
  const isAdmin = roles.includes("amministratore");

  const { data: counts } = useQuery({
    queryKey: ["richieste-interne", "dashboard", uid],
    enabled: !!uid,
    queryFn: async () => {
      const base = supabase.from("richieste_interne").select("id,status,admin_status,requester_id,archived", { count: "exact", head: false }).eq("archived", false);
      const { data, error } = await base;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = counts ?? [];
  const mie = rows.filter((r) => r.requester_id === uid);
  const nMie = mie.length;
  const nMieAttesa = mie.filter((r) => r.status === "pending" || r.status === "forwarded").length;
  const nMieApprovate = mie.filter((r) => r.status === "resp_approved" || r.status === "approved").length;
  const nMieRifiutate = mie.filter((r) => r.status === "rejected").length;

  const nApp1 = rows.filter((r) => r.status === "pending").length;
  const nApp2 = rows.filter((r) => r.status === "forwarded").length;
  const nDaGestire = rows.filter((r) => r.admin_status === "da_gestire" && (r.status === "resp_approved" || r.status === "approved")).length;
  const nInGestione = rows.filter((r) => r.admin_status === "in_gestione").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Richieste interne</h1>
          <p className="text-sm text-muted-foreground">Dashboard delle richieste MADE</p>
        </div>
        {(isRichiedente || isAdmin) && <NuovaRichiestaDialog />}
      </div>

      {(isRichiedente || isAdmin) && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Le mie richieste</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard to="/richieste-interne/mie" icon={<Inbox className="size-4" />} label="Totali" value={nMie} />
            <StatCard to="/richieste-interne/mie" icon={<Hourglass className="size-4" />} label="In attesa" value={nMieAttesa} />
            <StatCard to="/richieste-interne/mie" icon={<CheckCircle2 className="size-4" />} label="Approvate" value={nMieApprovate} />
            <StatCard to="/richieste-interne/mie" icon={<XCircle className="size-4" />} label="Rifiutate" value={nMieRifiutate} />
          </div>
        </section>
      )}

      {(isApp1 || isApp2 || isAdmin) && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Approvazioni</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(isApp1 || isAdmin) && <StatCard icon={<ClipboardList className="size-4" />} label="Da approvare (Liv.1)" value={nApp1} />}
            {(isApp2 || isAdmin) && <StatCard icon={<ClipboardList className="size-4" />} label="Da approvare (Liv.2)" value={nApp2} />}
          </div>
        </section>
      )}

      {(isGestore || isAdmin) && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Gestione</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={<Wrench className="size-4" />} label="Da gestire" value={nDaGestire} />
            <StatCard icon={<Wrench className="size-4" />} label="In gestione" value={nInGestione} />
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ to, icon, label, value }: { to?: string; icon: React.ReactNode; label: string; value: number }) {
  const inner = (
    <Card className="hover:bg-accent/40 transition-colors">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}
