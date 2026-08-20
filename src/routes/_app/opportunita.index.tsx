// Modulo commerciale (CRM) — lista opportunità con riepilogo pipeline, filtri e dialog crea/modifica.
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Pencil, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FiltriCollassabili } from "@/components/lista-responsive";
import { OpportunitaDialog } from "@/components/opportunita-dialog";
import {
  STATI_OPPORTUNITA, TIPI_OPPORTUNITA, STATO_LABEL, STATO_CLASS, TIPO_LABEL,
  fmtEuro, fmtData, nomeSoggetto,
  type OpportunitaRow, type StatoOpportunita,
} from "@/lib/opportunita";

export const Route = createFileRoute("/_app/opportunita/")({
  head: () => ({
    meta: [
      { title: "Opportunità commerciali — FidiManager" },
      { name: "description", content: "Pipeline commerciale: opportunità di vendita su clienti e lead." },
      { property: "og:title", content: "Opportunità commerciali — FidiManager" },
      { property: "og:description", content: "Pipeline commerciale: opportunità di vendita su clienti e lead." },
    ],
  }),
  component: OpportunitaPage,
});

const PAGINA = 1000;

function OpportunitaPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isTrasversale = roles.some((r) =>
    ["amministratore", "amministrazione", "direzione", "marketing", "store_manager"].includes(r),
  );

  const [search, setSearch] = useState("");
  const [statoF, setStatoF] = useState<string>("tutti");
  const [tipoF, setTipoF] = useState<string>("tutti");
  const [agenteF, setAgenteF] = useState<string>("tutti");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inModifica, setInModifica] = useState<OpportunitaRow | null>(null);

  const { data: agenti = [] } = useQuery({
    queryKey: ["agenti-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return (data ?? []) as Array<{ codice: string; descrizione: string | null }>;
    },
    staleTime: 300_000,
  });
  const agenteLabel = useMemo(() => {
    const m = new Map<string, string>();
    agenti.forEach((a) => m.set(a.codice, a.descrizione ?? a.codice));
    return m;
  }, [agenti]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["opportunita-lista"],
    queryFn: async () => {
      // Paginazione esplicita: PostgREST tronca a 1000 righe.
      const out: OpportunitaRow[] = [];
      for (let da = 0; ; da += PAGINA) {
        const { data, error } = await supabase
          .from("opportunita")
          .select(
            "*, clienti(ragione_sociale, codice_agente), lead(ragione_sociale, nome, cognome), cantieri(nome)",
          )
          .order("created_at", { ascending: false })
          .range(da, da + PAGINA - 1);
        if (error) throw error;
        const batch = (data ?? []) as unknown as OpportunitaRow[];
        out.push(...batch);
        if (batch.length < PAGINA) break;
      }
      return out;
    },
  });

  const filtrate = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((o) => {
      if (statoF !== "tutti" && o.stato !== statoF) return false;
      if (tipoF !== "tutti" && o.tipo !== tipoF) return false;
      if (agenteF !== "tutti" && (o.agente_codice ?? "") !== agenteF) return false;
      if (q) {
        const hay = `${o.titolo} ${nomeSoggetto(o)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statoF, tipoF, agenteF]);

  const riepilogo = useMemo(() => {
    return STATI_OPPORTUNITA.map((s) => {
      const items = filtrate.filter((o) => o.stato === s);
      return {
        stato: s,
        n: items.length,
        totale: items.reduce((acc, o) => acc + (o.valore_stimato ?? 0), 0),
      };
    });
  }, [filtrate]);

  const filtriAttivi =
    (search.trim() ? 1 : 0) + (statoF !== "tutti" ? 1 : 0) + (tipoF !== "tutti" ? 1 : 0) + (agenteF !== "tutti" ? 1 : 0);

  async function cambiaStato(o: OpportunitaRow, nuovo: StatoOpportunita) {
    const chiude = nuovo === "vinta" || nuovo === "persa";
    const { error } = await supabase
      .from("opportunita")
      .update({
        stato: nuovo,
        data_chiusura: chiude ? (o.data_chiusura ?? new Date().toISOString().slice(0, 10)) : null,
        motivo_perdita: nuovo === "persa" ? o.motivo_perdita : null,
      })
      .eq("id", o.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Stato aggiornato: ${STATO_LABEL[nuovo]}`);
    qc.invalidateQueries({ queryKey: ["opportunita-lista"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Target className="size-5 text-primary" />
            Opportunità
          </h1>
          <p className="text-sm text-muted-foreground">Pipeline commerciale su clienti e lead.</p>
        </div>
        <Button onClick={() => { setInModifica(null); setDialogOpen(true); }}>
          <Plus className="size-4" /> Nuova opportunità
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {riepilogo.map((r) => (
          <Card key={r.stato} className="p-3">
            <Badge variant="outline" className={STATO_CLASS[r.stato]}>{STATO_LABEL[r.stato]}</Badge>
            <div className="mt-2 text-xl font-semibold">{r.n}</div>
            <div className="text-xs text-muted-foreground">{fmtEuro(r.totale)}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <FiltriCollassabili
          attivi={filtriAttivi}
          azioni={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setStatoF("tutti"); setTipoF("tutti"); setAgenteF("tutti"); }}
            >
              Azzera
            </Button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Cerca titolo o soggetto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statoF} onValueChange={setStatoF}>
              <SelectTrigger><SelectValue placeholder="Stato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli stati</SelectItem>
                {STATI_OPPORTUNITA.map((s) => <SelectItem key={s} value={s}>{STATO_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={tipoF} onValueChange={setTipoF}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i tipi</SelectItem>
                {TIPI_OPPORTUNITA.map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            {isTrasversale && (
              <Select value={agenteF} onValueChange={setAgenteF}>
                <SelectTrigger><SelectValue placeholder="Agente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutti">Tutti gli agenti</SelectItem>
                  {agenti.map((a) => (
                    <SelectItem key={a.codice} value={a.codice}>{a.descrizione ?? a.codice}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </FiltriCollassabili>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtrate.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Nessuna opportunità trovata.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titolo</TableHead>
                  <TableHead>Soggetto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Valore stimato</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Chiusura prevista</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrate.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.titolo}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={o.cliente_id ? "default" : "secondary"} className="shrink-0">
                          {o.cliente_id ? "Cliente" : "Lead"}
                        </Badge>
                        <span className="truncate">{nomeSoggetto(o)}</span>
                      </div>
                    </TableCell>
                    <TableCell>{TIPO_LABEL[o.tipo]}</TableCell>
                    <TableCell>
                      <Select value={o.stato} onValueChange={(v) => cambiaStato(o, v as StatoOpportunita)}>
                        <SelectTrigger className="h-8 w-[150px]">
                          <Badge variant="outline" className={STATO_CLASS[o.stato]}>{STATO_LABEL[o.stato]}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {STATI_OPPORTUNITA.map((s) => (
                            <SelectItem key={s} value={s}>{STATO_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEuro(o.valore_stimato)}</TableCell>
                    <TableCell>{o.agente_codice ? (agenteLabel.get(o.agente_codice) ?? o.agente_codice) : "—"}</TableCell>
                    <TableCell>{fmtData(o.data_prevista_chiusura)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Modifica"
                        onClick={() => { setInModifica(o); setDialogOpen(true); }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <OpportunitaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        opportunita={inModifica}
        agenti={agenti}
      />
    </div>
  );
}
