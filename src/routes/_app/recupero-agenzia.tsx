import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Users, Euro, CalendarClock, Gavel, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatEuro, formatDate } from "@/lib/fidi";
import { classificaScadenza, isAnticipo } from "@/lib/scadenze";
import { ESITI_AZIONE, type EsitoAzione } from "@/lib/azioni-recupero-ui";
import { SchedaLista, ElencoSchede } from "@/components/lista-responsive";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const searchSchema = z.object({
  tab: fallback(z.string(), "da_gestire").default("da_gestire"),
});

export const Route = createFileRoute("/_app/recupero-agenzia")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Da passare all'agenzia — FidiManager" },
      { name: "description", content: "Clienti oltre 60 giorni di scaduto da passare all'agenzia di recupero." },
      { property: "og:title", content: "Da passare all'agenzia — FidiManager" },
      { property: "og:description", content: "Clienti oltre 60 giorni di scaduto da passare all'agenzia di recupero." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecuperoAgenziaPage,
});

type Tab = "da_gestire" | "storico";
type Ordina = "rilevato" | "scaduto" | "giorni";

type Riga = {
  id: string;
  cliente_id: string;
  codice_gestionale: string | null;
  ragione_sociale: string | null;
  tot_scaduto: number;
  max_gg: number;
  rilevato_at: string;
  negozio: string | null;
  azione: { id: string; esito: string; data_azione: string; note: string | null; updated_at: string } | null;
};

const QK = ["recupero-agenzia"] as const;
const PAGE = 500;

function useIngressi() {
  return useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Riga[]> => {
      const out: Riga[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("clienti_scaduto60_ingressi")
          .select(
            "id, cliente_id, codice_gestionale, ragione_sociale, tot_scaduto, max_gg, rilevato_at, stores(nome), azioni_recupero!azione_id(id, esito, data_azione, note, updated_at)",
          )
          .order("rilevato_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as unknown as Array<Omit<Riga, "negozio" | "azione" | "tot_scaduto"> & {
          tot_scaduto: number | string;
          stores: { nome: string | null } | null;
          azioni_recupero: Riga["azione"];
        }>;
        for (const r of rows) {
          out.push({
            id: r.id,
            cliente_id: r.cliente_id,
            codice_gestionale: r.codice_gestionale,
            ragione_sociale: r.ragione_sociale,
            tot_scaduto: Number(r.tot_scaduto ?? 0),
            max_gg: Number(r.max_gg ?? 0),
            rilevato_at: r.rilevato_at,
            negozio: r.stores?.nome ?? null,
            azione: r.azioni_recupero ?? null,
          });
        }
        if (rows.length < PAGE) break;
      }
      return out;
    },
  });
}

const daGestire = (r: Riga) => r.azione?.esito === "da_fare";
const etichettaEsito = (e: string) => ESITI_AZIONE.find((x) => x.value === e)?.label ?? e;

function StatoBadge({ r }: { r: Riga }) {
  if (daGestire(r)) return <Badge variant="destructive" className="shrink-0">Da gestire</Badge>;
  if (!r.azione) return <Badge variant="outline" className="shrink-0">Promemoria eliminato</Badge>;
  return (
    <Badge variant="secondary" className="shrink-0 whitespace-normal text-left">
      {etichettaEsito(r.azione.esito)} · {formatDate(r.azione.updated_at)}
    </Badge>
  );
}

function RecuperoAgenziaPage() {
  const { tab: tabRaw } = Route.useSearch();
  const tab: Tab = tabRaw === "storico" ? "storico" : "da_gestire";
  const navigate = useNavigate({ from: "/recupero-agenzia" });
  const isMobile = useIsMobile();
  const { roles } = useAuth();
  const puoChiudere = (["amministratore", "direzione", "amministrazione"] as string[]).some((r) =>
    (roles as string[]).includes(r),
  );

  const { data: righe = [], isLoading, error } = useIngressi();
  const [cerca, setCerca] = useState("");
  const [negozio, setNegozio] = useState("tutti");
  const [ordina, setOrdina] = useState<Ordina>("rilevato");
  const [espansaId, setEspansaId] = useState<string | null>(null);
  const [chiudi, setChiudi] = useState<Riga | null>(null);

  const negozi = useMemo(
    () => Array.from(new Set(righe.map((r) => r.negozio).filter((n): n is string => !!n))).sort((a, b) => a.localeCompare(b, "it")),
    [righe],
  );

  const conteggi = useMemo(() => {
    const dg = righe.filter(daGestire).length;
    return { da_gestire: dg, storico: righe.length - dg };
  }, [righe]);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const arr = righe.filter((r) => {
      if (tab === "da_gestire" ? !daGestire(r) : daGestire(r)) return false;
      if (negozio !== "tutti" && r.negozio !== negozio) return false;
      if (q) {
        const t = `${r.ragione_sociale ?? ""} ${r.codice_gestionale ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      return true;
    });
    arr.sort((a, b) => {
      if (ordina === "scaduto") return b.tot_scaduto - a.tot_scaduto;
      if (ordina === "giorni") return b.max_gg - a.max_gg;
      return b.rilevato_at.localeCompare(a.rilevato_at);
    });
    return arr;
  }, [righe, tab, negozio, cerca, ordina]);

  const kpi = useMemo(() => {
    const limite = Date.now() - 7 * 24 * 3600 * 1000;
    return {
      clienti: new Set(filtrate.map((r) => r.cliente_id)).size,
      totale: filtrate.reduce((s, r) => s + r.tot_scaduto, 0),
      ultimi7: filtrate.filter((r) => new Date(r.rilevato_at).getTime() >= limite).length,
    };
  }, [filtrate]);

  const espansa = righe.find((r) => r.id === espansaId) ?? null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Da passare all'agenzia</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clienti che hanno superato i 60 giorni di scaduto (rilevati automaticamente a ogni import).
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setEspansaId(null); navigate({ search: { tab: v } }); }}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="da_gestire" className="flex-1 sm:flex-none">Da gestire ({conteggi.da_gestire})</TabsTrigger>
          <TabsTrigger value="storico" className="flex-1 sm:flex-none">Storico ({conteggi.storico})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <KpiCard icon={Users} tone="text-muted-foreground" label="Clienti" value={String(kpi.clienti)} />
        <KpiCard icon={Euro} tone="text-destructive" label="Scaduto al rilevamento" value={formatEuro(kpi.totale)} />
        <KpiCard icon={CalendarClock} tone="text-info" label="Rilevati negli ultimi 7 giorni" value={String(kpi.ultimi7)} />
      </div>

      <Card className="p-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          <Input
            placeholder="Cerca ragione sociale o codice"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select value={negozio} onValueChange={setNegozio}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti i negozi</SelectItem>
              {negozi.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ordina} onValueChange={(v) => setOrdina(v as Ordina)}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rilevato">Rilevato più recente</SelectItem>
              <SelectItem value="scaduto">Scaduto più alto</SelectItem>
              <SelectItem value="giorni">Giorni più alti</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {error ? (
        <Card className="p-6 text-sm text-destructive">Errore nel caricamento: {(error as Error).message}</Card>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : filtrate.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Gavel className="size-8 mx-auto mb-2 opacity-50" />
          Nessun cliente da passare all'agenzia
        </Card>
      ) : isMobile ? (
        <ElencoSchede>
          {filtrate.map((r) => (
            <SchedaLista
              key={r.id}
              onClick={() => setEspansaId(r.id)}
              titolo={<>{r.ragione_sociale ?? "—"} <span className="text-xs text-muted-foreground font-normal">{r.codice_gestionale ?? ""}</span></>}
              badge={<StatoBadge r={r} />}
              colonneCampi={2}
              campi={[
                { etichetta: "Negozio", valore: r.negozio ?? "—" },
                { etichetta: "Scaduto", valore: <span className="font-semibold text-destructive">{formatEuro(r.tot_scaduto)}</span> },
                { etichetta: "Giorni max", valore: `${r.max_gg} gg` },
                { etichetta: "Rilevato", valore: formatDate(r.rilevato_at) },
              ]}
            />
          ))}
        </ElencoSchede>
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Negozio</TableHead>
                <TableHead className="text-right">Scaduto al rilevamento</TableHead>
                <TableHead className="text-right">Giorni max</TableHead>
                <TableHead>Rilevato</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrate.map((r) => {
                const aperta = espansaId === r.id;
                return (
                  <Fragment key={r.id}>
                    <TableRow className="cursor-pointer" onClick={() => setEspansaId(aperta ? null : r.id)}>
                      <TableCell className="max-w-[320px]">
                        <div className="font-medium break-words line-clamp-2">{r.ragione_sociale ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.codice_gestionale ?? "—"}</div>
                      </TableCell>
                      <TableCell>{r.negozio ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-destructive">{formatEuro(r.tot_scaduto)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.max_gg} gg</TableCell>
                      <TableCell>{formatDate(r.rilevato_at)}</TableCell>
                      <TableCell><StatoBadge r={r} /></TableCell>
                      <TableCell className="text-muted-foreground">
                        {aperta ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </TableCell>
                    </TableRow>
                    {aperta && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={7} className="px-4 py-3 whitespace-normal">
                          <DettaglioRiga r={r} puoChiudere={puoChiudere && tab === "da_gestire"} onChiudi={() => setChiudi(r)} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Sheet open={isMobile && !!espansa} onOpenChange={(v) => { if (!v) setEspansaId(null); }}>
        <SheetContent side="bottom" className="h-[90dvh] overflow-y-auto p-4">
          {espansa && (
            <div className="min-w-0 space-y-3">
              <SheetHeader className="min-w-0 pr-8 text-left">
                <SheetTitle className="break-words">{espansa.ragione_sociale ?? "—"}</SheetTitle>
                <SheetDescription className="break-words">
                  {espansa.codice_gestionale ?? "—"} · {espansa.negozio ?? "—"}
                </SheetDescription>
                <div><StatoBadge r={espansa} /></div>
              </SheetHeader>
              <DettaglioRiga
                r={espansa}
                puoChiudere={puoChiudere && daGestire(espansa)}
                onChiudi={() => setChiudi(espansa)}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ChiudiPromemoriaDialog riga={chiudi} onClose={() => setChiudi(null)} />
    </div>
  );
}

function KpiCard({ icon: Icon, tone, label, value }: { icon: typeof Users; tone: string; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-start gap-1.5 min-w-0">
        <Icon className={`size-4 shrink-0 mt-0.5 ${tone}`} />
        <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">{label}</p>
      </div>
      <p className="text-lg sm:text-xl font-bold tabular-nums break-words mt-1">{value}</p>
    </Card>
  );
}

function DettaglioRiga({ r, puoChiudere, onChiudi }: { r: Riga; puoChiudere: boolean; onChiudi: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-3 min-w-0">
      <ScaduteAttuali clienteId={r.cliente_id} />
      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
        <Button
          variant="outline"
          className="min-h-10"
          onClick={() => navigate({ to: "/clienti/$clienteId", params: { clienteId: r.cliente_id }, search: { tab: "attivita" } as never })}
        >
          Apri scheda cliente
        </Button>
        {puoChiudere && r.azione && (
          <Button className="min-h-10" onClick={onChiudi}>Chiudi promemoria</Button>
        )}
      </div>
    </div>
  );
}

// Fatture scadute ATTUALI: classificazione canonica classificaScadenza (fonte unica TS),
// stesse righe candidate dello scadenziario (Aperta o non incassata, esclusi BOS).
function ScaduteAttuali({ clienteId }: { clienteId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["recupero-agenzia-scadute", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("id, numero_documento, data_scadenza, importo_scadenza, giorni_ritardo, stato_contabile, data_pagamento_effettiva, codice_pagamento")
        .eq("cliente_id", clienteId)
        .or("stato_contabile.eq.Aperta,data_pagamento_effettiva.is.null")
        .order("data_scadenza", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter(
        (s) => (s.codice_pagamento ?? "").toUpperCase() !== "BOS" && classificaScadenza(s) === "scaduto",
      );
    },
  });
  if (isLoading) return <Skeleton className="h-24" />;
  if (error) return <p className="text-sm text-destructive">Errore: {(error as Error).message}</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">Nessuna fattura scaduta al momento.</p>;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fatture scadute attuali</p>
      <ul className="divide-y rounded-md border bg-background">
        {data.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium break-words">
                {s.numero_documento ?? "—"}
                {isAnticipo(s) && <Badge variant="outline" className="ml-2">Anticipo</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                Scadenza {formatDate(s.data_scadenza)} · {s.giorni_ritardo ?? 0} gg
              </div>
            </div>
            <span className="shrink-0 tabular-nums font-semibold">{formatEuro(s.importo_scadenza)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChiudiPromemoriaDialog({ riga, onClose }: { riga: Riga | null; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [esito, setEsito] = useState<EsitoAzione>("fatto");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const esitiChiusura = ESITI_AZIONE.filter((e) => e.value !== "da_fare");

  async function salva() {
    if (!riga?.azione || saving) return;
    setSaving(true);
    try {
      const { data: cur, error: e1 } = await supabase
        .from("azioni_recupero")
        .select("note, operatore_id, cliente_id")
        .eq("id", riga.azione.id)
        .maybeSingle();
      if (e1) throw e1;
      const extra = nota.trim();
      const noteEsistenti = cur?.note ?? "";
      const patch: { esito: EsitoAzione; note?: string | null; operatore_id?: string } = { esito };
      if (extra) patch.note = noteEsistenti ? `${noteEsistenti}\n${extra}` : extra;
      if (!cur?.operatore_id && user?.id) patch.operatore_id = user.id;
      const { error } = await supabase.from("azioni_recupero").update(patch).eq("id", riga.azione.id);
      if (error) throw error;
      toast.success("Promemoria chiuso");
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["menu", "agenzia-da-gestire"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", riga.cliente_id] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
      qc.invalidateQueries({ queryKey: ["azioni-calendario"] });
      setNota("");
      setEsito("fatto");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!riga} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chiudi promemoria</DialogTitle>
          <DialogDescription className="break-words">{riga?.ragione_sociale ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Esito</Label>
            <Select value={esito} onValueChange={(v) => setEsito(v as EsitoAzione)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {esitiChiusura.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nota (facoltativa)</Label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          <Button onClick={salva} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin mr-1" />}Chiudi promemoria
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
