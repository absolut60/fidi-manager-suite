import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp, Save, Info, Loader2, Timer } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { generaSnapshotOggi } from "@/lib/snapshot.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/recupero-crediti-andamento")({
  component: AndamentoPage,
});

function fmtEuro(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function fmtGiorni(n: number | null | undefined) {
  if (n == null) return "—";
  return `${Math.round(Number(n))} gg`;
}

function AndamentoPage() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === "amministratore";
  const [saving, setSaving] = useState(false);
  const genera = useServerFn(generaSnapshotOggi);

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["snapshot_scaduto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("snapshot_scaduto")
        .select("*")
        .order("data_snapshot", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data;
    },
  });

  const { data: dso, isLoading: loadingDso } = useQuery({
    queryKey: ["dso_aggregato"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dso_aggregato", {
        _cliente_id: null,
        _store_id: null,
        _data_da: null,
        _data_a: null,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const { data: dsoSerie } = useQuery({
    queryKey: ["dso_serie_mensile"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dso_serie_mensile", {
        _cliente_id: null,
        _store_id: null,
        _mesi_indietro: 24,
      });
      if (error) throw error;
      return (data ?? []).map((r: { mese: string; dso_ponderato: number | null; n_scadenze: number }) => ({
        mese: format(new Date(r.mese), "MMM yy", { locale: it }),
        dso: r.dso_ponderato == null ? null : Number(r.dso_ponderato),
        n: r.n_scadenze,
      }));
    },
  });

  const ultimo = snapshots?.[0];
  const finestre = useMemo(() => {
    if (!ultimo) return [];
    return [
      {
        tag: "Totale",
        medio: ultimo.ritardo_medio_tot,
        mediano: ultimo.ritardo_mediano_tot,
        ponderato: ultimo.ritardo_ponderato_tot,
        importo: ultimo.totale_scaduto,
      },
      {
        tag: "Anno solare",
        medio: ultimo.ritardo_medio_solare,
        mediano: ultimo.ritardo_mediano_solare,
        ponderato: ultimo.ritardo_ponderato_solare,
        importo: ultimo.scaduto_solare,
      },
      {
        tag: "Anno mobile",
        medio: ultimo.ritardo_medio_mobile,
        mediano: ultimo.ritardo_mediano_mobile,
        ponderato: ultimo.ritardo_ponderato_mobile,
        importo: ultimo.scaduto_mobile,
      },
    ];
  }, [ultimo]);

  async function onSalva() {
    setSaving(true);
    try {
      await genera({ data: undefined as never });
      toast.success("Snapshot salvato");
      await qc.invalidateQueries({ queryKey: ["snapshot_scaduto"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <TrendingUp className="size-6" /> Andamento / Storico scaduto
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Snapshot mensile dello scaduto, dell'anzianita del credito aperto e dello stato del recupero.
            </p>
            {ultimo && (
              <p className="text-xs text-muted-foreground mt-1">
                Ultimo snapshot: <strong>{format(new Date(ultimo.data_snapshot), "d MMMM yyyy", { locale: it })}</strong>
              </p>
            )}
          </div>
          {isAdmin && (
            <Button onClick={onSalva} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salva snapshot adesso
            </Button>
          )}
        </div>

        {isLoading ? (
          <Skeleton className="h-40" />
        ) : !ultimo ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nessuno snapshot ancora. {isAdmin && "Premi \"Salva snapshot adesso\" per crearne uno."}
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Totale scaduto" value={fmtEuro(Number(ultimo.totale_scaduto))} />
              <KpiCard label="A scadere" value={fmtEuro(Number(ultimo.totale_a_scadere))} />
              <KpiCard label="Clienti con scaduto" value={String(ultimo.n_clienti_con_scaduto)} />
              <KpiCard label="Fatture scadute" value={String(ultimo.n_fatture_scadute)} />
            </div>

            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-semibold">Anzianita media credito scaduto</h2>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Da quanti giorni sono mediamente scaduti i crediti ancora aperti in questa finestra.
                    NON e la velocita di incasso (la data reale di pagamento non e disponibile dal gestionale).
                  </TooltipContent>
                </Tooltip>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Finestra</TableHead>
                    <TableHead className="text-right">Ritardo medio</TableHead>
                    <TableHead className="text-right">Mediano</TableHead>
                    <TableHead className="text-right">Ponderato per importo</TableHead>
                    <TableHead className="text-right">Scaduto in finestra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finestre.map((f) => (
                    <TableRow key={f.tag}>
                      <TableCell>
                        <Badge variant="outline">{f.tag}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmtGiorni(Number(f.medio))}</TableCell>
                      <TableCell className="text-right">{fmtGiorni(Number(f.mediano))}</TableCell>
                      <TableCell className="text-right">{fmtGiorni(Number(f.ponderato))}</TableCell>
                      <TableCell className="text-right">{fmtEuro(Number(f.importo))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5">
                <h3 className="font-semibold mb-3">Distribuzione per ritardo</h3>
                <div className="space-y-2 text-sm">
                  <Riga label="1-30 giorni" value={fmtEuro(Number(ultimo.scaduto_1_30))} />
                  <Riga label="31-60 giorni" value={fmtEuro(Number(ultimo.scaduto_31_60))} />
                  <Riga label="Oltre 60 giorni" value={fmtEuro(Number(ultimo.scaduto_oltre_60))} />
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="font-semibold mb-3">Stato recupero</h3>
                <div className="space-y-2 text-sm">
                  <Riga label="Stadio 0 (mai sollecitati)" value={String(ultimo.n_clienti_stadio_0)} />
                  <Riga label="Stadio 1" value={String(ultimo.n_clienti_stadio_1)} />
                  <Riga label="Stadio 2" value={String(ultimo.n_clienti_stadio_2)} />
                  <Riga label="Messa in mora" value={String(ultimo.n_clienti_stadio_mora)} />
                  <Riga label="Azioni aperte" value={String(ultimo.n_azioni_aperte)} />
                  <Riga label="Azioni in ritardo" value={String(ultimo.n_azioni_in_ritardo)} />
                  <Riga label="Promesse pagamento" value={String(ultimo.n_promesse_pagamento)} />
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <h3 className="font-semibold mb-3">Storico snapshot</h3>
              <Tabs defaultValue="aggregato">
                <TabsList>
                  <TabsTrigger value="aggregato">Aggregato</TabsTrigger>
                </TabsList>
                <TabsContent value="aggregato">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Scaduto</TableHead>
                        <TableHead className="text-right">A scadere</TableHead>
                        <TableHead className="text-right">Ritardo medio</TableHead>
                        <TableHead className="text-right">Clienti</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshots?.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{format(new Date(s.data_snapshot), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="text-right">{fmtEuro(Number(s.totale_scaduto))}</TableCell>
                          <TableCell className="text-right">{fmtEuro(Number(s.totale_a_scadere))}</TableCell>
                          <TableCell className="text-right">{fmtGiorni(Number(s.ritardo_medio_tot))}</TableCell>
                          <TableCell className="text-right">{s.n_clienti_con_scaduto}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </Card>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </Card>
  );
}

function Riga({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b last:border-0 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
