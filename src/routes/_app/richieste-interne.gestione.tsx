import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RichiesteTable, type RichiestaRow } from "@/components/richieste-interne/richieste-table";
import { STILE_ADMIN, STILE_APERTE, type StileVoce } from "@/components/richieste-interne/stili";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { cn } from "@/lib/utils";
import { useRichiesteNonLette } from "@/hooks/use-richieste-non-lette";
import { GestisciDialog, type GestisciTarget } from "@/components/richieste-interne/gestisci-dialog";
import { useAuth } from "@/hooks/use-auth";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/richieste-interne/gestione")({
  component: GestionePage,
});

const SELECT =
  "id,title,description,requester_name,sede_name,type,fornitore,amount,status,admin_status,admin_note,sent_to_gestionale,gestionale_ref,created_at,acconto_richiesto,acconto_importo,acconto_stato,richieste_interne_allegati(id)";

type AdminFilter = "aperte" | "da_gestire" | "in_gestione" | "conclusa";

function GestionePage() {
  const { hasRole, loading, user } = useAuth();
  const qc = useQueryClient();
  const { filtri: FG, setCampo } = useFiltriPagina("richieste-interne:gestione:contatori", {
    filtro: "aperte" as AdminFilter,
  }, { userId: user?.id });
  // Valore salvato non più valido (es. vecchio "all") → Aperte.
  const filter: AdminFilter = (["aperte", "da_gestire", "in_gestione", "conclusa"] as const).includes(FG.filtro) ? FG.filtro : "aperte";
  const setFilter = (v: AdminFilter) => setCampo("filtro", v);
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
    return { ...c, aperte: c.da_gestire + c.in_gestione };
  }, [data]);

  // Filtro esclusivo: di default solo le aperte; le concluse solo su richiesta.
  const filtered = useMemo(() => {
    if (!data) return data;
    return data.filter((r) => {
      const s = r.admin_status ?? "da_gestire";
      return filter === "aperte" ? s !== "conclusa" : s === filter;
    });
  }, [data, filter]);

  if (loading) return null;
  if (!canSee) return <Navigate to="/richieste-interne" />;

  const voci: { key: AdminFilter; stile: StileVoce; value: number }[] = [
    { key: "aperte", stile: STILE_APERTE, value: counts.aperte },
    { key: "da_gestire", stile: STILE_ADMIN.da_gestire, value: counts.da_gestire },
    { key: "in_gestione", stile: STILE_ADMIN.in_gestione, value: counts.in_gestione },
    { key: "conclusa", stile: { ...STILE_ADMIN.conclusa, label: "Concluse" }, value: counts.conclusa },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Gestione richieste</h1>
        <p className="text-sm text-muted-foreground">Richieste approvate da lavorare</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {voci.map((v) => (
          <CounterCard key={v.key} stile={v.stile} value={v.value} active={filter === v.key} onClick={() => setFilter(v.key)} />
        ))}
      </div>

      <RichiesteTable
        key={filter === "conclusa" ? "concluse" : "aperte"}
        chiaveFiltri={filter === "conclusa" ? "richieste-interne:gestione:concluse" : "richieste-interne:gestione"}
        defaultPeriodo={filter === "conclusa" ? "30" : "tutto"}
        emptyLabel={filter === "conclusa" ? "Nessuna richiesta conclusa nel periodo" : "Nessuna richiesta"}
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
  stile, value, active, onClick,
}: { stile: StileVoce; value: number; active: boolean; onClick: () => void }) {
  const Icona = stile.icona;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 sm:gap-3 rounded-lg border bg-card p-2.5 sm:p-4 text-left min-h-[56px] transition",
        active ? "ring-2 ring-primary border-primary" : "hover:bg-muted/50",
      )}
    >
      <span className={cn("flex size-8 sm:size-10 shrink-0 items-center justify-center rounded-full", stile.tinta)}>
        <Icona className="size-4 sm:size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-xs sm:text-sm font-medium text-muted-foreground break-words">{stile.label}</span>
        <span className="block text-xl sm:text-3xl font-bold tabular-nums leading-tight">{value}</span>
      </span>
    </button>
  );
}
