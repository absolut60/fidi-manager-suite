import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RichiesteTable, type RichiestaRow, ADMIN_LABEL } from "@/components/richieste-interne/richieste-table";
import { useRichiesteNonLette } from "@/hooks/use-richieste-non-lette";
import { GestisciDialog, type GestisciTarget } from "@/components/richieste-interne/gestisci-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/richieste-interne/gestione")({
  component: GestionePage,
});

const SELECT =
  "id,title,description,requester_name,sede_name,type,fornitore,amount,status,admin_status,admin_note,sent_to_gestionale,gestionale_ref,created_at,richieste_interne_allegati(id)";

type AdminFilter = "all" | "da_gestire" | "in_gestione" | "conclusa";

function GestionePage() {
  const { hasRole, loading } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<AdminFilter>("all");
  const [target, setTarget] = useState<GestisciTarget | null>(null);
  const [open, setOpen] = useState(false);

  const canSee =
    hasRole("amministratore") || hasRole("gestore_richieste") || hasRole("esecutore_richieste");

  const { data, isLoading } = useQuery({
    queryKey: ["richieste-interne", "gestione"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_interne")
        .select(SELECT)
        .in("status", ["resp_approved", "approved"])
        .eq("archived", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RichiestaRow[];
    },
    enabled: canSee,
  });

  const unreadIds = useRichiesteNonLette();

  const counts = useMemo(() => {
    const c = { da_gestire: 0, in_gestione: 0, conclusa: 0 };
    for (const r of data ?? []) {
      const s = (r.admin_status ?? "da_gestire") as keyof typeof c;
      if (s in c) c[s]++;
    }
    return c;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return data;
    if (filter === "all") return data;
    return data.filter((r) => (r.admin_status ?? "da_gestire") === filter);
  }, [data, filter]);

  if (loading) return null;
  if (!canSee) return <Navigate to="/richieste-interne" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Gestione richieste</h1>
        <p className="text-sm text-muted-foreground">Richieste approvate da lavorare</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CounterCard
          label="Da gestire"
          value={counts.da_gestire}
          color="bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300"
          active={filter === "da_gestire"}
          onClick={() => setFilter((f) => (f === "da_gestire" ? "all" : "da_gestire"))}
        />
        <CounterCard
          label="In gestione"
          value={counts.in_gestione}
          color="bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300"
          active={filter === "in_gestione"}
          onClick={() => setFilter((f) => (f === "in_gestione" ? "all" : "in_gestione"))}
        />
        <CounterCard
          label="Concluse"
          value={counts.conclusa}
          color="bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300"
          active={filter === "conclusa"}
          onClick={() => setFilter((f) => (f === "conclusa" ? "all" : "conclusa"))}
        />
      </div>

      {filter !== "all" && (
        <div className="text-xs text-muted-foreground">
          Filtro attivo: <strong>{ADMIN_LABEL[filter]}</strong> —{" "}
          <button className="underline" onClick={() => setFilter("all")}>rimuovi</button>
        </div>
      )}

      <RichiesteTable
        rows={filtered}
        isLoading={isLoading}
        unreadIds={unreadIds}
        onGestisci={(r) => {
          setTarget({
            id: r.id,
            title: r.title,
            admin_status: r.admin_status,
            admin_note: r.admin_note ?? null,
            sent_to_gestionale: r.sent_to_gestionale ?? false,
            gestionale_ref: r.gestionale_ref ?? null,
          });
          setOpen(true);
        }}
      />

      <GestisciDialog
        open={open}
        target={target}
        onOpenChange={setOpen}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["richieste-interne"] });
          qc.invalidateQueries({ queryKey: ["richiesta-interna"] });
        }}
      />
    </div>
  );
}

function CounterCard({
  label, value, color, active, onClick,
}: { label: string; value: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border-2 transition ${color} ${active ? "ring-2 ring-offset-2 ring-current" : "opacity-90 hover:opacity-100"}`}
    >
      <Card className="border-0 bg-transparent shadow-none">
        <CardContent className="p-4">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-3xl font-bold mt-1">{value}</div>
        </CardContent>
      </Card>
    </button>
  );
}
