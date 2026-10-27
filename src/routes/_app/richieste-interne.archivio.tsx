import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RichiesteTable, type RichiestaRow } from "@/components/richieste-interne/richieste-table";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconaCerchio, IntestazioneRichieste } from "@/components/richieste-interne/intestazione";
import { STILE_ARCHIVIATA, STILE_PAGINA } from "@/components/richieste-interne/stili";

export const Route = createFileRoute("/_app/richieste-interne/archivio")({
  component: ArchivioRichieste,
});

const SELECT =
  "id,title,description,requester_name,sede_name,type,fornitore,amount,status,admin_status,created_at,archived_by_name,archived_at,acconto_richiesto,acconto_importo,acconto_stato,acconto_data_prevista,richieste_interne_allegati(id)";

function ArchivioRichieste() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canRestore =
    hasRole("amministratore") || hasRole("gestore_richieste") || hasRole("esecutore_richieste");

  const { data, isLoading } = useQuery({
    queryKey: ["richieste-interne", "archivio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_interne")
        .select(SELECT)
        .eq("archived", true)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RichiestaRow[];
    },
  });

  const nTot = data?.length ?? 0;
  const nMese = (data ?? []).filter((r) => r.archived_at && Date.now() - new Date(r.archived_at).getTime() <= 30 * 86400000).length;

  async function ripristina(r: RichiestaRow) {
    if (!confirm(`Ripristinare la richiesta "${r.title}"?`)) return;
    const { error } = await supabase
      .from("richieste_interne")
      .update({ archived: false, archived_at: null, archived_by_name: null })
      .eq("id", r.id);
    if (error) {
      toast.error("Errore: " + error.message);
      return;
    }
    toast.success("Richiesta ripristinata");
    qc.invalidateQueries({ queryKey: ["richieste-interne"] });
  }

  return (
    <div className="space-y-4">
      <IntestazioneRichieste stile={STILE_PAGINA.archivio} titolo="Archivio richieste" sottotitolo="Richieste archiviate (sola lettura)" />
      <div className="grid grid-cols-2 gap-2 sm:max-w-md sm:gap-3">
        <Riquadro label="Archiviate totali" value={nTot} />
        <Riquadro label="Archiviate nell'ultimo mese" value={nMese} />
      </div>
      {!isLoading && (data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-4 py-10 text-center">
          <Archive className="size-12 text-muted-foreground/40" aria-hidden />
          <p className="max-w-sm text-sm text-muted-foreground">
            Nessuna richiesta archiviata. Le richieste si archiviano dalla Gestione o dal dettaglio con il pulsante Archivia.
          </p>
        </div>
      ) : (
      <RichiesteTable chiaveFiltri="richieste-interne:archivio"
        rows={data}
        isLoading={isLoading}
        showArchivedColumns
        defaultSortKey="archived_at"
        emptyLabel="Nessuna richiesta archiviata"
        onRipristina={canRestore ? ripristina : undefined}
      />
      )}
    </div>
  );
}


function Riquadro({ label, value }: { label: string; value: number }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border border-l-4 bg-card p-3", STILE_ARCHIVIATA.bordo)}>
      <IconaCerchio stile={STILE_ARCHIVIATA} size="sm" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground break-words">{label}</div>
        <div className="text-xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
