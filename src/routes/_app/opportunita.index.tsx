// Modulo commerciale (CRM) — lista opportunità con riepilogo pipeline, filtri e dialog crea/modifica.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Pencil, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FiltriCollassabili, ElencoSchede, SchedaLista } from "@/components/lista-responsive";
import { OpportunitaDialog } from "@/components/opportunita-dialog";
import { BottoneElimina } from "@/components/conferma-eliminazione";
import { usePermessiCommerciale } from "@/hooks/use-permessi-commerciale";
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
  const { puoEliminareOpportunita } = usePermessiCommerciale();
  const { roles, user } = useAuth();
  const isTrasversale = roles.some((r) =>
    ["amministratore", "amministrazione", "direzione", "marketing", "store_manager", "responsabile_agenti"].includes(r),
  );

  // Filtri conservati con la fonte unica useFiltriPagina.
  const { filtri: F, setCampo, reset: resetFiltri } = useFiltriPagina("opportunita", {
    search: "", statoF: [] as string[], tipoF: [] as string[], agenteF: [] as string[],
  }, { userId: user?.id, valida: { statoF: Array.isArray, tipoF: Array.isArray, agenteF: Array.isArray } });
  const { search, statoF, tipoF } = F;
  // Filtro agente non visibile (non trasversale): il valore salvato non si applica.
  const agenteF = isTrasversale ? F.agenteF : [];
  const setSearch = (v: string) => setCampo("search", v);
  const setStatoF = (v: string[]) => setCampo("statoF", v);
  const setTipoF = (v: string[]) => setCampo("tipoF", v);
  const setAgenteF = (v: string[]) => setCampo("agenteF", v);
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
      if (statoF.length > 0 && !statoF.includes(o.stato)) return false;
      if (tipoF.length > 0 && !tipoF.includes(o.tipo)) return false;
      if (agenteF.length > 0 && !agenteF.includes(o.agente_codice ?? "")) return false;
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
    (search.trim() ? 1 : 0) + (statoF.length > 0 ? 1 : 0) + (tipoF.length > 0 ? 1 : 0) + (agenteF.length > 0 ? 1 : 0);

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

  async function elimina(o: OpportunitaRow) {
    const { error } = await supabase.from("opportunita").delete().eq("id", o.id);
    if (error) {
      toast.error("Eliminazione non riuscita: non hai i permessi su questa opportunità.");
      return;
    }
    toast.success("Opportunità eliminata");
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
              onClick={() => resetFiltri()}
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
            <FiltroMultiplo
              etichetta="Stato" testoTutti="Tutti gli stati"
              opzioni={STATI_OPPORTUNITA.map((s) => ({ valore: s, label: STATO_LABEL[s] }))}
              selezionati={statoF} onChange={setStatoF}
            />
            <FiltroMultiplo
              etichetta="Tipo" testoTutti="Tutti i tipi"
              opzioni={TIPI_OPPORTUNITA.map((t) => ({ valore: t, label: TIPO_LABEL[t] }))}
              selezionati={tipoF} onChange={setTipoF}
            />
            {isTrasversale && (
              <FiltroMultiplo
                etichetta="Agente" testoTutti="Tutti gli agenti" cercabile
                opzioni={agenti.map((a) => ({ valore: a.codice, label: a.descrizione ?? a.codice }))}
                selezionati={agenteF} onChange={setAgenteF}
              />
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
          <>
            <ElencoSchede>
              {filtrate.map((o) => (
                <SchedaLista
                  key={o.id}
                  titolo={
                    <Link to="/opportunita/$opportunitaId" params={{ opportunitaId: o.id }} className="hover:underline">
                      {o.titolo}
                    </Link>
                  }
                  badge={<Badge variant="outline" className={STATO_CLASS[o.stato]}>{STATO_LABEL[o.stato]}</Badge>}
                  campi={[
                    { etichetta: "Soggetto", valore: nomeSoggetto(o) },
                    { etichetta: "Tipo", valore: TIPO_LABEL[o.tipo] },
                    { etichetta: "Valore", valore: fmtEuro(o.valore_stimato) },
                    { etichetta: "Agente", valore: o.agente_codice ? (agenteLabel.get(o.agente_codice) ?? o.agente_codice) : "—" },
                    { etichetta: "Chiusura prevista", valore: fmtData(o.data_prevista_chiusura) },
                  ]}
                  footer={
                    <>
                      <Select value={o.stato} onValueChange={(v) => cambiaStato(o, v as StatoOpportunita)}>
                        <SelectTrigger className="h-8 w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATI_OPPORTUNITA.map((s) => (
                            <SelectItem key={s} value={s}>{STATO_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" onClick={() => { setInModifica(o); setDialogOpen(true); }}>
                        <Pencil className="size-4 mr-1.5" /> Modifica
                      </Button>
                      {puoEliminareOpportunita(o) && (
                        <BottoneElimina
                          etichetta="Elimina"
                          titolo="Eliminare questa opportunità?"
                          descrizione={`"${o.titolo}" verrà eliminata definitivamente insieme alle attività collegate. L'azione è irreversibile.`}
                          onConferma={() => elimina(o)}
                        />
                      )}
                    </>
                  }
                />
              ))}
            </ElencoSchede>

            <div className="hidden md:block">
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
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrate.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/opportunita/$opportunitaId"
                          params={{ opportunitaId: o.id }}
                          className="hover:underline"
                        >
                          {o.titolo}
                        </Link>
                      </TableCell>
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
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Modifica"
                            onClick={() => { setInModifica(o); setDialogOpen(true); }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          {puoEliminareOpportunita(o) && (
                            <BottoneElimina
                              titolo="Eliminare questa opportunità?"
                              descrizione={`"${o.titolo}" verrà eliminata definitivamente insieme alle attività collegate. L'azione è irreversibile.`}
                              onConferma={() => elimina(o)}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
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
