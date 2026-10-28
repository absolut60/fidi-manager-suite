// "Solleciti inviati (n)": elenco compatto delle email di sollecito (livello 1-3)
// del cliente. Dati dalla cache condivisa useAzioniRecuperoCliente.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAzioniRecuperoCliente, useOperatoriAttivita, type Azione } from "@/hooks/use-azioni-recupero-cliente";
import { STADIO_LABEL, classeStadioSollecito } from "@/components/stadio-sollecito-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEuro } from "@/lib/fidi";
import { cn } from "@/lib/utils";

function dataOraIt(v: string): string {
  return new Date(v).toLocaleString("it-IT", {
    timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function SollecitiInviatiLista({ clienteId, onVediEmail }: {
  clienteId: string;
  onVediEmail: (a: Azione) => void;
}) {
  const { azioni, isLoading } = useAzioniRecuperoCliente(clienteId);
  const { data: operatori } = useOperatoriAttivita();
  const nomeOp = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of operatori ?? []) m.set(o.id, `${o.nome ?? ""} ${o.cognome ?? ""}`.trim() || "—");
    return m;
  }, [operatori]);

  const solleciti = useMemo(
    () => (azioni ?? [])
      .filter((a) => a.tipo === "email" && a.livello_sollecito != null && a.livello_sollecito >= 1 && a.livello_sollecito <= 3)
      .sort((a, b) => new Date(b.data_azione).getTime() - new Date(a.data_azione).getTime()),
    [azioni],
  );
  const ids = useMemo(() => solleciti.map((s) => s.id), [solleciti]);

  // Fatture collegate: UNA query per tutte le righe.
  const { data: collegate } = useQuery({
    queryKey: ["solleciti-inviati-collegate", clienteId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("azioni_recupero_scadenze")
        .select("azione_id, scadenze(stato_contabile)")
        .in("azione_id", ids);
      if (error) throw error;
      const m = new Map<string, { n: number; aperte: number }>();
      for (const r of (data ?? []) as unknown as { azione_id: string; scadenze: { stato_contabile: string | null } | null }[]) {
        const v = m.get(r.azione_id) ?? { n: 0, aperte: 0 };
        v.n += 1;
        if (r.scadenze?.stato_contabile === "Aperta") v.aperte += 1;
        m.set(r.azione_id, v);
      }
      return m;
    },
  });

  const n = solleciti.length;
  const [aperto, setAperto] = useState<boolean | null>(null);
  const isOpen = aperto ?? n > 0;

  if (isLoading) return <Skeleton className="h-8 w-full" />;
  if (n === 0) {
    return <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">Nessun sollecito inviato</div>;
  }

  return (
    <div className="rounded-md border border-border min-w-0">
      <button
        type="button"
        onClick={() => setAperto(!isOpen)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium min-h-10"
        aria-expanded={isOpen}
      >
        <ChevronRight className={cn("size-4 shrink-0 transition-transform", isOpen && "rotate-90")} />
        Solleciti inviati ({n})
      </button>
      {isOpen && (
        <ul className="divide-y divide-border border-t border-border">
          {solleciti.map((s) => {
            const c = collegate?.get(s.id);
            const saldate = !!c && c.n > 0 && c.aperte === 0;
            const liv = s.livello_sollecito!;
            return (
              <li
                key={s.id}
                className={cn(
                  "flex flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:items-center sm:gap-3",
                  saldate && "opacity-60",
                )}
              >
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={cn("whitespace-nowrap text-[10px] h-5", classeStadioSollecito(liv))}>{STADIO_LABEL[liv]}</Badge>
                  <span className="tabular-nums whitespace-nowrap">{dataOraIt(s.data_azione)}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                  <span>{s.operatore_id ? nomeOp.get(s.operatore_id) ?? "—" : "—"}</span>
                  <span className="tabular-nums text-foreground">{formatEuro(s.importo_riferimento ?? 0)}</span>
                  <span>{c ? `${c.n} ${c.n === 1 ? "fattura" : "fatture"}` : "—"}</span>
                  {saldate && <span className="italic">fatture saldate</span>}
                  <span className="min-w-0 break-all">{s.email_destinatario ?? "—"}</span>
                </div>
                {s.email_corpo_html && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 self-end sm:self-auto"
                    onClick={() => onVediEmail(s)}
                    title="Vedi email inviata"
                    aria-label="Vedi email inviata"
                  >
                    <Eye className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
