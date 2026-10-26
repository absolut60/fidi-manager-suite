import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RichiesteTable, type RichiestaRow } from "@/components/richieste-interne/richieste-table";
import { useRichiesteNonLette } from "@/hooks/use-richieste-non-lette";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/richieste-interne/tutte")({
  component: TutteRichieste,
});

const SELECT =
  "id,title,description,requester_name,sede_name,type,fornitore,amount,status,admin_status,created_at,acconto_richiesto,acconto_importo,acconto_stato,richieste_interne_allegati(id)";

function TutteRichieste() {
  const { data, isLoading } = useQuery({
    queryKey: ["richieste-interne", "tutte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_interne")
        .select(SELECT)
        .eq("archived", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RichiestaRow[];
    },
  });

  const unreadIds = useRichiesteNonLette();
  // FM48: chi ha solo la tesoreria (nessun ruolo di gestione/approvazione) apre già sui bonifici.
  const { roles } = useAuth();
  const soloTesoreria = roles.includes("tesoreria") && !roles.some((x) =>
    ["amministratore", "approvatore_richieste_liv1", "approvatore_richieste_liv2", "gestore_richieste", "esecutore_richieste"].includes(x));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tutte le richieste</h1>
        <p className="text-sm text-muted-foreground">Elenco completo (esclusi archivi)</p>
      </div>
      <RichiesteTable chiaveFiltri="richieste-interne:tutte" filtroBonificiDefault={soloTesoreria} rows={data} isLoading={isLoading} unreadIds={unreadIds} />
    </div>
  );
}
