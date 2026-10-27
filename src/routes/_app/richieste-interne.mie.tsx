import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { NuovaRichiestaDialog } from "@/components/richieste-interne/nuova-richiesta-dialog";
import { RichiesteTable, type RichiestaRow } from "@/components/richieste-interne/richieste-table";
import { useRichiesteNonLette } from "@/hooks/use-richieste-non-lette";

export const Route = createFileRoute("/_app/richieste-interne/mie")({
  component: MieRichieste,
});

type FiltroStato = "tutte" | "attesa" | "approvate" | "rifiutate";

function MieRichieste() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const unreadIds = useRichiesteNonLette();
  // Filtro a pillola conservato; ricerca, periodo e ordinamento li conserva RichiesteTable.
  const { filtri: FM, setCampo } = useFiltriPagina("richieste-interne:mie", {
    filtro: "tutte" as FiltroStato,
  }, { userId: user?.id });
  const { filtro } = FM;
  const setFiltro = (v: FiltroStato) => setCampo("filtro", v);

  const { data, isLoading } = useQuery({
    queryKey: ["richieste-interne", "mie", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_interne")
        .select("id,title,description,requester_name,sede_name,type,fornitore,amount,status,admin_status,created_at,updated_at,acconto_richiesto,acconto_importo,acconto_stato,richieste_interne_allegati(id)")
        .eq("requester_id", uid)
        .eq("archived", false)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RichiestaRow[];
    },
  });

  const filtered = useMemo(() => (data ?? []).filter((r) => {
    if (filtro === "attesa") return r.status === "pending" || r.status === "forwarded";
    if (filtro === "approvate") return r.status === "resp_approved" || r.status === "approved";
    if (filtro === "rifiutate") return r.status === "rejected";
    return true;
  }), [data, filtro]);

  const conteggi = useMemo(() => {
    const rows = data ?? [];
    return {
      tutte: rows.length,
      attesa: rows.filter((r) => r.status === "pending" || r.status === "forwarded").length,
      approvate: rows.filter((r) => r.status === "resp_approved" || r.status === "approved").length,
      rifiutate: rows.filter((r) => r.status === "rejected").length,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Le mie richieste</h1>
          <p className="text-sm text-muted-foreground">Richieste che hai creato</p>
        </div>
        <NuovaRichiestaDialog />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PillFilter active={filtro === "tutte"} onClick={() => setFiltro("tutte")}>Tutte ({conteggi.tutte})</PillFilter>
        <PillFilter active={filtro === "attesa"} onClick={() => setFiltro("attesa")}>In attesa ({conteggi.attesa})</PillFilter>
        <PillFilter active={filtro === "approvate"} onClick={() => setFiltro("approvate")}>Approvate ({conteggi.approvate})</PillFilter>
        <PillFilter active={filtro === "rifiutate"} onClick={() => setFiltro("rifiutate")}>Rifiutate ({conteggi.rifiutate})</PillFilter>
      </div>

      <RichiesteTable
        chiaveFiltri="richieste-interne:mie:lista"
        rows={filtered}
        isLoading={isLoading}
        unreadIds={unreadIds}
        nascondiRichiedente
      />
    </div>
  );
}

function PillFilter({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 px-3 rounded-full text-sm border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
    >
      {children}
    </button>
  );
}
