import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RichiesteTable, type RichiestaRow } from "@/components/richieste-interne/richieste-table";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/richieste-interne/archivio")({
  component: ArchivioRichieste,
});

const SELECT =
  "id,title,description,requester_name,sede_name,type,fornitore,amount,status,admin_status,created_at,archived_by_name,archived_at,richieste_interne_allegati(id)";

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
      <div>
        <h1 className="text-2xl font-semibold">Archivio richieste</h1>
        <p className="text-sm text-muted-foreground">Richieste archiviate (sola lettura)</p>
      </div>
      <RichiesteTable
        rows={data}
        isLoading={isLoading}
        showArchivedColumns
        defaultSortKey="archived_at"
        emptyLabel="Nessuna richiesta archiviata"
        onRipristina={canRestore ? ripristina : undefined}
      />
    </div>
  );
}

