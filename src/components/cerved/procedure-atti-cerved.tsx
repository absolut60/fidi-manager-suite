import type { VoceProceduraAtto } from "@/lib/cerved-presentazione";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** FM99-B: "Procedure e atti di Conservatoria" — una scheda per voce, nessun cambio pagina. */
export function ProcedureAttiCerved({ voci }: { voci: VoceProceduraAtto[] }) {
  if (!voci.length) return null;
  return (
    <section aria-label="Procedure e atti di Conservatoria">
      <Card className="rounded-md border-l-4 border-l-primary"><CardContent className="space-y-3 p-4">
        <h3 className="text-sm font-semibold">Procedure e atti di Conservatoria</h3>
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {voci.map((v) => {
            const rosso = v.badge.some((b) => b.tono === "rosso");
            return (
              <li key={v.chiave} className={`min-w-0 rounded-sm border border-l-4 bg-card p-3 ${rosso ? "border-l-destructive" : "border-l-border"}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold">{v.titolo}</p>
                    <p className="text-xs text-muted-foreground">{v.tipo === "procedura" ? "Procedura concorsuale" : "Atto di Conservatoria"}{v.data ? ` · ${v.data}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 sm:shrink-0 sm:justify-end">
                    {v.badge.map((b) => (
                      <Badge key={b.testo} variant="outline" className={`h-auto whitespace-normal text-xs ${b.tono === "rosso" ? "border-destructive text-destructive" : "text-muted-foreground"} ${b.barrato ? "line-through" : ""}`}>{b.testo}</Badge>
                    ))}
                  </div>
                </div>
                {v.soggetto && <p className="mt-1 break-words text-xs font-medium">riguarda {v.soggetto}</p>}
                {v.dettagli.length > 0 && <p className="mt-1 break-words text-xs text-muted-foreground">{v.dettagli.join(" · ")}</p>}
              </li>
            );
          })}
        </ul>
      </CardContent></Card>
    </section>
  );
}
