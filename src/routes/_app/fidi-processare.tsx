import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download, RefreshCw, Check, X, AlertTriangle, FileSpreadsheet, Inbox, FileCheck2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatEuro, formatDate, TIPO_LABEL, TIPO_TONE, type TipoRichiesta } from "@/lib/fidi";
import {
  STATO_EXPORT_LABEL, STATO_EXPORT_TONE,
  type StatoExport,
} from "@/lib/fidi-export";
import { generaTracciatoFidiGestionale } from "@/lib/export-fidi-tracciato";
import { Undo2 } from "lucide-react";

export const Route = createFileRoute("/_app/fidi-processare")({
  component: FidiProcessarePage,
});

function FidiProcessarePage() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("amministratore");
  const isAmministrazione = roles.includes("amministrazione");
  const isApprovatore =
    roles.includes("approvatore_liv1") ||
    roles.includes("approvatore_liv2") ||
    roles.includes("approvatore_liv3");
  const hasAccess = isAdmin || isApprovatore || isAmministrazione;
  const qc = useQueryClient();

  const [tab, setTab] = useState("gestire");


  const { data: richieste, isLoading } = useQuery({
    queryKey: ["fidi-processare", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_fido")
        .select("*, clienti(ragione_sociale, codice_gestionale, codice_assegnato, partita_iva, fido_aziendale_concesso), stores(nome, codice), richiedente:profili!richieste_fido_created_by_fkey(nome, cognome, email), approvatore:profili!richieste_fido_approvato_da_fkey(nome, cognome, email)")
        .eq("stato", "approvata")
        .not("stato_export", "is", null)
        .order("data_chiusura", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["stores-attivi"],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, nome").eq("attivo", true).order("nome");
      return data ?? [];
    },
  });

  const { data: profili } = useQuery({
    queryKey: ["profili-tutti"],
    queryFn: async () => {
      const { data } = await supabase.from("profili").select("id, nome, cognome, email");
      return data ?? [];
    },
  });

  const profiloName = (id: string | null | undefined): string => {
    if (!id) return "—";
    const p = profili?.find((x) => x.id === id);
    if (!p) return "—";
    return `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || (p.email ?? "—");
  };

  const all = richieste ?? [];

  const kpi = useMemo(() => {
    return {
      daEsportare: all.filter((r) => r.stato_export === "da_esportare").length,
      esportate: all.filter((r) => r.stato_export === "esportata").length,
      errori: all.filter((r) => r.stato_export === "errore_export").length,
    };
  }, [all]);

  // Mutations
  const setStatoMutation = useMutation({
    mutationFn: async (vars: {
      ids: string[];
      stato_export: StatoExport;
      note_export?: string | null;
      setExport?: boolean;
      setProcessata?: boolean;
    }) => {
      const patch: any = { stato_export: vars.stato_export };
      if (vars.note_export !== undefined) patch.note_export = vars.note_export;
      if (vars.setExport) {
        patch.data_export = new Date().toISOString();
        patch.esportata_da = user!.id;
      }
      if (vars.setProcessata) {
        patch.data_processata = new Date().toISOString();
        patch.processata_da = user!.id;
      }
      const { error } = await supabase
        .from("richieste_fido")
        .update(patch)
        .in("id", vars.ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fidi-processare"] }),
    onError: (e: any) => toast.error(e?.message ?? "Errore"),
  });

  function generaFile(rows: any[], aggiornaStato: boolean) {
    if (!rows.length) return;
    const exportRows = rows.map((r) => ({
      codice_cliente: r.clienti?.codice_gestionale ?? r.clienti?.codice_assegnato ?? "",
      ragione_sociale: r.clienti?.ragione_sociale ?? "",
      partita_iva: r.clienti?.partita_iva ?? "",
      tipo_variazione: tipoVariazione(r.tipo as TipoRichiesta),
      importo_precedente: r.clienti?.fido_aziendale_concesso != null
        ? Number(r.clienti.fido_aziendale_concesso) - Number(r.importo_approvato ?? r.importo_richiesto)
        : null,
      importo_approvato: Number(r.importo_approvato ?? r.importo_richiesto),
      data_approvazione: formatDate(r.data_chiusura ?? r.updated_at),
      approvato_da: profiloName(r.approvato_da) !== "—" ? profiloName(r.approvato_da) : profiloName(r.created_by),
      note: r.note ?? r.motivazione ?? "",
    }));
    generaExcelFidi(exportRows);
    if (aggiornaStato) {
      setStatoMutation.mutate({
        ids: rows.map((r) => r.id),
        stato_export: "esportata",
        setExport: true,
      });
      toast.success(`File generato (${rows.length} righe). Stato aggiornato a "Esportata".`);
    } else {
      toast.success(`File rigenerato (${rows.length} righe).`);
    }
  }

  if (!hasAccess) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Non hai accesso a questa sezione.
      </Card>
    );
  }

  return (

    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fidi da processare</h1>
        <p className="text-muted-foreground text-sm">
          Esporta i fidi approvati per l'import in TIM System Gamma e conferma quando elaborati.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard icon={Inbox} tone="text-info" label="Da esportare" value={String(kpi.daEsportare)} />
        <KpiCard icon={FileCheck2} tone="text-warning" label="Esportate" value={String(kpi.esportate)} />
        <KpiCard
          icon={AlertTriangle}
          tone="text-destructive"
          label="Errori"
          value={String(kpi.errori)}
          highlight={kpi.errori > 0}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="gestire">Da gestire</TabsTrigger>
          <TabsTrigger value="storico">Storico processati</TabsTrigger>
        </TabsList>

        <TabsContent value="gestire" className="mt-4">
          <GestireTab
            rows={all.filter((r) => r.stato_export !== "processata")}
            loading={isLoading}
            stores={stores ?? []}
            profiloName={profiloName}
            onGeneraFile={(rows) => generaFile(rows, true)}
            onRigenera={(rows) => generaFile(rows, false)}
            onSetStato={(ids, stato, note, setProc) =>
              setStatoMutation.mutate({
                ids,
                stato_export: stato,
                note_export: note ?? null,
                setProcessata: setProc,
              })
            }
          />
        </TabsContent>

        <TabsContent value="storico" className="mt-4">
          <StoricoTab
            rows={all.filter((r) => r.stato_export === "processata")}
            loading={isLoading}
            stores={stores ?? []}
            profiloName={profiloName}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  icon: Icon, tone, label, value, highlight,
}: { icon: any; tone: string; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 flex items-center gap-3 ${highlight ? "border-destructive/40" : ""}`}>
      <div className={`size-9 rounded-md bg-muted flex items-center justify-center ${tone}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
      </div>
    </Card>
  );
}

function ExportBadge({ stato }: { stato: StatoExport | null }) {
  if (!stato) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATO_EXPORT_TONE[stato]}`}>
      {STATO_EXPORT_LABEL[stato]}
    </span>
  );
}

/* ============================ DA GESTIRE TAB ============================ */
function GestireTab({
  rows, loading, stores, profiloName, onGeneraFile, onRigenera, onSetStato,
}: {
  rows: any[];
  loading: boolean;
  stores: Array<{ id: string; nome: string }>;
  profiloName: (id: string | null | undefined) => string;
  onGeneraFile: (rows: any[]) => void;
  onRigenera: (rows: any[]) => void;
  onSetStato: (ids: string[], stato: StatoExport, note: string | null | undefined, setProcessata: boolean) => void;
}) {
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [statoFilter, setStatoFilter] = useState<string>("all");
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [erroreDialog, setErroreDialog] = useState<any | null>(null);
  const [erroreNote, setErroreNote] = useState("");
  const [processaConfirm, setProcessaConfirm] = useState<any | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (storeFilter !== "all" && r.store_id !== storeFilter) return false;
      if (statoFilter !== "all" && r.stato_export !== statoFilter) return false;
      const d = (r.data_chiusura ?? r.updated_at)?.slice(0, 10) ?? "";
      if (dataDa && d < dataDa) return false;
      if (dataA && d > dataA) return false;
      return true;
    });
  }, [rows, storeFilter, statoFilter, dataDa, dataA]);

  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someChecked = selected.size > 0;

  function toggle(id: string) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }

  const selectedRows = filtered.filter((r) => selected.has(r.id));

  if (loading) return <SkeletonTable />;

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Store" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli store</SelectItem>
            {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statoFilter} onValueChange={setStatoFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Stato export" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="da_esportare">Da esportare</SelectItem>
            <SelectItem value="esportata">Esportata</SelectItem>
            <SelectItem value="errore_export">Errore</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Dal</Label>
          <Input type="date" value={dataDa} onChange={(e) => setDataDa(e.target.value)} className="w-40" />
          <Label className="text-xs">al</Label>
          <Input type="date" value={dataA} onChange={(e) => setDataA(e.target.value)} className="w-40" />
        </div>
      </Card>

      {someChecked && (
        <Card className="p-3 flex flex-wrap items-center gap-2 bg-accent/30 border-accent">
          <span className="text-sm font-medium">{selected.size} selezionate</span>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() => {
              const toExport = selectedRows.filter((r) => r.stato_export === "da_esportare" || r.stato_export === "errore_export");
              if (!toExport.length) { toast.error("Nessuna riga in stato 'da esportare' selezionata"); return; }
              onGeneraFile(toExport);
              setSelected(new Set());
            }}
          >
            <Download className="size-4" /> Genera file per selezionate
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const toConfirm = selectedRows.filter((r) => r.stato_export === "esportata");
              if (!toConfirm.length) { toast.error("Nessuna riga in stato 'esportata' selezionata"); return; }
              onSetStato(toConfirm.map((r) => r.id), "processata", null, true);
              toast.success(`${toConfirm.length} richieste confermate come processate`);
              setSelected(new Set());
            }}
          >
            <Check className="size-4" /> Conferma processate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Annulla selezione
          </Button>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <FileSpreadsheet className="size-10 mx-auto mb-2 opacity-50" />
          Nessuna richiesta da gestire con i filtri attuali.
        </Card>
      ) : (
        <Card className="p-2 sm:p-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Cod. Gest.</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Imp. approvato</TableHead>
                <TableHead>Data approv.</TableHead>
                <TableHead>Approvato da</TableHead>
                <TableHead>Export</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const se = r.stato_export as StatoExport;
                return (
                  <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    </TableCell>
                    <TableCell className="font-medium">{r.clienti?.ragione_sociale ?? "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{r.clienti?.codice_gestionale ?? r.clienti?.codice_assegnato ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.stores?.nome ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>
                        {TIPO_LABEL[r.tipo as TipoRichiesta]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success font-medium">
                      {formatEuro(Number(r.importo_approvato ?? r.importo_richiesto))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(r.data_chiusura ?? r.updated_at)}</TableCell>
                    <TableCell className="text-xs">{profiloName(r.approvato_da) !== "—" ? profiloName(r.approvato_da) : profiloName(r.created_by)}</TableCell>
                    <TableCell><ExportBadge stato={se} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {se === "da_esportare" && (
                          <Button size="sm" onClick={() => onGeneraFile([r])}>
                            <Download className="size-4" /> Genera
                          </Button>
                        )}
                        {se === "esportata" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => onRigenera([r])} title="Rigenera file">
                              <RefreshCw className="size-4" />
                            </Button>
                            <Button size="sm" variant="default" onClick={() => setProcessaConfirm(r)} title="Conferma processata">
                              <Check className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setErroreDialog(r); setErroreNote(""); }}
                              title="Segnala errore"
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <X className="size-4" />
                            </Button>
                          </>
                        )}
                        {se === "errore_export" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onSetStato([r.id], "da_esportare", null, false)}
                            >
                              <RefreshCw className="size-4" /> Riprova
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => onRigenera([r])}>
                              <Download className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialog errore */}
      <Dialog open={!!erroreDialog} onOpenChange={(o) => !o && setErroreDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Segnala errore di import</DialogTitle>
            <DialogDescription>
              Indica perché l'import in TIM System ha generato un errore per <b>{erroreDialog?.clienti?.ragione_sociale}</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Note errore *</Label>
            <Textarea
              value={erroreNote}
              onChange={(e) => setErroreNote(e.target.value)}
              placeholder="Es. Codice cliente non riconosciuto in TIM System..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setErroreDialog(null)}>Annulla</Button>
            <Button
              variant="destructive"
              disabled={erroreNote.trim().length < 5}
              onClick={() => {
                onSetStato([erroreDialog.id], "errore_export", erroreNote.trim(), false);
                toast.success("Errore registrato");
                setErroreDialog(null);
              }}
            >
              Conferma errore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog conferma processata */}
      <Dialog open={!!processaConfirm} onOpenChange={(o) => !o && setProcessaConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferma elaborazione</DialogTitle>
            <DialogDescription>
              Confermi che il fido per <b>{processaConfirm?.clienti?.ragione_sociale}</b> è stato
              correttamente caricato in TIM System Gamma?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessaConfirm(null)}>Annulla</Button>
            <Button
              onClick={() => {
                onSetStato([processaConfirm.id], "processata", null, true);
                toast.success("Richiesta marcata come processata");
                setProcessaConfirm(null);
              }}
            >
              <Check className="size-4" /> Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ STORICO TAB ============================ */
function StoricoTab({
  rows, loading, stores, profiloName,
}: {
  rows: any[];
  loading: boolean;
  stores: Array<{ id: string; nome: string }>;
  profiloName: (id: string | null | undefined) => string;
}) {
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [meseFiltro, setMeseFiltro] = useState<string>("ultimi3");
  const [mostraTutto, setMostraTutto] = useState(false);

  const cutoff = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString();
  }, []);

  const mesi = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { const k = (r.data_processata ?? r.data_export ?? r.data_chiusura)?.slice(0, 7); if (k) s.add(k); });
    return Array.from(s).sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (storeFilter !== "all") r = r.filter((x) => x.store_id === storeFilter);
    if (!mostraTutto && meseFiltro === "ultimi3") {
      r = r.filter((x) => (x.data_processata ?? x.data_export ?? x.data_chiusura) >= cutoff);
    }
    if (meseFiltro !== "ultimi3" && meseFiltro !== "tutto") {
      r = r.filter((x) => (x.data_processata ?? x.data_export ?? x.data_chiusura)?.slice(0, 7) === meseFiltro);
    }
    return r;
  }, [rows, storeFilter, mostraTutto, meseFiltro, cutoff]);

  if (loading) return <SkeletonTable />;

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Store" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli store</SelectItem>
            {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={meseFiltro} onValueChange={setMeseFiltro}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ultimi3">Ultimi 3 mesi</SelectItem>
            <SelectItem value="tutto">Tutti i mesi</SelectItem>
            {mesi.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        {meseFiltro === "ultimi3" && !mostraTutto && (
          <Button variant="outline" size="sm" onClick={() => setMostraTutto(true)}>Carica tutto</Button>
        )}
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nessuna richiesta processata nel periodo selezionato.
        </Card>
      ) : (
        <Card className="p-2 sm:p-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Imp. approvato</TableHead>
                <TableHead>Data approv.</TableHead>
                <TableHead>Data export</TableHead>
                <TableHead>Data processata</TableHead>
                <TableHead>Esportata da</TableHead>
                <TableHead>Processata da</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.clienti?.ragione_sociale ?? "—"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>
                      {TIPO_LABEL[r.tipo as TipoRichiesta]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-success font-medium">
                    {formatEuro(Number(r.importo_approvato ?? r.importo_richiesto))}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.data_chiusura)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.data_export)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.data_processata)}</TableCell>
                  <TableCell className="text-xs">{profiloName(r.esportata_da)}</TableCell>
                  <TableCell className="text-xs">{profiloName(r.processata_da)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}
