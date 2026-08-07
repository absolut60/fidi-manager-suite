import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Layers } from "lucide-react";

type RigaAggregata = {
  tipo: "sede" | "fascia";
  chiave: string;
  etichetta: string;
  ordine: number;
  n_clienti: number;
  n_clienti_con_fido: number;
  fido_concesso_eur: number;
  fido_proposto_eur: number;
};

function euro(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function numero(n: number) {
  return new Intl.NumberFormat("it-IT").format(n);
}

function Variazione({ concesso, proposto }: { concesso: number; proposto: number }) {
  const delta = proposto - concesso;
  const perc = concesso > 0 ? (delta / concesso) * 100 : null;
  const positivo = delta >= 0;
  return (
    <span className={positivo ? "text-success font-medium" : "text-warning font-medium"}>
      {positivo ? "+" : "−"}
      {euro(Math.abs(delta))}
      {perc != null && (
        <span className="text-xs ml-1 opacity-80">
          ({positivo ? "+" : "−"}
          {Math.abs(perc).toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

export function DashboardFidiDettaglio() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-fidi-aggregati"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_dashboard_fidi_aggregati");
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        tipo: r.tipo,
        chiave: r.chiave,
        etichetta: r.etichetta,
        ordine: Number(r.ordine ?? 0),
        n_clienti: Number(r.n_clienti ?? 0),
        n_clienti_con_fido: Number(r.n_clienti_con_fido ?? 0),
        fido_concesso_eur: Number(r.fido_concesso_eur ?? 0),
        fido_proposto_eur: Number(r.fido_proposto_eur ?? 0),
      })) as RigaAggregata[];
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-40 mb-4" />
            <Skeleton className="h-48 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Impossibile caricare il dettaglio degli affidamenti.</p>
      </Card>
    );
  }

  const sedi = data
    .filter((r) => r.tipo === "sede")
    .sort((a, b) => b.fido_concesso_eur - a.fido_concesso_eur);
  const fasce = data.filter((r) => r.tipo === "fascia").sort((a, b) => a.ordine - b.ordine);

  const tot = (rows: RigaAggregata[], k: "n_clienti" | "fido_concesso_eur" | "fido_proposto_eur") =>
    rows.reduce((s, r) => s + r[k], 0);

  const vaiClienti = (search: Record<string, string>) => {
    navigate({ to: "/clienti", search: search as any });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* TABELLA 1 — per punto vendita */}
      <Card className="p-4 sm:p-5 overflow-hidden">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Affidamenti per punto vendita</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Concesso (fido gestionale) e proposto (calcolo teorico) per sede, ordinati per concesso decrescente.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sede</TableHead>
                <TableHead className="text-right">Clienti</TableHead>
                <TableHead className="text-right">Concesso</TableHead>
                <TableHead className="text-right">Proposto</TableHead>
                <TableHead className="text-right">Variazione</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sedi.map((r) => (
                <TableRow
                  key={r.chiave}
                  className="cursor-pointer"
                  onClick={() => r.chiave !== "nessuna" && vaiClienti({ store: r.chiave })}
                >
                  <TableCell className="font-medium whitespace-nowrap">{r.etichetta}</TableCell>
                  <TableCell className="text-right tabular-nums">{numero(r.n_clienti)}</TableCell>
                  <TableCell className="text-right tabular-nums">{euro(r.fido_concesso_eur)}</TableCell>
                  <TableCell className="text-right tabular-nums">{euro(r.fido_proposto_eur)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    <Variazione concesso={r.fido_concesso_eur} proposto={r.fido_proposto_eur} />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Totale</TableCell>
                <TableCell className="text-right tabular-nums">{numero(tot(sedi, "n_clienti"))}</TableCell>
                <TableCell className="text-right tabular-nums">{euro(tot(sedi, "fido_concesso_eur"))}</TableCell>
                <TableCell className="text-right tabular-nums">{euro(tot(sedi, "fido_proposto_eur"))}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  <Variazione
                    concesso={tot(sedi, "fido_concesso_eur")}
                    proposto={tot(sedi, "fido_proposto_eur")}
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* TABELLA 2 — per fasce di importo */}
      <Card className="p-4 sm:p-5 overflow-hidden">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Affidamenti per fasce di importo</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Fascia calcolata sul <strong>fido concesso</strong>; le colonne proposto e variazione si riferiscono
          agli <strong>stessi clienti</strong> della fascia.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fascia (concesso)</TableHead>
                <TableHead className="text-right">Clienti</TableHead>
                <TableHead className="text-right">Concesso</TableHead>
                <TableHead className="text-right">Proposto</TableHead>
                <TableHead className="text-right">Variazione</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fasce.map((r) => (
                <TableRow key={r.chiave} className="cursor-pointer" onClick={() => vaiClienti({ fascia: r.chiave })}>
                  <TableCell className="font-medium whitespace-nowrap">{r.etichetta}</TableCell>
                  <TableCell className="text-right tabular-nums">{numero(r.n_clienti)}</TableCell>
                  <TableCell className="text-right tabular-nums">{euro(r.fido_concesso_eur)}</TableCell>
                  <TableCell className="text-right tabular-nums">{euro(r.fido_proposto_eur)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    <Variazione concesso={r.fido_concesso_eur} proposto={r.fido_proposto_eur} />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Totale</TableCell>
                <TableCell className="text-right tabular-nums">{numero(tot(fasce, "n_clienti"))}</TableCell>
                <TableCell className="text-right tabular-nums">{euro(tot(fasce, "fido_concesso_eur"))}</TableCell>
                <TableCell className="text-right tabular-nums">{euro(tot(fasce, "fido_proposto_eur"))}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  <Variazione
                    concesso={tot(fasce, "fido_concesso_eur")}
                    proposto={tot(fasce, "fido_proposto_eur")}
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
