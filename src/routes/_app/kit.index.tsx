import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Copy, Eye, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  duplicateKit,
  fetchKitsWithComponenti,
  calcolaTotaliKit,
  type FasciaListino,
  type KitConComponenti,
} from "@/lib/kit-api";
import { FAMIGLIE_KIT, FAMIGLIA_LABEL } from "@/lib/incidenza";
import { FASCE } from "@/lib/articoli-api";
import { NuovoKitDialog } from "@/components/kit/NuovoKitDialog";

export const Route = createFileRoute("/_app/kit/")({
  head: () => ({ meta: [{ title: "Kit / Lavorazioni — Sistema MADE" }] }),
  component: KitListPage,
});

function KitListPage() {
  const qc = useQueryClient();
  const [fascia, setFascia] = useState<FasciaListino>("A");
  const [openNew, setOpenNew] = useState(false);

  const { data: kits = [], isLoading } = useQuery({
    queryKey: ["kits-with-comp"],
    queryFn: fetchKitsWithComponenti,
  });

  const grouped = useMemo(() => {
    const m = new Map<string, KitConComponenti[]>();
    for (const f of FAMIGLIE_KIT) m.set(f, []);
    for (const k of kits) {
      const arr = m.get(k.famiglia) ?? [];
      arr.push(k);
      m.set(k.famiglia, arr);
    }
    return m;
  }, [kits]);

  const dupMut = useMutation({
    mutationFn: (id: string) => duplicateKit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kits-with-comp"] });
      toast.success("Kit duplicato");
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <div className="flex flex-col gap-4 p-3 md:p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Kit / Lavorazioni</h1>
          <p className="text-sm text-muted-foreground">
            Libreria delle lavorazioni-tipo con regole di incidenza standard MADE.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Fascia listino:</span>
            <Select value={fascia} onValueChange={(v) => setFascia(v as FasciaListino)}>
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FASCE.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nuovo kit
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : kits.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Layers className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nessun kit ancora. Inizia creandone uno.
            </p>
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="mr-1 h-4 w-4" /> Nuovo kit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {FAMIGLIE_KIT.map((f) => {
            const arr = grouped.get(f) ?? [];
            if (!arr.length) return null;
            return (
              <section key={f} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {FAMIGLIA_LABEL[f]}
                  </h2>
                  <Badge variant="secondary">{arr.length}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {arr.map((k) => {
                    const tot = calcolaTotaliKit(k.componenti, fascia);
                    return (
                      <Card key={k.id} className="transition hover:shadow-md">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-start justify-between gap-2 text-base">
                            <span className="truncate">{k.nome}</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {k.um_base}
                            </span>
                          </CardTitle>
                          <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                            {k.spessore != null && <span>sp. {Number(k.spessore)} mm</span>}
                            {k.tipo_struttura && <span>· {k.tipo_struttura}</span>}
                            {k.h_max != null && <span>· h.max {Number(k.h_max)} m</span>}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-2 font-mono text-xs">
                            <div>
                              <div className="text-[10px] uppercase text-muted-foreground">Prezzo/{k.um_base}</div>
                              <div className="text-sm font-semibold">€ {tot.prezzo_mq.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase text-muted-foreground">Costo/{k.um_base}</div>
                              <div className="text-sm">€ {tot.costo_mq.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase text-muted-foreground">Margine</div>
                              <div className={`text-sm font-semibold ${tot.margine_perc < 0 ? "text-destructive" : ""}`}>
                                {tot.margine_perc.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{k.componenti.length} componenti · {tot.kg_mq.toFixed(2)} kg/{k.um_base}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button asChild size="sm" variant="outline" className="flex-1">
                              <Link to="/kit/$id" params={{ id: k.id }}>
                                <Eye className="mr-1 h-3 w-3" /> Apri
                              </Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => dupMut.mutate(k.id)}
                              disabled={dupMut.isPending}
                            >
                              <Copy className="mr-1 h-3 w-3" /> Duplica
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <NuovoKitDialog open={openNew} onOpenChange={setOpenNew} />
    </div>
  );
}
