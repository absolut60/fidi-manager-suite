import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useState } from "react";
import { IntestazioneRichieste } from "@/components/richieste-interne/intestazione";
import { STILE_PAGINA } from "@/components/richieste-interne/stili";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RichiesteTable, type RichiestaRow } from "@/components/richieste-interne/richieste-table";
import { useRichiesteNonLette } from "@/hooks/use-richieste-non-lette";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/richieste-interne/tutte")({
  validateSearch: zodValidator(z.object({ bonifici: fallback(z.union([z.string(), z.number()]).optional(), undefined) })),
  component: TutteRichieste,
});

const SELECT =
  "id,title,description,requester_name,sede_name,type,fornitore,amount,status,admin_status,created_at,acconto_richiesto,acconto_importo,acconto_stato,acconto_data_prevista,richieste_interne_allegati(id)";

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
  // ?bonifici=1 (riquadro Tesoreria): solo bonifici da eseguire, periodo "Tutto"; poi l'URL si pulisce.
  const { bonifici } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [filtroUrl, setFiltroUrl] = useState<{ soloBonifici: boolean; periodo: "tutto" } | undefined>(undefined);
  useEffect(() => {
    if (bonifici === undefined) return;
    if (String(bonifici) === "1") setFiltroUrl({ soloBonifici: true, periodo: "tutto" });
    navigate({ search: {}, replace: true });
  }, [bonifici, navigate]);
  // FM48: chi ha solo la tesoreria (nessun ruolo di gestione/approvazione) apre già sui bonifici.
  const { roles } = useAuth();
  const soloTesoreria = roles.includes("tesoreria") && !roles.some((x) =>
    ["amministratore", "approvatore_richieste_liv1", "approvatore_richieste_liv2", "gestore_richieste", "esecutore_richieste"].includes(x));

  return (
    <div className="space-y-4">
      <IntestazioneRichieste stile={STILE_PAGINA.tutte} titolo="Tutte le richieste" sottotitolo="Elenco completo (esclusi archivi)" />
      <RichiesteTable chiaveFiltri="richieste-interne:tutte" filtroBonificiDefault={soloTesoreria} filtroUrl={filtroUrl} rows={data} isLoading={isLoading} unreadIds={unreadIds} />
    </div>
  );
}
