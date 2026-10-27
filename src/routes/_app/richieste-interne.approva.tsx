import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { IntestazioneRichieste } from "@/components/richieste-interne/intestazione";
import { STILE_PAGINA } from "@/components/richieste-interne/stili";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RichiesteTable, type RichiestaRow } from "@/components/richieste-interne/richieste-table";
import { useRichiesteNonLette } from "@/hooks/use-richieste-non-lette";

export const Route = createFileRoute("/_app/richieste-interne/approva")({
  validateSearch: zodValidator(z.object({ livello: fallback(z.string().optional(), undefined) })),
  component: ApprovaRichieste,
});

const SELECT =
  "id,title,description,requester_name,sede_name,type,fornitore,amount,status,admin_status,created_at,acconto_richiesto,acconto_importo,acconto_stato,acconto_data_prevista,modalita_pagamento_testo,richieste_interne_allegati(id)";

function ApprovaRichieste() {
  const { roles } = useAuth();
  const userRoles = roles as string[];
  const unreadIds = useRichiesteNonLette();
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
    ? "In attesa del Responsabile e inoltrate alla Direzione"
    : isLiv1
      ? "Richieste in attesa del tuo esame"
      : isLiv2
        ? "Richieste inoltrate dal Responsabile"
        : "Nessun ruolo di approvazione";

  // Livello dall'URL (riquadri dashboard): filtro solo di visualizzazione sulle righe già lette.
  type Livello = "tutti" | "responsabile" | "direzione";
  const [livello, setLivello] = useState<Livello>("tutti");
  const { livello: livelloUrl } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  useEffect(() => {
    if (livelloUrl === undefined) return;
    if (livelloUrl === "responsabile" || livelloUrl === "direzione") setLivello(livelloUrl);
    navigate({ search: {}, replace: true });
  }, [livelloUrl, navigate]);

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

  const righe = useMemo(() => {
    if (!data || livello === "tutti") return data;
    const s = livello === "responsabile" ? "pending" : "forwarded";
    return data.filter((r) => r.status === s);
  }, [data, livello]);
  const mostraLivelli = (isLiv1 && isLiv2) || livello !== "tutti";

  return (
    <div className="space-y-4">
      <IntestazioneRichieste
        stile={STILE_PAGINA.approva}
        titolo="Da approvare"
        sottotitolo={sottotitolo}
        azioni={<div className="text-sm text-muted-foreground sm:text-right"><span className="font-semibold text-foreground">{righe?.length ?? 0}</span> in attesa</div>}
      />
      {mostraLivelli && (
        <div className="flex flex-wrap items-center gap-2">
          {([["tutti", "Tutte"], ["responsabile", "Responsabile"], ["direzione", "Direzione"]] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setLivello(k)}
              className={`h-10 px-3 rounded-full text-sm border transition-colors ${livello === k ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      <RichiesteTable chiaveFiltri="richieste-interne:approva" rows={righe} isLoading={isLoading} showAdminBadge={false} emptyLabel="Nessuna richiesta da approvare" unreadIds={unreadIds} />
    </div>
  );
}
