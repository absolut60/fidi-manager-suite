// Pagina riepilogo TUTTI i piani di rientro (menu Recupero crediti).
// Filtri: stato, livello, ricerca cliente. Ordinamento cliccabile.
// Badge in alto: attivi, con rata scaduta, totale in piani attivi.
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtEuro, fmtDate, type PianoStato } from "@/lib/piani-rientro";

export const Route = createFileRoute("/_app/piani-rientro")({
  component: PianiRientroPage,
});

type Row = {
  piano_id: string;
  cliente_id: string;
  ragione_sociale: string;
  livello: number;
  stato: PianoStato;
  created_at: string;
  n_documenti: number;
  totale_documenti: number;
  n_rate_totali: number;
  n_rate_pagate: number;
  prossima_data: string | null;
  prossima_importo: number | null;
  ritardo_giorni: number | null;
  totale_rate: number;
};

const STATO_LABEL: Record<PianoStato, string> = {
  attivo: "Attivo", completato: "Completato", non_rispettato: "Non rispettato", annullato: "Annullato",
};
const STATO_CLASS: Record<PianoStato, string> = {
  attivo: "bg-primary/15 text-primary border-primary/30",
  completato: "bg-emerald-600/15 text-emerald-700 border-emerald-600/30",
  non_rispettato: "bg-destructive/15 text-destructive border-destructive/30",
  annullato: "bg-muted text-muted-foreground border-border",
};

type SortKey = "cliente" | "stato" | "livello" | "rate" | "prossima" | "ritardo";

function PianiRientroPage() {
  const navigate = useNavigate();
  const [statoF, setStatoF] = useState<string>("tutti");
  const [livelloF, setLivelloF] = useState<string>("tutti");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("prossima");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["piani-rientro-lista"],
    queryFn: async () => {
      // 1) piani
      const { data: piani, error: eP } = await supabase
        .from("piani_rientro" as never)
        .select("id, cliente_id, livello, stato, created_at, cliente:clienti!inner(id, ragione_sociale)")
        .order("created_at", { ascending: false });
      if (eP) throw eP;
      const pRows = (piani ?? []) as unknown as Array<{
        id: string; cliente_id: string; livello: number; stato: PianoStato; created_at: string;
        cliente: { id: string; ragione_sociale: string };
      }>;
      if (pRows.length === 0) return [] as Row[];

      const pianiIds = pRows.map((p) => p.id);
      // 2) rate
      const { data: rate, error: eR } = await supabase
        .from("piani_rientro_rate" as never)
        .select("piano_id, stato, data_rata, importo")
        .in("piano_id", pianiIds);
      if (eR) throw eR;

      // 3) documenti
      const { data: docs, error: eD } = await supabase
        .from("piani_rientro_documenti" as never)
        .select("piano_id, importo_alla_selezione")
        .in("piano_id", pianiIds);
      if (eD) throw eD;

      const today = new Date().toISOString().slice(0, 10);
      const rateByPiano = new Map<string, Array<{ stato: string; data_rata: string; importo: number }>>();
      for (const r of (rate ?? []) as never as Array<{ piano_id: string; stato: string; data_rata: string; importo: number }>) {
        if (!rateByPiano.has(r.piano_id)) rateByPiano.set(r.piano_id, []);
        rateByPiano.get(r.piano_id)!.push(r);
      }
      const docsByPiano = new Map<string, Array<{ importo_alla_selezione: number | null }>>();
      for (const d of (docs ?? []) as never as Array<{ piano_id: string; importo_alla_selezione: number | null }>) {
        if (!docsByPiano.has(d.piano_id)) docsByPiano.set(d.piano_id, []);
        docsByPiano.get(d.piano_id)!.push({ importo_alla_selezione: d.importo_alla_selezione });
      }

      return pRows.map<Row>((p) => {
        const rr = rateByPiano.get(p.id) ?? [];
        const dd = docsByPiano.get(p.id) ?? [];
        const daPagare = rr.filter((r) => r.stato === "da_pagare").sort((a, b) => a.data_rata.localeCompare(b.data_rata));
        const nx = daPagare[0] ?? null;
        const scaduteAperte = rr.filter((r) => r.stato === "da_pagare" && r.data_rata < today);
        const ritardo = scaduteAperte.length > 0
          ? Math.floor((Date.now() - new Date(scaduteAperte[0].data_rata).getTime()) / 86400000)
          : null;
        return {
          piano_id: p.id,
          cliente_id: p.cliente_id,
          ragione_sociale: p.cliente.ragione_sociale,
          livello: p.livello,
          stato: p.stato,
          created_at: p.created_at,
          n_documenti: dd.length,
          totale_documenti: dd.reduce((a, d) => a + Number(d.importo_alla_selezione ?? 0), 0),
          n_rate_totali: rr.length,
          n_rate_pagate: rr.filter((r) => r.stato === "pagata").length,
          prossima_data: nx?.data_rata ?? null,
          prossima_importo: nx ? Number(nx.importo) : null,
          ritardo_giorni: ritardo,
          totale_rate: rr.reduce((a, r) => a + Number(r.importo), 0),
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statoF !== "tutti" && r.stato !== statoF) return false;
      if (livelloF !== "tutti" && String(r.livello) !== livelloF) return false;
      if (q && !r.ragione_sociale.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, statoF, livelloF, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "cliente": return dir * a.ragione_sociale.localeCompare(b.ragione_sociale);
        case "stato": return dir * a.stato.localeCompare(b.stato);
        case "livello": return dir * (a.livello - b.livello);
        case "rate": return dir * (a.n_rate_pagate / Math.max(1, a.n_rate_totali) - b.n_rate_pagate / Math.max(1, b.n_rate_totali));
        case "prossima":
          if (!a.prossima_data && !b.prossima_data) return 0;
          if (!a.prossima_data) return 1;
          if (!b.prossima_data) return -1;
          return dir * a.prossima_data.localeCompare(b.prossima_data);
        case "ritardo": return dir * ((a.ritardo_giorni ?? -1) - (b.ritardo_giorni ?? -1));
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  const kpi = useMemo(() => {
    const attivi = rows.filter((r) => r.stato === "attivo");
    const conScaduta = attivi.filter((r) => (r.ritardo_giorni ?? 0) > 0);
    const totale = attivi.reduce((a, r) => a + r.totale_rate, 0);
    return { n_attivi: attivi.length, n_con_scaduta: conScaduta.length, totale };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarClock className="size-7 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Piani di rientro</h1>
          <p className="text-sm text-muted-foreground">Elenco di tutti gli accordi di rientro concordati con i clienti</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Piani attivi" value={String(kpi.n_attivi)} icon={CheckCircle2} tone="ok" />
        <KpiCard label="Con rata scaduta" value={String(kpi.n_con_scaduta)} icon={AlertTriangle} tone="danger" />
        <KpiCard label="Totale in piani attivi" value={fmtEuro(kpi.totale)} icon={CalendarClock} tone="info" />
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input placeholder="Cerca cliente…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={statoF} onValueChange={setStatoF}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            <SelectItem value="attivo">Attivi</SelectItem>
            <SelectItem value="completato">Completati</SelectItem>
            <SelectItem value="non_rispettato">Non rispettati</SelectItem>
            <SelectItem value="annullato">Annullati</SelectItem>
          </SelectContent>
        </Select>
        <Select value={livelloF} onValueChange={setLivelloF}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i livelli</SelectItem>
            <SelectItem value="1">Livello 1</SelectItem>
            <SelectItem value="2">Livello 2</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card>
        {isLoading ? <Skeleton className="h-64 m-4" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("cliente")}>Cliente</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("livello")}>Livello</TableHead>
                <TableHead className="text-right">Documenti</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("rate")}>Rate</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("prossima")}>Prossima rata</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("stato")}>Stato</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("ritardo")}>Ritardo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                    Nessun piano di rientro trovato.
                  </TableCell>
                </TableRow>
              ) : sorted.map((r) => (
                <TableRow key={r.piano_id} className="cursor-pointer"
                  onClick={() => navigate({
                    to: "/clienti/$clienteId",
                    params: { clienteId: r.cliente_id },
                    search: { tab: "insoluti", insolutiTab: "piani" } as never,
                  })}>
                  <TableCell className="font-medium">{r.ragione_sociale}</TableCell>
                  <TableCell>L{r.livello}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.n_documenti} · {fmtEuro(r.totale_documenti)}</TableCell>
                  <TableCell>{r.n_rate_pagate}/{r.n_rate_totali}</TableCell>
                  <TableCell>
                    {r.prossima_data ? (
                      <span>{fmtDate(r.prossima_data)} · <strong>{fmtEuro(r.prossima_importo)}</strong></span>
                    ) : "—"}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={STATO_CLASS[r.stato]}>{STATO_LABEL[r.stato]}</Badge></TableCell>
                  <TableCell>
                    {r.ritardo_giorni != null && r.ritardo_giorni > 0 ? (
                      <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">{r.ritardo_giorni} gg</Badge>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof CalendarClock; tone: "ok" | "danger" | "info" }) {
  const cls = tone === "danger" ? "bg-destructive/10 text-destructive"
    : tone === "ok" ? "bg-emerald-600/10 text-emerald-700"
    : "bg-primary/10 text-primary";
  return (
    <Card className="p-4 flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
        <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      </div>
      <div className={`size-10 rounded-lg grid place-content-center ${cls}`}><Icon className="size-5" /></div>
    </Card>
  );
}
