import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Plus, Search, FileText, Pencil, Trash2, Send, Check, X, AlertCircle,
  Clock, CheckCircle2, Wallet, RotateCcw, MessageSquareWarning, Ban, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  STATO_LABEL, STATO_TONE, TIPO_LABEL, TIPO_TONE, calcolaLivello,
  formatEuro, formatDate, type TipoRichiesta,
} from "@/lib/fidi";

export const Route = createFileRoute("/_app/richieste")({
  component: RichiestePage,
});

const STATI_IN_APPROVAZIONE = ["in_approvazione", "in_attesa_liv1", "in_attesa_liv2", "in_attesa_liv3", "integrazioni_richieste"];

function giorniDa(d: string | null | undefined): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

function attesaTone(g: number): string {
  if (g < 7) return "bg-success/15 text-success";
  if (g <= 14) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}

function semaforoCliente(c: any): { tone: string; label: string } {
  if (!c) return { tone: "bg-muted text-muted-foreground", label: "—" };
  if (c.bloccato || c.in_gestione_legale) return { tone: "bg-destructive/15 text-destructive", label: "Rosso" };
  if (Number(c.scaduto ?? 0) > 0) return { tone: "bg-warning/15 text-warning", label: "Giallo" };
  return { tone: "bg-success/15 text-success", label: "Verde" };
}

function RichiestePage() {
  const { user, role, profilo } = useAuth();
  const isAdmin = role === "amministratore";
  const livello =
    role === "approvatore_liv3" ? 3 :
    role === "approvatore_liv2" ? 2 :
    role === "approvatore_liv1" ? 1 : 0;
  const isApprovatore = livello > 0;
  const isStoreManager = !isAdmin && !isApprovatore;

  const defaultTab = isApprovatore && !isAdmin ? "in_approvazione" : "bozze";
  const [tab, setTab] = useState<string>(defaultTab);
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const { data: richieste, isLoading } = useQuery({
    queryKey: ["richieste", role, profilo?.store_id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("richieste_fido")
        .select("*, clienti(ragione_sociale, fido_aziendale_concesso, fido_gestionale, bloccato, in_gestione_legale, scaduto, totale_rischio), stores(nome, codice)")
        .order("created_at", { ascending: false });
      if (isStoreManager) {
        q = q.eq("created_by", user!.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const all = richieste ?? [];

  // KPI calcoli
  const oraMese = new Date();
  const inizioMese = new Date(oraMese.getFullYear(), oraMese.getMonth(), 1).toISOString();
  const kpi = useMemo(() => {
    const mie = isStoreManager ? all : all;
    const bozze = mie.filter((r) => r.stato === "bozza" && (isStoreManager ? r.created_by === user?.id : true)).length;
    const inAttesa = all.filter((r) => STATI_IN_APPROVAZIONE.includes(r.stato));
    const inAttesaCount = isApprovatore && !isAdmin
      ? inAttesa.filter((r) => r.livello_corrente === livello).length
      : inAttesa.length;
    const approvateMese = all.filter((r) => r.stato === "approvata" && r.data_chiusura && r.data_chiusura >= inizioMese).length;
    const valoreInAttesa = (isApprovatore && !isAdmin
      ? inAttesa.filter((r) => r.livello_corrente === livello)
      : inAttesa
    ).reduce((s, r) => s + Number(r.importo_richiesto ?? 0), 0);
    return { bozze, inAttesaCount, approvateMese, valoreInAttesa };
  }, [all, user?.id, isStoreManager, isApprovatore, isAdmin, livello, inizioMese]);

  const bozze = all.filter((r) => r.stato === "bozza");
  const inApprovazione = all.filter((r) => {
    if (!STATI_IN_APPROVAZIONE.includes(r.stato)) return false;
    if (isApprovatore && !isAdmin) return r.livello_corrente === livello;
    return true;
  });
  const approvate = all.filter((r) => r.stato === "approvata");
  const rifiutate = all.filter((r) => r.stato === "rifiutata" || r.stato === "annullata");

  const deleteMut = useMutation({
    mutationFn: async (r: any) => {
      const { error } = await supabase.from("richieste_fido").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Richiesta eliminata");
      qcInvalidate();
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const qc = useQueryClient();
  function qcInvalidate() {
    qc.invalidateQueries({ queryKey: ["richieste"] });
    qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
    qc.invalidateQueries({ queryKey: ["richieste-cliente"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Richieste fido</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isStoreManager ? "Le tue richieste" : isApprovatore && !isAdmin ? `Coda approvazioni Liv. ${livello}` : "Tutte le richieste del sistema"}
          </p>
        </div>
        {(isStoreManager || isAdmin) && (
          <Button className="gap-1.5" onClick={() => setOpenNew(true)}>
            <Plus className="size-4" /> Nuova richiesta
          </Button>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={FileText} tone="text-muted-foreground" label="Bozze da inviare" value={String(kpi.bozze)} />
        <KpiCard icon={Clock} tone="text-info" label="In attesa approvazione" value={String(kpi.inAttesaCount)} />
        <KpiCard icon={CheckCircle2} tone="text-success" label="Approvate questo mese" value={String(kpi.approvateMese)} />
        <KpiCard icon={Wallet} tone="text-primary" label="Valore in approvazione" value={formatEuro(kpi.valoreInAttesa)} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {!isApprovatore || isAdmin ? (
            <TabsTrigger value="bozze">Bozze {bozze.length > 0 && <Badge variant="secondary" className="ml-2">{bozze.length}</Badge>}</TabsTrigger>
          ) : null}
          <TabsTrigger value="in_approvazione">
            In Approvazione {inApprovazione.length > 0 && <Badge variant="secondary" className="ml-2">{inApprovazione.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="approvate">Approvate</TabsTrigger>
          <TabsTrigger value="rifiutate">Rifiutate</TabsTrigger>
          {isAdmin && <TabsTrigger value="tutto">Tutto</TabsTrigger>}
        </TabsList>

        <TabsContent value="bozze" className="mt-4">
          <BozzeTab
            rows={bozze}
            loading={isLoading}
            onEdit={setEditing}
            onDelete={setDeleting}
            onChanged={qcInvalidate}
          />
        </TabsContent>

        <TabsContent value="in_approvazione" className="mt-4">
          <InApprovazioneTab
            rows={inApprovazione}
            loading={isLoading}
            canApprove={isAdmin || isApprovatore}
            livelloUtente={livello}
            isAdmin={isAdmin}
            onChanged={qcInvalidate}
          />
        </TabsContent>

        <TabsContent value="approvate" className="mt-4 space-y-3">
          {(isAdmin || isApprovatore) && (
            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm">
                <a href="/fidi-processare"><FileText className="size-4" /> Vai a Fidi da processare</a>
              </Button>
            </div>
          )}
          <StoricoTab rows={approvate} loading={isLoading} kind="approvata" onRiinvia={null} />
        </TabsContent>

        <TabsContent value="rifiutate" className="mt-4">
          <StoricoTab
            rows={rifiutate}
            loading={isLoading}
            kind="rifiutata"
            onRiinvia={(r) => setEditing({ ...r, _riinvia: true })}
          />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="tutto" className="mt-4">
            <TuttoTab rows={all} loading={isLoading} />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        {openNew && <RichiestaFormDialog onClose={() => setOpenNew(false)} onSaved={qcInvalidate} />}
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <RichiestaFormDialog
            richiesta={editing._riinvia ? undefined : editing}
            cloneFrom={editing._riinvia ? editing : undefined}
            onClose={() => setEditing(null)}
            onSaved={qcInvalidate}
          />
        )}
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la richiesta?</AlertDialogTitle>
            <AlertDialogDescription>L'operazione è irreversibile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (deleting) deleteMut.mutate(deleting); }}
              disabled={deleteMut.isPending}
            >Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({ icon: Icon, tone, label, value }: { icon: any; tone: string; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${tone}`} />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold mt-2 tabular-nums">{value}</p>
    </Card>
  );
}

/* ============================ BOZZE TAB ============================ */
function BozzeTab({
  rows, loading, onEdit, onDelete, onChanged,
}: { rows: any[]; loading: boolean; onEdit: (r: any) => void; onDelete: (r: any) => void; onChanged: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const invioMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("richieste_fido")
        .update({ stato: "in_approvazione", data_invio: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      toast.success(`${ids.length} richieste inviate in approvazione`);
      setSelected(new Set());
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  const allSel = rows.length > 0 && selected.size === rows.length;

  if (loading) return <SkeletonTable />;
  if (rows.length === 0) return <Empty label="Nessuna bozza" hint="Crea una nuova richiesta" />;

  return (
    <Card className="p-2 sm:p-3">
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 mb-2 bg-primary/5 rounded-md">
          <p className="text-sm font-medium">{selected.size} selezionate</p>
          <Button size="sm" onClick={() => invioMut.mutate(Array.from(selected))} disabled={invioMut.isPending}>
            <Send className="size-4" /> Invia tutte
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"><Checkbox checked={allSel} onCheckedChange={() => setSelected(allSel ? new Set() : new Set(rows.map((r) => r.id)))} /></TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Importo richiesto</TableHead>
            <TableHead className="text-right">Fido attuale</TableHead>
            <TableHead>Data creazione</TableHead>
            <TableHead className="text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} /></TableCell>
              <TableCell className="font-medium">{r.clienti?.ragione_sociale ?? "—"}</TableCell>
              <TableCell>
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>
                  {TIPO_LABEL[r.tipo as TipoRichiesta]}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatEuro(Number(r.importo_richiesto))}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatEuro(Number(r.clienti?.fido_aziendale_concesso ?? r.clienti?.fido_gestionale ?? 0))}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDate(r.created_at)}</TableCell>
              <TableCell className="text-right">
                <div className="inline-flex gap-1">
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => onEdit(r)} title="Modifica"><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" className="size-8 text-success" onClick={() => invioMut.mutate([r.id])} title="Invia"><Send className="size-4" /></Button>
                  <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => onDelete(r)} title="Elimina"><Trash2 className="size-4" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/* ====================== IN APPROVAZIONE TAB ====================== */
function InApprovazioneTab({
  rows, loading, canApprove, livelloUtente, isAdmin, onChanged,
}: {
  rows: any[]; loading: boolean; canApprove: boolean; livelloUtente: number; isAdmin: boolean; onChanged: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [storeFilter, setStoreFilter] = useState("tutti");
  const [tipoFilter, setTipoFilter] = useState("tutti");
  const [importoMin, setImportoMin] = useState("");
  const [importoMax, setImportoMax] = useState("");
  const [giorniMin, setGiorniMin] = useState("");
  const [action, setAction] = useState<{ kind: "approva" | "rifiuta" | "integrazioni"; rows: any[] } | null>(null);
  const [importoApprovato, setImportoApprovato] = useState<string>("");
  const [note, setNote] = useState("");

  const { data: msgNonLetti } = useQuery({
    queryKey: ["comunicazioni-non-lette", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("comunicazioni_richiesta")
        .select("richiesta_id")
        .eq("letto", false)
        .neq("autore_id", user?.id ?? "");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m: any) => {
        counts[m.richiesta_id] = (counts[m.richiesta_id] ?? 0) + 1;
      });
      return counts;
    },
    refetchInterval: 30000,
  });

  const stores = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => { if (r.stores?.nome) map.set(r.store_id, r.stores.nome); });
    return Array.from(map.entries());
  }, [rows]);

  const filtered = rows
    .filter((r) => storeFilter === "tutti" || r.store_id === storeFilter)
    .filter((r) => tipoFilter === "tutti" || r.tipo === tipoFilter)
    .filter((r) => !importoMin || Number(r.importo_richiesto) >= Number(importoMin))
    .filter((r) => !importoMax || Number(r.importo_richiesto) <= Number(importoMax))
    .filter((r) => !giorniMin || giorniDa(r.data_invio) >= Number(giorniMin))
    .sort((a, b) => Number(b.importo_richiesto) - Number(a.importo_richiesto));

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  const allSel = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const annullaMut = useMutation({
    mutationFn: async (r: any) => {
      const { error } = await supabase.from("richieste_fido").update({ stato: "annullata" }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Richiesta annullata"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const decisionMut = useMutation({
    mutationFn: async (input: { kind: "approva" | "rifiuta" | "integrazioni"; rows: any[]; note: string; importoApprovato?: number }) => {
      if (!user) throw new Error("Non autenticato");
      const { kind, rows: targets, note, importoApprovato } = input;
      for (const r of targets) {
        const livDecisione = r.livello_corrente;
        if (kind === "integrazioni") {
          const { error } = await supabase.from("richieste_fido")
            .update({ stato: "integrazioni_richieste" })
            .eq("id", r.id);
          if (error) throw error;
          // log come approvazione "rifiutata" con nota? meglio audit_log via insert
          await supabase.from("approvazioni").insert({
            richiesta_id: r.id, approvatore_id: user.id, livello: livDecisione,
            esito: "rifiutata", note: `[Integrazioni richieste] ${note}`,
          });
          continue;
        }
        const esito = kind === "approva" ? "approvata" : "rifiutata";
        const imp = importoApprovato ?? Number(r.importo_richiesto);
        const { error: e1 } = await supabase.from("approvazioni").insert({
          richiesta_id: r.id, approvatore_id: user.id, livello: livDecisione,
          esito, importo_approvato: kind === "approva" ? imp : null, note: note || null,
        });
        if (e1) throw e1;

        if (kind === "rifiuta") {
          const { error } = await supabase.from("richieste_fido")
            .update({ stato: "rifiutata" }).eq("id", r.id);
          if (error) throw error;
        } else {
          const nextLiv = livDecisione + 1;
          if (nextLiv > r.livello_richiesto) {
            // approvazione finale
            const fidoPrec = Number(r.clienti?.fido_aziendale_concesso ?? 0);
            const { error } = await supabase.from("richieste_fido")
              .update({ stato: "approvata", importo_approvato: imp }).eq("id", r.id);
            if (error) throw error;
            // aggiorna fido cliente
            await supabase.from("clienti")
              .update({ fido_aziendale_concesso: imp, data_affidamento_aziendale: new Date().toISOString().slice(0, 10) })
              .eq("id", r.cliente_id);
            // storico fido
            await supabase.from("storico_fido").insert({
              cliente_id: r.cliente_id,
              richiesta_id: r.id,
              importo_precedente: fidoPrec,
              importo_nuovo: imp,
              tipo_variazione: r.tipo === "diminuzione" ? "diminuzione" : (fidoPrec > 0 ? "aumento" : "nuovo"),
              eseguito_da: user.id,
              note: note || null,
            } as any);
          } else {
            const { error } = await supabase.from("richieste_fido")
              .update({ livello_corrente: nextLiv }).eq("id", r.id);
            if (error) throw error;
          }
        }
      }
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.rows.length} richieste · ${v.kind === "approva" ? "approvate" : v.kind === "rifiuta" ? "rifiutate" : "integrazioni richieste"}`);
      setAction(null); setNote(""); setImportoApprovato(""); setSelected(new Set());
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <SkeletonTable />;

  return (
    <div className="space-y-3">
      {/* Filtri */}
      <Card className="p-3 flex flex-wrap gap-2 items-center">
        {stores.length > 1 && (
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Store" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti gli store</SelectItem>
              {stores.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i tipi</SelectItem>
            <SelectItem value="nuovo">Nuovo fido</SelectItem>
            <SelectItem value="aumento">Aumento</SelectItem>
            <SelectItem value="diminuzione">Diminuzione</SelectItem>
            <SelectItem value="rinnovo">Rinnovo</SelectItem>
          </SelectContent>
        </Select>
        <Input className="w-28" type="number" placeholder="Importo min" value={importoMin} onChange={(e) => setImportoMin(e.target.value)} />
        <Input className="w-28" type="number" placeholder="Importo max" value={importoMax} onChange={(e) => setImportoMax(e.target.value)} />
        <Input className="w-32" type="number" placeholder="Giorni attesa ≥" value={giorniMin} onChange={(e) => setGiorniMin(e.target.value)} />
      </Card>

      {filtered.length === 0 ? (
        <Empty label="Nessuna richiesta in approvazione" hint="" />
      ) : (
        <Card className="p-2 sm:p-3">
          {canApprove && selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 p-3 mb-2 bg-primary/5 rounded-md sticky top-2 z-10">
              <p className="text-sm font-medium">
                {selected.size} selezionate · {formatEuro(filtered.filter((r) => selected.has(r.id)).reduce((s, r) => s + Number(r.importo_richiesto), 0))}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-destructive border-destructive/30"
                  onClick={() => setAction({ kind: "rifiuta", rows: filtered.filter((r) => selected.has(r.id)) })}>
                  <X className="size-4" /> Rifiuta
                </Button>
                <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90"
                  onClick={() => setAction({ kind: "approva", rows: filtered.filter((r) => selected.has(r.id)) })}>
                  <Check className="size-4" /> Approva selezionate
                </Button>
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                {canApprove && <TableHead className="w-8"><Checkbox checked={allSel} onCheckedChange={() => setSelected(allSel ? new Set() : new Set(filtered.map((r) => r.id)))} /></TableHead>}
                <TableHead>Cliente</TableHead>
                {!isStoreManagerView(canApprove) && <TableHead>Store</TableHead>}
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead className="text-right">Fido attuale</TableHead>
                <TableHead className="text-right">Tot. rischio</TableHead>
                <TableHead className="text-right">Scaduto</TableHead>
                <TableHead>Liv.</TableHead>
                <TableHead>Data invio</TableHead>
                <TableHead>Giorni</TableHead>
                {(canApprove || true) && <TableHead className="text-right">Azioni</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const g = giorniDa(r.data_invio);
                const livMio = canApprove && (isAdmin || r.livello_corrente === livelloUtente);
                const unread = msgNonLetti?.[r.id] ?? 0;
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
                  >
                    {canApprove && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} disabled={!livMio} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{r.clienti?.ragione_sociale ?? "—"}</TableCell>
                    {!isStoreManagerView(canApprove) && <TableCell className="text-sm text-muted-foreground">{r.stores?.nome ?? "—"}</TableCell>}
                    <TableCell><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{TIPO_LABEL[r.tipo as TipoRichiesta]}</span></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatEuro(Number(r.importo_richiesto))}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatEuro(Number(r.clienti?.fido_aziendale_concesso ?? 0))}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatEuro(Number(r.clienti?.totale_rischio ?? 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.clienti?.scaduto ?? 0) > 0 ? <span className="text-destructive">{formatEuro(Number(r.clienti?.scaduto))}</span> : "—"}</TableCell>
                    <TableCell><Badge variant="outline">L{r.livello_corrente}/{r.livello_richiesto}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(r.data_invio)}</TableCell>
                    <TableCell><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${attesaTone(g)}`}>{g}gg</span></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {unread > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium">
                            <MessageSquare className="size-3" />
                            {unread}
                          </span>
                        )}
                        {canApprove && livMio ? (
                          <>
                            <Button size="sm" variant="ghost" className="text-success h-8" onClick={() => { setImportoApprovato(String(r.importo_richiesto)); setAction({ kind: "approva", rows: [r] }); }}>
                              <Check className="size-4" /> Approva
                            </Button>
                            <Button size="sm" variant="ghost" className="text-warning h-8" onClick={() => setAction({ kind: "integrazioni", rows: [r] })} title="Richiedi integrazioni">
                              <MessageSquareWarning className="size-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive h-8" onClick={() => setAction({ kind: "rifiuta", rows: [r] })}>
                              <X className="size-4" /> Rifiuta
                            </Button>
                          </>
                        ) : (r.stato === "integrazioni_richieste" || r.stato === "bozza") ? (
                          <Button size="sm" variant="ghost" className="text-destructive h-8" onClick={() => annullaMut.mutate(r)}>
                            <Ban className="size-4" /> Annulla
                          </Button>
                        ) : unread === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialog azione */}
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "approva" ? "Conferma approvazione"
                : action?.kind === "rifiuta" ? "Conferma rifiuto"
                : "Richiedi integrazioni"}
            </DialogTitle>
            <DialogDescription>
              {action?.rows.length === 1
                ? <>Cliente: <strong>{action.rows[0].clienti?.ragione_sociale}</strong></>
                : <>{action?.rows.length} richieste · totale {formatEuro((action?.rows ?? []).reduce((s, r) => s + Number(r.importo_richiesto), 0))}</>}
            </DialogDescription>
          </DialogHeader>

          {action?.rows.length === 1 && (
            <div className="rounded-md border p-3 text-xs space-y-1 bg-muted/30">
              <div className="flex justify-between"><span>Fido attuale</span><span className="tabular-nums">{formatEuro(Number(action.rows[0].clienti?.fido_aziendale_concesso ?? 0))}</span></div>
              <div className="flex justify-between"><span>Scaduto</span><span className="tabular-nums">{formatEuro(Number(action.rows[0].clienti?.scaduto ?? 0))}</span></div>
              <div className="flex justify-between"><span>Totale rischio</span><span className="tabular-nums">{formatEuro(Number(action.rows[0].clienti?.totale_rischio ?? 0))}</span></div>
              <div className="flex justify-between"><span>Semaforo</span>
                <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${semaforoCliente(action.rows[0].clienti).tone}`}>
                  {semaforoCliente(action.rows[0].clienti).label}
                </span>
              </div>
            </div>
          )}

          {action?.kind === "approva" && action.rows.length === 1 && (
            <div className="space-y-1.5">
              <Label>Importo approvato (€)</Label>
              <Input type="number" step="0.01" value={importoApprovato} onChange={(e) => setImportoApprovato(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              {action?.kind === "rifiuta" ? "Motivo rifiuto (min 20 caratteri) *"
                : action?.kind === "integrazioni" ? "Cosa serve integrare *"
                : "Note approvazione"}
            </Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            {action?.kind === "rifiuta" && note.length > 0 && note.length < 20 && (
              <p className="text-xs text-destructive">Minimo 20 caratteri</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={decisionMut.isPending}>Annulla</Button>
            <Button
              disabled={
                decisionMut.isPending ||
                (action?.kind === "rifiuta" && note.length < 20) ||
                (action?.kind === "integrazioni" && note.trim().length < 5)
              }
              className={action?.kind === "approva" ? "bg-success text-success-foreground hover:bg-success/90" : action?.kind === "rifiuta" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => action && decisionMut.mutate({
                kind: action.kind,
                rows: action.rows,
                note,
                importoApprovato: action.kind === "approva" && action.rows.length === 1 ? Number(importoApprovato) : undefined,
              })}
            >
              {decisionMut.isPending ? "Elaborazione..." :
                action?.kind === "approva" ? "Conferma approvazione" :
                action?.kind === "rifiuta" ? "Conferma rifiuto" :
                "Invia richiesta integrazioni"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function isStoreManagerView(canApprove: boolean): boolean { return !canApprove; }

/* ============================ STORICO TAB ============================ */
function StoricoTab({
  rows, loading, kind, onRiinvia,
}: { rows: any[]; loading: boolean; kind: "approvata" | "rifiutata"; onRiinvia: ((r: any) => void) | null }) {
  const [meseFiltro, setMeseFiltro] = useState<string>("ultimi3");
  const [mostraTutto, setMostraTutto] = useState(false);

  const cutoff = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString();
  }, []);

  const filtered = useMemo(() => {
    let r = rows;
    if (!mostraTutto) r = r.filter((x) => (x.data_chiusura ?? x.created_at) >= cutoff);
    if (meseFiltro !== "ultimi3" && meseFiltro !== "tutto") {
      r = r.filter((x) => (x.data_chiusura ?? x.created_at)?.slice(0, 7) === meseFiltro);
    }
    return r;
  }, [rows, mostraTutto, meseFiltro, cutoff]);

  const mesi = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { const k = (r.data_chiusura ?? r.created_at)?.slice(0, 7); if (k) s.add(k); });
    return Array.from(s).sort().reverse();
  }, [rows]);

  if (loading) return <SkeletonTable />;

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Select value={meseFiltro} onValueChange={setMeseFiltro}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ultimi3">Ultimi 3 mesi</SelectItem>
            <SelectItem value="tutto">Tutti i mesi</SelectItem>
            {mesi.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        {!mostraTutto && (
          <Button variant="outline" size="sm" onClick={() => setMostraTutto(true)}>Carica tutto lo storico</Button>
        )}
      </Card>

      {filtered.length === 0 ? (
        <Empty label={kind === "approvata" ? "Nessuna richiesta approvata" : "Nessuna richiesta rifiutata"} hint="" />
      ) : (
        <Card className="p-2 sm:p-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Importo richiesto</TableHead>
                {kind === "approvata" && <TableHead className="text-right">Importo approvato</TableHead>}
                {kind === "approvata" && <TableHead>Export</TableHead>}
                {kind === "rifiutata" && <TableHead>Motivo</TableHead>}
                <TableHead>Data</TableHead>
                {onRiinvia && <TableHead className="text-right">Azioni</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const se = r.stato_export as ("da_esportare"|"esportata"|"processata"|"errore_export"|null);
                const exportLabel: Record<string,string> = { da_esportare:"Da esportare", esportata:"Esportata", processata:"Processata", errore_export:"Errore" };
                const exportTone: Record<string,string> = { da_esportare:"bg-info/15 text-info", esportata:"bg-warning/15 text-warning", processata:"bg-success/15 text-success", errore_export:"bg-destructive/15 text-destructive" };
                return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.clienti?.ragione_sociale ?? "—"}</TableCell>
                  <TableCell><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{TIPO_LABEL[r.tipo as TipoRichiesta]}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{formatEuro(Number(r.importo_richiesto))}</TableCell>
                  {kind === "approvata" && <TableCell className="text-right tabular-nums text-success font-medium">{formatEuro(Number(r.importo_approvato ?? r.importo_richiesto))}</TableCell>}
                  {kind === "approvata" && (
                    <TableCell>
                      {se ? <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${exportTone[se]}`}>{exportLabel[se]}</span> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                  {kind === "rifiutata" && <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={r.note ?? r.motivazione ?? ""}>{r.note ?? r.motivazione ?? "—"}</TableCell>}
                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.data_chiusura ?? r.created_at)}</TableCell>
                  {onRiinvia && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => onRiinvia(r)}><RotateCcw className="size-4" /> Ri-invia</Button>
                    </TableCell>
                  )}
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

/* ============================ TUTTO TAB (admin) ============================ */
function TuttoTab({ rows, loading }: { rows: any[]; loading: boolean }) {
  const navigate = useNavigate();
  const [statoF, setStatoF] = useState<string>("tutti");
  const [livF, setLivF] = useState<string>("tutti");
  const filtered = rows
    .filter((r) => statoF === "tutti" || r.stato === statoF)
    .filter((r) => livF === "tutti" || String(r.livello_corrente) === livF);

  if (loading) return <SkeletonTable />;
  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <Select value={statoF} onValueChange={setStatoF}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            {Object.entries(STATO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={livF} onValueChange={setLivF}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Livello" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i livelli</SelectItem>
            <SelectItem value="1">Liv. 1</SelectItem>
            <SelectItem value="2">Liv. 2</SelectItem>
            <SelectItem value="3">Liv. 3</SelectItem>
          </SelectContent>
        </Select>
      </Card>
      <Card className="p-2 sm:p-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Importo</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Liv.</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.clienti?.ragione_sociale ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.stores?.nome ?? "—"}</TableCell>
                <TableCell><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{TIPO_LABEL[r.tipo as TipoRichiesta]}</span></TableCell>
                <TableCell className="text-right tabular-nums">{formatEuro(Number(r.importo_richiesto))}</TableCell>
                <TableCell><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.stato as keyof typeof STATO_TONE]}`}>{STATO_LABEL[r.stato as keyof typeof STATO_LABEL]}</span></TableCell>
                <TableCell><Badge variant="outline">L{r.livello_corrente}/{r.livello_richiesto}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(r.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ============================ FORM (new/edit/riinvia) ============================ */
const formSchema = z.object({
  cliente_id: z.string().uuid("Seleziona un cliente"),
  tipo: z.enum(["nuovo", "nuovo_fido", "aumento", "diminuzione", "rinnovo"]),
  importo_richiesto: z.coerce.number().positive("Importo > 0").max(99999999),
  durata_mesi: z.coerce.number().int().min(1).max(120).default(12),
  motivazione: z.string().trim().min(1, "Obbligatoria").max(2000),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});
type FormVals = z.infer<typeof formSchema>;

function RichiestaFormDialog({
  richiesta, cloneFrom, onClose, onSaved,
}: { richiesta?: any; cloneFrom?: any; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const seed = richiesta ?? cloneFrom;
  const [form, setForm] = useState<FormVals>({
    cliente_id: seed?.cliente_id ?? "",
    tipo: (seed?.tipo as any) ?? "nuovo",
    importo_richiesto: seed ? Number(seed.importo_richiesto) : 0,
    durata_mesi: seed?.durata_mesi ?? 12,
    motivazione: seed?.motivazione ?? "",
    note: seed?.note ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const isEdit = !!richiesta;

  const { data: clienti } = useQuery({
    queryKey: ["clienti", "form-richiesta"],
    enabled: !isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, store_id, fido_aziendale_concesso, fido_gestionale, bloccato, in_gestione_legale, scaduto, totale_rischio, fido_residuo, a_scadere, condizioni_pagamento, dilazione_concordata, dilazione_effettiva, num_insoluti, motivo_blocco, cliente_attivo, ultima_data_fatturazione, ultima_sincronizzazione")
        .eq("attivo", true)
        .order("ragione_sociale");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clienteEdit } = useQuery({
    queryKey: ["cliente", "form-richiesta", form.cliente_id],
    enabled: isEdit && !!form.cliente_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, store_id, fido_aziendale_concesso, fido_gestionale, bloccato, in_gestione_legale, scaduto, totale_rischio, fido_residuo, a_scadere, condizioni_pagamento, dilazione_concordata, dilazione_effettiva, num_insoluti, motivo_blocco, cliente_attivo, ultima_data_fatturazione, ultima_sincronizzazione")
        .eq("id", form.cliente_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const clienteSel: any = isEdit ? clienteEdit : clienti?.find((c) => c.id === form.cliente_id);
  const fidoAttuale = Number(clienteSel?.fido_aziendale_concesso ?? 0);
  const variazione = fidoAttuale > 0 && form.importo_richiesto > 0
    ? ((form.importo_richiesto - fidoAttuale) / fidoAttuale) * 100
    : null;
  const livelloPreview = form.importo_richiesto > 0 ? calcolaLivello(Number(form.importo_richiesto)) : null;
  const filteredClienti = clienti?.filter((c) => !search || c.ragione_sociale.toLowerCase().includes(search.toLowerCase())) ?? [];


  const mut = useMutation({
    mutationFn: async (input: { invia: boolean }) => {
      const parsed = formSchema.parse(form);
      const { data: { user } } = await supabase.auth.getUser();
      const cliente = clienteSel ?? clienti?.find((c) => c.id === parsed.cliente_id);
      const payload = {
        cliente_id: parsed.cliente_id,
        tipo: parsed.tipo,
        store_id: cliente?.store_id ?? null,
        importo_richiesto: parsed.importo_richiesto,
        durata_mesi: parsed.durata_mesi,
        motivazione: parsed.motivazione,
        note: parsed.note || null,
        stato: input.invia ? "in_approvazione" : "bozza",
        data_invio: input.invia ? new Date().toISOString() : null,
      } as any;
      if (richiesta?.id) {
        const { error } = await supabase.from("richieste_fido").update(payload).eq("id", richiesta.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("richieste_fido").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      toast.success(v.invia ? "Richiesta inviata" : "Bozza salvata");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(invia: boolean) {
    const res = formSchema.safeParse(form);
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    mut.mutate({ invia });
  }

  const sem = semaforoCliente(clienteSel);

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{richiesta ? "Modifica richiesta" : cloneFrom ? "Ri-invia richiesta" : "Nuova richiesta fido"}</DialogTitle>
        <DialogDescription>Compila i dettagli della richiesta.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Cliente *</Label>
          {isEdit ? (
            <Input value={clienteSel?.ragione_sociale ?? richiesta?.clienti?.ragione_sociale ?? "Caricamento…"} readOnly disabled />
          ) : (
            <>
              <Input placeholder="Cerca cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleziona cliente..." /></SelectTrigger>
                <SelectContent>
                  {filteredClienti.slice(0, 100).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.ragione_sociale}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.cliente_id && <p className="text-xs text-destructive">{errors.cliente_id}</p>}
            </>
          )}
        </div>

        {clienteSel && (
          <div className="rounded-md border p-3 text-xs space-y-1.5 bg-muted/30">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Fido gestionale</span><span className="tabular-nums font-medium">{formatEuro(Number(clienteSel.fido_gestionale ?? 0))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Totale rischio</span><span className="tabular-nums">{formatEuro(Number(clienteSel.totale_rischio ?? 0))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fido residuo</span><span className={`tabular-nums ${Number(clienteSel.fido_residuo ?? 0) < 0 ? "text-destructive font-medium" : ""}`}>{formatEuro(Number(clienteSel.fido_residuo ?? 0))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Scaduto</span><span className={`tabular-nums ${Number(clienteSel.scaduto ?? 0) > 0 ? "text-destructive font-medium" : ""}`}>{formatEuro(Number(clienteSel.scaduto ?? 0))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">A scadere</span><span className="tabular-nums">{formatEuro(Number(clienteSel.a_scadere ?? 0))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Insoluti</span><span className="tabular-nums">{Number(clienteSel.num_insoluti ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cond. pagamento</span><span className="truncate ml-2">{clienteSel.condizioni_pagamento ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dilaz. concordata</span><span className="tabular-nums">{clienteSel.dilazione_concordata ?? "—"}{clienteSel.dilazione_concordata != null ? " gg" : ""}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dilaz. effettiva</span><span className="tabular-nums">{clienteSel.dilazione_effettiva ?? "—"}{clienteSel.dilazione_effettiva != null ? " gg" : ""}</span></div>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Semaforo rischio</span>
                <span className={`inline-flex rounded-md px-2 py-0.5 font-medium ${sem.tone}`}>{sem.label}</span>
              </div>
            </div>
            <div className="border-t pt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Stato:</span>
              {clienteSel.bloccato ? (
                <span className="inline-flex rounded-md px-2 py-0.5 font-medium bg-destructive/15 text-destructive">Bloccato{clienteSel.motivo_blocco ? ` — ${clienteSel.motivo_blocco}` : ""}</span>
              ) : (
                <span className="inline-flex rounded-md px-2 py-0.5 font-medium bg-success/15 text-success">Non bloccato</span>
              )}
              {clienteSel.in_gestione_legale && (
                <span className="inline-flex rounded-md px-2 py-0.5 font-medium bg-warning/15 text-warning">In legale</span>
              )}
              <span className={`inline-flex rounded-md px-2 py-0.5 font-medium ${clienteSel.cliente_attivo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                {clienteSel.cliente_attivo ? "Attivo" : "Non attivo"}
              </span>
              {clienteSel.ultima_data_fatturazione && (
                <span className="text-muted-foreground">· Ultima fatt. {formatDate(clienteSel.ultima_data_fatturazione)}</span>
              )}
            </div>
            <div className="border-t pt-1.5 text-muted-foreground">
              Ultima sincronizzazione: {clienteSel.ultima_sincronizzazione
                ? new Date(clienteSel.ultima_sincronizzazione).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : "—"}
            </div>
          </div>
        )}


        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nuovo_fido">Nuovo fido</SelectItem>
                <SelectItem value="aumento">Aumento fido</SelectItem>
                <SelectItem value="diminuzione">Diminuzione fido</SelectItem>
                <SelectItem value="rinnovo">Rinnovo fido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Durata (mesi)</Label>
            <Input type="number" min="1" max="120" value={form.durata_mesi}
              onChange={(e) => setForm({ ...form, durata_mesi: Number(e.target.value) })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Importo richiesto (€) *</Label>
            <Input type="number" step="0.01" min="0" value={form.importo_richiesto || ""}
              onChange={(e) => setForm({ ...form, importo_richiesto: Number(e.target.value) })} />
            {errors.importo_richiesto && <p className="text-xs text-destructive">{errors.importo_richiesto}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Fido attuale</Label>
            <Input value={formatEuro(fidoAttuale)} disabled />
          </div>
        </div>

        {variazione !== null && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs flex justify-between">
            <span>Variazione</span>
            <span className={`font-medium tabular-nums ${variazione >= 0 ? "text-success" : "text-warning"}`}>
              {variazione >= 0 ? "+" : ""}{variazione.toFixed(1)}%
            </span>
          </div>
        )}
        {livelloPreview && (
          <div className="rounded-md bg-info/5 border border-info/20 px-3 py-2 text-xs">
            Livello approvazione richiesto: <strong>Liv. {livelloPreview}</strong>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Motivazione *</Label>
          <Textarea rows={3} value={form.motivazione}
            onChange={(e) => setForm({ ...form, motivazione: e.target.value })} />
          {errors.motivazione && <p className="text-xs text-destructive">{errors.motivazione}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Note interne</Label>
          <Textarea rows={2} value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button variant="secondary" disabled={mut.isPending} onClick={() => submit(false)}>Salva bozza</Button>
        <Button disabled={mut.isPending} onClick={() => submit(true)}>
          {mut.isPending ? "..." : "Invia subito"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ============================ helpers ============================ */
function SkeletonTable() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}

function Empty({ label, hint }: { label: string; hint: string }) {
  return (
    <Card className="p-10 text-center">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
        <AlertCircle className="size-5 text-muted-foreground" />
      </div>
      <p className="font-medium text-sm">{label}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </Card>
  );
}
