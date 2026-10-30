import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEuro } from "@/lib/fidi";
import {
  PROFILO_FIDO_LABEL,
  fetchFidoTeoricoNuovo,
  fetchUtentiAnteprimaFidoNuovo,
} from "@/lib/fido-teorico";

function formatDataOra(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** FM55 — riquadro "Fido teorico nuovo", visibile solo agli utenti in anteprima. */
export function FidoTeoricoNuovoBlocco({ clienteId }: { clienteId: string }) {
  const { user } = useAuth();
  const { data: abilitati } = useQuery({
    queryKey: ["fido-v2-anteprima-utenti"],
    queryFn: fetchUtentiAnteprimaFidoNuovo,
    staleTime: 5 * 60_000,
  });
  const abilitato = !!user && (abilitati ?? []).includes(user.id);
  const { data: r } = useQuery({
    queryKey: ["fido-teorico-nuovo", clienteId],
    queryFn: () => fetchFidoTeoricoNuovo(clienteId),
    enabled: abilitato && !!clienteId,
  });

  if (!abilitato || !r) return null;

  const calcolo = r.regola === "calcolo";
  const profilo = r.profilo ? PROFILO_FIDO_LABEL[r.profilo] ?? r.profilo : null;
  const coef = r.coefficiente != null && r.coefficiente !== 1
    ? r.coefficiente.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;
  const fidoGamma = r.fido_attuale ?? 0;
  const consumo = r.consumo_perc != null ? r.consumo_perc * 100 : null;
  const consumoClasse = consumo == null ? "" : consumo >= 100
    ? "text-destructive font-semibold" : consumo >= 80 ? "text-warning font-semibold" : "text-foreground";

  return (
    <Card className="p-4 sm:p-5 space-y-4 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">Fido teorico nuovo</h3>
        <Badge variant="outline">Anteprima</Badge>
      </div>

      {calcolo && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-md border p-3 min-w-0">
            <div className="text-xs text-muted-foreground">Base</div>
            <div className="text-2xl sm:text-3xl font-semibold break-words">{formatEuro(r.base ?? 0)}</div>
            <div className="text-xs text-muted-foreground">quanto serve di solito</div>
          </div>
          <div className="rounded-md border p-3 min-w-0">
            <div className="text-xs text-muted-foreground">Fabbisogno oggi</div>
            <div className="text-2xl sm:text-3xl font-semibold break-words">{formatEuro(r.fabbisogno ?? 0)}</div>
            <div className="text-xs text-muted-foreground">debito di oggi più ordini aperti</div>
          </div>
          <div className="rounded-md border border-primary bg-primary/5 p-3 min-w-0">
            <div className="text-xs text-muted-foreground">Fido proposto</div>
            <div className="text-2xl sm:text-3xl font-bold text-primary break-words">{formatEuro(r.fido_proposto ?? 0)}</div>
          </div>
        </div>
      )}

      {calcolo && (
        <p className="text-sm break-words">
          Fido in Gamma: {formatEuro(fidoGamma)}
          {fidoGamma > 0 && consumo != null && (
            <> · Consumo: <span className={consumoClasse}>
              {Math.round(consumo).toLocaleString("it-IT")}%
            </span></>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {profilo && <Badge variant="secondary">{profilo}{coef ? ` · ${coef}` : ""}</Badge>}
        {r.da_verificare && <Badge variant="outline" className="border-warning text-warning">Da verificare</Badge>}
      </div>

      {r.spiegazione && (
        <div className="rounded-md bg-muted/50 p-3 text-sm break-words">{r.spiegazione}</div>
      )}

      <p className="text-xs text-muted-foreground">Calcolo aggiornato al {formatDataOra(r.calcolato_at)}</p>
    </Card>
  );
}
