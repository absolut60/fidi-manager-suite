import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RichiesteTable, type RichiestaRow } from "@/components/richieste-interne/richieste-table";
import { useRichiesteNonLette } from "@/hooks/use-richieste-non-lette";

export const Route = createFileRoute("/_app/richieste-interne/tutte")({
  component: TutteRichieste,
});

const SELECT =
  "id,title,description,requester_name,sede_name,type,fornitore,amount,status,admin_status,created_at,richieste_interne_allegati(id)";

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tutte le richieste</h1>
        <p className="text-sm text-muted-foreground">Elenco completo (esclusi archivi)</p>
      </div>
      <RichiesteTable rows={data} isLoading={isLoading} unreadIds={unreadIds} />
    </div>
  );
}
