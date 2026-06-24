import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle, AlertCircle, Plus, Calendar, Mail, Phone, FileText, Scale,
  Shield, Bell, CheckCircle2, Clock, Gavel, ShieldCheck, Loader2, Pencil, Trash2, Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { classificaScadenza, sommaScadutoCliente, contributoScaduto } from "@/lib/scadenze";
import { AllegatiSection, ALLEGATI_BUCKET } from "@/components/allegati-section";

// ============================================================================
// Helper TRANSITORI per gestione import (POUEY assicurazioni, pratiche aperte).
// Da rimuovere quando gli import di assicurazioni/pratiche saranno disattivati.
// ============================================================================
function isPolizzaGestitaDaImport(p: { assicuratore?: string | null }): boolean {
  return (p.assicuratore ?? "").trim().toUpperCase() === "POUEY";
}
function isPraticaARischioRicreazione(p: { stato?: string | null }): boolean {
  // L'import inserisce solo pratiche con stato='aperta'. Se è aperta, potrebbe essere ricreata.
  return (p.stato ?? "") === "aperta";
}
const CAMPI_POLIZZA_SOVRASCRITTI = new Set([
  "importo_massimale",
  "importo_assicurato",
  "data_inizio",
  "data_scadenza",
  "stato",
]);


function fmtEuro(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("it-IT"); } catch { return String(v); }
}

const TIPO_SOLLECITO = ["interno", "email", "telefono", "raccomandata", "avvocato", "legale", "altro"] as const;
const STATO_SOLLECITO = ["inviato", "in_attesa_risposta", "risposto", "ignorato", "risolto"] as const;
const TIPO_PRATICA = ["decreto_ingiuntivo", "pignoramento", "precetto", "azione_legale_generica", "messa_a_perdita", "concordato", "fallimento", "altro"] as const;
const STATO_PRATICA = ["aperta", "in_corso", "decreto_ottenuto", "pignoramento_eseguito", "pignoramento_negativo", "chiusa_pagamento", "chiusa_perdita", "sospesa"] as const;

export function ClienteInsolutiTab({ cliente, defaultSubTab }: { cliente: { id: string; bloccato?: boolean; in_gestione_legale?: boolean; data_blocco?: string | null; motivo_blocco?: string | null }; defaultSubTab?: string }) {
  const { role, roles } = useAuth();
  const isStoreManager = role === "store_manager";
  const isAdminOrApprov = role === "amministratore" || role === "approvatore_liv1" || role === "approvatore_liv2" || role === "approvatore_liv3";
  const canEditAssicurazioniAllegati = roles.includes("amministratore") || roles.includes("amministrazione");
  // Stessa regola degli allegati estesa: chi puo gestire (creare/modificare/eliminare) polizze e pratiche
  const canManageAssicPratiche =
    roles.includes("amministratore") ||
    roles.includes("amministrazione") ||
    roles.includes("direzione") ||
    roles.includes("approvatore_liv1") ||
    roles.includes("approvatore_liv2") ||
    roles.includes("approvatore_liv3");

  return (
    <div className="space-y-4">
      {/* Banner blocco */}
      {cliente.bloccato && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-6 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-lg font-bold text-destructive">CLIENTE BLOCCATO</p>
              {cliente.data_blocco && (
                <p className="text-xs text-muted-foreground mt-0.5">Dal {fmtDate(cliente.data_blocco)}</p>
              )}
              {cliente.motivo_blocco && (
                <p className="text-sm mt-1">{cliente.motivo_blocco}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {cliente.in_gestione_legale && (
        <div className="rounded-lg border border-orange-500 bg-orange-500/10 p-3">
          <div className="flex items-center gap-2">
            <Gavel className="size-5 text-orange-600 shrink-0" />
            <p className="font-semibold text-orange-700">IN GESTIONE LEGALE</p>
          </div>
        </div>
      )}

      <Tabs defaultValue={defaultSubTab ?? "riepilogo"}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="riepilogo">Riepilogo</TabsTrigger>
          <TabsTrigger value="scadenziario">Scadenziario</TabsTrigger>
          <TabsTrigger value="solleciti">Solleciti</TabsTrigger>
          {!isStoreManager && <TabsTrigger value="legali">Pratiche legali</TabsTrigger>}
          {!isStoreManager && <TabsTrigger value="assicurazioni">Assicurazione</TabsTrigger>}
        </TabsList>

        <TabsContent value="riepilogo"><RiepilogoSection clienteId={cliente.id} /></TabsContent>
        <TabsContent value="scadenziario"><ScadenziarioSection clienteId={cliente.id} canEdit={isAdminOrApprov} /></TabsContent>
        <TabsContent value="solleciti"><SollecitiSection clienteId={cliente.id} canEdit={isAdminOrApprov} /></TabsContent>
        {!isStoreManager && <TabsContent value="legali">
          <div className="space-y-4">
            <NoteLegaliGestionaliCard clienteId={cliente.id} />
            <PraticheLegaliSection clienteId={cliente.id} canManage={canManageAssicPratiche} />
          </div>
        </TabsContent>}
        {!isStoreManager && <TabsContent value="assicurazioni"><AssicurazioniSection clienteId={cliente.id} canManage={canManageAssicPratiche} canEditAllegati={canEditAssicurazioniAllegati} /></TabsContent>}
      </Tabs>
    </div>
  );
}

/* ============================== RIEPILOGO ============================== */

function RiepilogoSection({ clienteId }: { clienteId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["riepilogo-insoluti", clienteId],
    queryFn: async () => {
      const { data: scad, error } = await supabase
        .from("scadenze")
        .select("importo_scadenza, giorni_ritardo, stato_contabile, tempi_scadenza, data_scadenza, data_pagamento_effettiva")
        .eq("cliente_id", clienteId);
      if (error) throw error;
      const rows = (scad ?? []) as Array<{ importo_scadenza: number | null; giorni_ritardo: number | null; stato_contabile: string | null; tempi_scadenza: string | null; data_scadenza: string | null; data_pagamento_effettiva: string | null }>;
      const scadute = rows.filter((s) => classificaScadenza(s) === "scaduto");
      const aScadere = rows.filter((s) => classificaScadenza(s) === "a_scadere");
      const sumImp = (arr: typeof rows) => arr.reduce((acc, r) => acc + Number(r.importo_scadenza ?? 0), 0);
      const maxGg = [...scadute, ...aScadere].reduce((m, r) => Math.max(m, Number(r.giorni_ritardo ?? 0)), 0);
      const fascia = (min: number, max: number | null) =>
        sumImp(scadute.filter((s) => {
          const g = Number(s.giorni_ritardo ?? 0);
          return g >= min && (max == null || g <= max);
        }));
      const { data: ultSoll } = await supabase
        .from("solleciti")
        .select("data_sollecito")
        .eq("cliente_id", clienteId)
        .order("data_sollecito", { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        num_scadenze_aperte: scadute.length + aScadere.length,
        totale_scaduto: sumImp(scadute),
        totale_a_scadere: sumImp(aScadere),
        max_giorni_ritardo: maxGg,
        scaduto_0_30: fascia(1, 30),
        scaduto_30_60: fascia(31, 60),
        scaduto_oltre_60: fascia(61, null),
        ultimo_sollecito: (ultSoll as { data_sollecito: string | null } | null)?.data_sollecito ?? null,
      };
    },
  });

  if (isLoading) return <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-24" />)}</div>;
  const d = data ?? { num_scadenze_aperte: 0, totale_scaduto: 0, totale_a_scadere: 0, max_giorni_ritardo: 0, scaduto_0_30: 0, scaduto_30_60: 0, scaduto_oltre_60: 0, ultimo_sollecito: null };
  const totFasce = Number(d.scaduto_0_30) + Number(d.scaduto_30_60) + Number(d.scaduto_oltre_60);
  const pct = (v: number) => totFasce > 0 ? (v / totFasce) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Totale scaduto" value={fmtEuro(d.totale_scaduto)} tone="destructive" icon={AlertTriangle} />
        <KpiCard label="A scadere" value={fmtEuro(d.totale_a_scadere)} tone="info" icon={Calendar} />
        <KpiCard label="Max giorni ritardo" value={`${d.max_giorni_ritardo} gg`} tone="warning" icon={Clock} />
        <KpiCard label="Ultimo sollecito" value={fmtDate(d.ultimo_sollecito)} tone="default" icon={Bell} />
      </div>
      <Card className="p-5">
        <h3 className="font-semibold mb-3 text-sm">Fasce di scaduto</h3>
        <div className="space-y-3">
          <FasciaBar label="0–30 giorni" value={Number(d.scaduto_0_30)} pct={pct(Number(d.scaduto_0_30))} color="bg-yellow-500" />
          <FasciaBar label="31–60 giorni" value={Number(d.scaduto_30_60)} pct={pct(Number(d.scaduto_30_60))} color="bg-orange-500" />
          <FasciaBar label="oltre 60 giorni" value={Number(d.scaduto_oltre_60)} pct={pct(Number(d.scaduto_oltre_60))} color="bg-destructive" />
        </div>
      </Card>
      <AssicurazioneRiepilogoCard clienteId={clienteId} />
    </div>
  );
}

function AssicurazioneRiepilogoCard({ clienteId }: { clienteId: string }) {
  const { role } = useAuth();
  const isAdmin = role === "amministratore";
  const { data } = useQuery({
    queryKey: ["assic-riepilogo", clienteId],
    queryFn: async () => {
      const [{ data: cli }, { data: pol }] = await Promise.all([
        supabase.from("clienti").select("assicurazione_attiva").eq("id", clienteId).maybeSingle(),
        supabase.from("assicurazioni_credito" as never).select("assicuratore, importo_massimale, data_scadenza, stato").eq("cliente_id", clienteId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        attiva: !!(cli as { assicurazione_attiva?: boolean } | null)?.assicurazione_attiva,
        polizza: pol as { assicuratore: string; importo_massimale: number | null; data_scadenza: string | null; stato: string } | null,
      };
    },
  });
  const attiva = !!data?.attiva;
  const p = data?.polizza ?? null;
  const scaduta = !!(p?.data_scadenza && new Date(p.data_scadenza) < new Date());

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" /> Assicurazione crediti
      </h3>
      {attiva && p ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-success/15 text-success border-success/30">{p.assicuratore || "POUEY"}</Badge>
            <Badge variant="outline" className="capitalize">{p.stato.replace(/_/g, " ")}</Badge>
            {scaduta && <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">Polizza scaduta</Badge>}
          </div>
          <p>Massimale: <strong className="tabular-nums">{fmtEuro(p.importo_massimale)}</strong></p>
          {p.data_scadenza && <p className="text-muted-foreground">Scadenza polizza: {fmtDate(p.data_scadenza)}</p>}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">Nessuna polizza attiva</p>
          {isAdmin && (
            <p className="text-xs text-muted-foreground">Vai al sotto-tab "Assicurazione" per aggiungere una polizza.</p>
          )}
        </div>
      )}
    </Card>
  );
}


function KpiCard({ label, value, tone, icon: Icon }: { label: string; value: string; tone: "destructive" | "info" | "warning" | "default"; icon: typeof FileText }) {
  const cls = tone === "destructive" ? "bg-destructive/10 text-destructive"
    : tone === "info" ? "bg-primary/10 text-primary"
    : tone === "warning" ? "bg-orange-500/10 text-orange-600"
    : "bg-muted text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
          <p className="text-xl font-bold mt-1">{value}</p>
        </div>
        <div className={`size-9 rounded-lg flex items-center justify-center ${cls}`}><Icon className="size-4" /></div>
      </div>
    </Card>
  );
}

function FasciaBar({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="font-medium tabular-nums">{fmtEuro(value)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ============================== SCADENZIARIO ============================== */

type ScadenzaRow = {
  id: string;
  numero_documento: string | null;
  data_documento: string | null;
  data_scadenza: string | null;
  data_pagamento_effettiva: string | null;
  descrizione_pagamento: string | null;
  importo_scadenza: number | null;
  giorni_ritardo: number | null;
  stato_contabile: string | null;
  tempi_scadenza: string | null;
};

function ScadenziarioSection({ clienteId }: { clienteId: string; canEdit?: boolean }) {
  const { data: scadenze, isLoading } = useQuery({
    queryKey: ["scadenze", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("id, numero_documento, data_documento, data_scadenza, data_pagamento_effettiva, descrizione_pagamento, importo_scadenza, giorni_ritardo, stato_contabile, tempi_scadenza")
        .eq("cliente_id", clienteId)
        .order("data_scadenza", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScadenzaRow[];
    },
  });


  if (isLoading) return <Skeleton className="h-40" />;
  const rows = scadenze ?? [];
  const scadute = rows.filter((s) => classificaScadenza(s) === "scaduto");
  const aScadere = rows.filter((s) => classificaScadenza(s) === "a_scadere");

  return (
    <div className="space-y-6">
      <ScadutoBlock rows={scadute} />
      <AScadereBlock rows={aScadere} />
    </div>
  );
}

function ScadutoBlock({ rows }: { rows: ScadenzaRow[] }) {
  const totale = rows.reduce((acc, r) => acc + Number(r.importo_scadenza ?? 0), 0);
  const ggMedi = rows.length ? Math.round(rows.reduce((a, r) => a + Number(r.giorni_ritardo ?? 0), 0) / rows.length) : 0;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase text-destructive flex items-center gap-2">
        <AlertTriangle className="size-4" /> Scaduto
      </h3>
      {rows.length === 0 ? (
        <Card className="p-8 text-center flex flex-col items-center gap-2">
          <CheckCircle2 className="size-8 text-success" />
          <p className="text-sm text-muted-foreground">Nessuno scaduto</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="Totale scaduto" value={fmtEuro(totale)} tone="destructive" icon={AlertTriangle} />
            <KpiCard label="Fatture scadute" value={String(rows.length)} tone="info" icon={FileText} />
            <KpiCard label="Giorni medi ritardo" value={`${ggMedi} gg`} tone="warning" icon={Clock} />
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N. Documento</TableHead>
                  <TableHead>Data Doc.</TableHead>
                  <TableHead>Data Scadenza</TableHead>
                  <TableHead>Cond. Pagamento</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead className="text-right">Gg Ritardo</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((s) => {
                  const gg = Number(s.giorni_ritardo ?? 0);
                  const rowCls = gg > 60 ? "bg-destructive/10" : gg > 30 ? "bg-orange-500/10" : "bg-yellow-500/10";
                  return (
                    <TableRow key={s.id} className={rowCls}>
                      <TableCell className="font-mono text-xs">{s.numero_documento ?? "—"}</TableCell>
                      <TableCell className="text-sm">{fmtDate(s.data_documento)}</TableCell>

                      <TableCell className="text-sm">{fmtDate(s.data_scadenza)}</TableCell>
                      <TableCell className="text-xs">{s.descrizione_pagamento ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtEuro(s.importo_scadenza)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{gg}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={4} className="font-semibold text-right">Totale</TableCell>
                  <TableCell className="text-right font-bold text-destructive tabular-nums">{fmtEuro(totale)}</TableCell>
                  <TableCell />
                </TableRow>

              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function AScadereBlock({ rows }: { rows: ScadenzaRow[] }) {
  const totale = rows.reduce((acc, r) => acc + Number(r.importo_scadenza ?? 0), 0);
  const prossima = rows
    .map((r) => r.data_scadenza)
    .filter((d): d is string => !!d)
    .sort()[0] ?? null;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase text-primary flex items-center gap-2">
        <Calendar className="size-4" /> A scadere
      </h3>
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nessuna scadenza aperta</Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="Totale a scadere" value={fmtEuro(totale)} tone="info" icon={FileText} />
            <KpiCard label="Fatture" value={String(rows.length)} tone="default" icon={FileText} />
            <KpiCard label="Prossima scadenza" value={fmtDate(prossima)} tone="warning" icon={Calendar} />
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N. Documento</TableHead>
                  <TableHead>Sezionale</TableHead>
                  <TableHead>Data Doc.</TableHead>
                  <TableHead>Data Scadenza</TableHead>
                  <TableHead>Cond. Pagamento</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead className="text-right">Gg Ritardo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  let rowCls = "bg-success/5";
                  if (s.data_scadenza) {
                    const d = new Date(s.data_scadenza); d.setHours(0, 0, 0, 0);
                    const days = Math.round((d.getTime() - today.getTime()) / 86400000);
                    if (days <= 7) rowCls = "bg-orange-500/10";
                    else if (days <= 30) rowCls = "bg-yellow-500/10";
                  }
                  return (
                    <TableRow key={s.id} className={rowCls}>
                      <TableCell className="font-mono text-xs">{s.numero_documento ?? "—"}</TableCell>
                      <TableCell className="text-sm">{fmtDate(s.data_documento)}</TableCell>

                      <TableCell className="text-sm">{fmtDate(s.data_scadenza)}</TableCell>
                      <TableCell className="text-xs">{s.descrizione_pagamento ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtEuro(s.importo_scadenza)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{Number(s.giorni_ritardo ?? 0)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={4} className="font-semibold text-right">Totale</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{fmtEuro(totale)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

/* ============================== SOLLECITI ============================== */

function SollecitiSection({ clienteId, canEdit }: { clienteId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: solleciti, isLoading } = useQuery({
    queryKey: ["solleciti", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solleciti" as never)
        .select("*, profili:inserito_da(nome, cognome, email)")
        .eq("cliente_id", clienteId)
        .order("data_sollecito", { ascending: false });
      if (error) throw error;
      return data as Array<{ id: string; data_sollecito: string; tipo: string; nota: string; stato: string; risposta: string | null; profili: { nome: string | null; cognome: string | null; email: string | null } | null }>;
    },
  });

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="size-4" /> Aggiungi sollecito</Button>
            </DialogTrigger>
            <NuovoSollecitoDialog clienteId={clienteId} onClose={() => setOpen(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["solleciti", clienteId] }); qc.invalidateQueries({ queryKey: ["riepilogo-insoluti", clienteId] }); }} />
          </Dialog>
        </div>
      )}
      {isLoading ? <Skeleton className="h-40" /> : !solleciti || solleciti.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nessun sollecito</Card>
      ) : (
        <div className="space-y-2">
          {solleciti.map((s) => {
            const tipoIcon = s.tipo === "email" ? Mail : s.tipo === "telefono" ? Phone : s.tipo === "raccomandata" ? FileText : s.tipo === "avvocato" || s.tipo === "legale" ? Scale : Bell;
            const Icon = tipoIcon;
            const autore = s.profili ? `${s.profili.nome ?? ""} ${s.profili.cognome ?? ""}`.trim() || s.profili.email || "—" : "—";
            return (
              <Card key={s.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="size-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-muted-foreground">{fmtDate(s.data_sollecito)}</span>
                      <Badge variant="outline" className="capitalize">{s.tipo}</Badge>
                      <Badge variant="secondary" className="capitalize">{s.stato.replace(/_/g, " ")}</Badge>
                      <span className="text-xs text-muted-foreground">· {autore}</span>
                    </div>
                    <p className="text-sm mt-1.5 whitespace-pre-wrap">{s.nota}</p>
                    {s.risposta && (
                      <div className="mt-2 pl-3 border-l-2 border-primary/30">
                        <p className="text-xs text-muted-foreground">Risposta cliente:</p>
                        <p className="text-sm">{s.risposta}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const sollSchema = z.object({
  tipo: z.enum(TIPO_SOLLECITO),
  data_sollecito: z.string().min(1),
  nota: z.string().trim().min(1, "Nota obbligatoria").max(2000),
  importo_ref: z.coerce.number().nonnegative().optional(),
  reminder_attivo: z.boolean().default(false),
  reminder_data: z.string().optional(),
});

function NuovoSollecitoDialog({ clienteId, onClose, onSaved }: { clienteId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    tipo: "interno" as typeof TIPO_SOLLECITO[number],
    data_sollecito: new Date().toISOString().slice(0, 10),
    nota: "",
    importo_ref: "",
    reminder_attivo: false,
    reminder_data: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async () => {
      const parsed = sollSchema.parse({
        tipo: form.tipo,
        data_sollecito: form.data_sollecito,
        nota: form.nota,
        importo_ref: form.importo_ref ? Number(form.importo_ref) : undefined,
        reminder_attivo: form.reminder_attivo,
        reminder_data: form.reminder_data || undefined,
      });
      const { data: { user } } = await supabase.auth.getUser();
      const { data: sol, error } = await supabase.from("solleciti" as never).insert({
        cliente_id: clienteId,
        tipo: parsed.tipo,
        data_sollecito: parsed.data_sollecito,
        nota: parsed.nota,
        importo_ref: parsed.importo_ref ?? null,
        reminder_attivo: parsed.reminder_attivo,
        reminder_data: parsed.reminder_attivo && parsed.reminder_data ? parsed.reminder_data : null,
        inserito_da: user?.id ?? null,
      } as never).select("id").single();
      if (error) throw error;

      // Crea reminder per admin + approvatore_liv3 + notifica nella campanella
      if (parsed.reminder_attivo && parsed.reminder_data) {
        const { data: utenti } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["amministratore", "approvatore_liv3"]);
        const uniqueIds = Array.from(new Set((utenti ?? []).map((u) => u.user_id)));
        const { data: cliente } = await supabase.from("clienti").select("ragione_sociale").eq("id", clienteId).maybeSingle();
        const cName = cliente?.ragione_sociale ?? "Cliente";
        const reminderRows = uniqueIds.map((uid) => ({
          tipo: "sollecito_programmato" as const,
          titolo: `Reminder sollecito — ${cName}`,
          descrizione: parsed.nota.slice(0, 200),
          cliente_id: clienteId,
          sollecito_id: (sol as { id: string }).id,
          utente_id: uid,
          data_reminder: parsed.reminder_data,
        }));
        if (reminderRows.length) await supabase.from("reminder" as never).insert(reminderRows as never);

        const notificheRows = uniqueIds.map((uid) => ({
          user_id: uid,
          tipo: "reminder_sollecito",
          titolo: `Reminder sollecito — ${cName}`,
          messaggio: `Programma sollecito per ${parsed.reminder_data}: ${parsed.nota.slice(0, 120)}`,
          link: `/clienti/${clienteId}`,
          metadata: { cliente_id: clienteId, sollecito_id: (sol as { id: string }).id, data_reminder: parsed.reminder_data },
        }));
        if (notificheRows.length) await supabase.from("notifiche").insert(notificheRows as never);
      }
    },
    onSuccess: () => {
      toast.success("Sollecito registrato");
      onSaved();
      onClose();
    },
    onError: (e: Error) => {
      if (e instanceof z.ZodError) {
        const errs: Record<string, string> = {};
        e.issues.forEach((i) => { errs[String(i.path[0])] = i.message; });
        setErrors(errs);
      } else {
        toast.error(e.message);
      }
    },
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Nuovo sollecito</DialogTitle>
        <DialogDescription>Registra un sollecito al cliente.</DialogDescription>
      </DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as typeof TIPO_SOLLECITO[number] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_SOLLECITO.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data *</Label>
            <Input type="date" value={form.data_sollecito} onChange={(e) => setForm({ ...form, data_sollecito: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Nota *</Label>
          <Textarea rows={3} value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
          {errors.nota && <p className="text-xs text-destructive">{errors.nota}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Importo riferimento (€)</Label>
          <Input type="number" step="0.01" value={form.importo_ref} onChange={(e) => setForm({ ...form, importo_ref: e.target.value })} />
        </div>
        <div className="rounded-md border p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.reminder_attivo} onCheckedChange={(c) => setForm({ ...form, reminder_attivo: !!c })} />
            Attiva reminder
          </label>
          {form.reminder_attivo && (
            <div className="space-y-1.5">
              <Label>Data reminder</Label>
              <Input type="date" value={form.reminder_data} onChange={(e) => setForm({ ...form, reminder_data: e.target.value })} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
            Registra sollecito
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* ============================== NOTE LEGALI GESTIONALI (sola lettura) ============================== */

const CATEGORIA_COLORS: Record<string, string> = {
  "Decreto Ingiuntivo": "bg-destructive/15 text-destructive border-destructive/30",
  "Sollecito Legale": "bg-orange-500/15 text-orange-700 border-orange-500/30",
  "Pignoramento": "bg-red-700/15 text-red-800 border-red-700/30",
  "POUEY / Assicurazione": "bg-blue-500/15 text-blue-700 border-blue-500/30",
  "Piano di Rientro": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "Messa a Perdita": "bg-muted text-muted-foreground border-muted-foreground/30",
  "Altro": "bg-secondary text-secondary-foreground border-border",
};

function NoteLegaliGestionaliCard({ clienteId }: { clienteId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["note-legali-gest", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("note_legali_gestionali" as never)
        .select("id, testo, categoria, ultima_sincronizzazione")
        .eq("cliente_id", clienteId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data as { id: string; testo: string; categoria: string | null; ultima_sincronizzazione: string } | null;
    },
  });
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2"><Gavel className="size-4" /> Note Legali Gestionali</h3>
        {data?.categoria && (
          <Badge variant="outline" className={CATEGORIA_COLORS[data.categoria] ?? CATEGORIA_COLORS.Altro}>
            {data.categoria}
          </Badge>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Nessuna nota legale dal gestionale</p>
      ) : (
        <>
          <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{data.testo}</div>
          <p className="text-xs text-muted-foreground">
            Ultima sincronizzazione: {new Date(data.ultima_sincronizzazione).toLocaleString("it-IT")}
          </p>
        </>
      )}
    </Card>
  );
}

/* ============================== PRATICHE LEGALI ============================== */

type PraticaRow = { id: string; tipo: string; stato: string; importo_contestato: number | null; importo_recuperato: number | null; riferimento_avvocato: string | null; studio_legale: string | null; note: string | null; data_apertura: string; data_chiusura: string | null; updated_at?: string | null };

function PraticheLegaliSection({ clienteId, canManage }: { clienteId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: pratiche, isLoading } = useQuery({
    queryKey: ["pratiche-legali", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pratiche_legali" as never)
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PraticaRow[];
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Pratiche Legali</h3>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="size-4" /> Nuova pratica</Button>
            </DialogTrigger>
            <NuovaPraticaDialog clienteId={clienteId} onClose={() => setOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["pratiche-legali", clienteId] })} />
          </Dialog>
        )}
      </div>
      {isLoading ? <Skeleton className="h-32" /> : !pratiche || pratiche.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nessuna pratica legale aperta</Card>
      ) : (
        <div className="space-y-2">
          {pratiche.map((p) => (
            <PraticaCard key={p.id} pratica={p} clienteId={clienteId} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

function PraticaCard({ pratica: p, clienteId, canManage }: { pratica: PraticaRow; clienteId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [openChange, setOpenChange] = useState(false);
  const [openAggior, setOpenAggior] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pratiche-legali", clienteId] });
    qc.invalidateQueries({ queryKey: ["pratica-timeline", p.id] });
    qc.invalidateQueries({ queryKey: ["pratica-allegati", p.id] });
  };

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      // Cascade applicativo: elimina allegati (entita_tipo='pratica_legale') + file dal bucket
      const { data: alleg, error: eAll } = await supabase
        .from("allegati")
        .select("id, storage_path")
        .eq("entita_tipo", "pratica_legale")
        .eq("entita_id", p.id);
      if (eAll) throw eAll;
      if (alleg && alleg.length > 0) {
        const paths = alleg.map((a) => a.storage_path).filter(Boolean);
        if (paths.length > 0) await supabase.storage.from(ALLEGATI_BUCKET).remove(paths);
        const ids = alleg.map((a) => a.id);
        const { error: eDelAll } = await supabase.from("allegati").delete().in("id", ids);
        if (eDelAll) throw eDelAll;
      }
      // pratiche_legali_allegati e storico_pratiche_legali: cascade DB. reminder.pratica_id -> NULL
      const { error } = await supabase.from("pratiche_legali" as never).delete().eq("id", p.id);
      if (error) throw error;
      toast.success("Pratica eliminata");
      setOpenDelete(false);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore eliminazione");
    } finally {
      setDeleting(false);
    }
  }

  const rischioRicreazione = isPraticaARischioRicreazione(p);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="capitalize">{p.tipo.replace(/_/g, " ")}</Badge>
            <Badge className={`capitalize ${p.stato.startsWith("chiusa") ? "bg-muted text-foreground" : "bg-orange-500/15 text-orange-700"}`}>
              {p.stato.replace(/_/g, " ")}
            </Badge>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Aperta il {fmtDate(p.data_apertura)}</span>
            {p.studio_legale && <> · <span>{p.studio_legale}</span></>}
            {p.riferimento_avvocato && <> · <span>{p.riferimento_avvocato}</span></>}
          </div>
          <div className="text-sm">
            <span>Contestato: <strong>{fmtEuro(p.importo_contestato)}</strong></span>
            {Number(p.importo_recuperato ?? 0) > 0 && <> · <span>Recuperato: <strong className="text-success">{fmtEuro(p.importo_recuperato)}</strong></span></>}
          </div>
          {p.note && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{p.note}</p>}
        </div>
        {canManage && (
          <div className="flex flex-col gap-1.5">
            <Dialog open={openAggior} onOpenChange={setOpenAggior}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">Aggiungi aggiornamento</Button>
              </DialogTrigger>
              <AggiornamentoPraticaDialog pratica={p} onClose={() => setOpenAggior(false)} onSaved={invalidate} />
            </Dialog>
            <Dialog open={openChange} onOpenChange={setOpenChange}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">Cambia stato</Button>
              </DialogTrigger>
              <CambiaStatoPraticaDialog pratica={p} onClose={() => setOpenChange(false)} onSaved={invalidate} />
            </Dialog>
            <Dialog open={openEdit} onOpenChange={setOpenEdit} key={p.id}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5"><Pencil className="size-3.5" /> Modifica</Button>
              </DialogTrigger>
              <ModificaPraticaDialog pratica={p} onClose={() => setOpenEdit(false)} onSaved={invalidate} />
            </Dialog>
            <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setOpenDelete(true)}>
              <Trash2 className="size-3.5" /> Elimina
            </Button>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs">
        <button type="button" onClick={() => setShowTimeline((v) => !v)} className="text-primary hover:underline">
          {showTimeline ? "Nascondi" : "Mostra"} timeline aggiornamenti
        </button>
      </div>
      {showTimeline && <PraticaTimeline praticaId={p.id} />}
      <div className="mt-3 border-t pt-3">
        <AllegatiSection
          entitaTipo="pratica_legale"
          entitaId={p.id}
          clienteId={clienteId}
          canEdit
        />
      </div>

      <AlertDialog open={openDelete} onOpenChange={(v) => !v && !deleting && setOpenDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la pratica?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Verra eliminata definitivamente la pratica <strong>{p.tipo.replace(/_/g, " ")}</strong>,
                la sua timeline e tutti gli allegati collegati (file inclusi).
              </span>
              {rischioRicreazione && (
                <span className="block rounded-md border border-orange-500/40 bg-orange-500/10 p-2 text-orange-800 dark:text-orange-200">
                  ⚠ Questa pratica e <strong>aperta</strong> e potrebbe essere <strong>ricreata al prossimo import</strong> se la riga del cliente porta ancora una nota legale. Procedere?
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminazione…" : "Elimina pratica"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ModificaPraticaDialog({ pratica, onClose, onSaved }: { pratica: PraticaRow; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    tipo: pratica.tipo as typeof TIPO_PRATICA[number],
    stato: pratica.stato as typeof STATO_PRATICA[number],
    data_apertura: pratica.data_apertura ?? "",
    data_chiusura: pratica.data_chiusura ?? "",
    importo_contestato: pratica.importo_contestato != null ? String(pratica.importo_contestato) : "",
    importo_recuperato: pratica.importo_recuperato != null ? String(pratica.importo_recuperato) : "",
    riferimento_avvocato: pratica.riferimento_avvocato ?? "",
    studio_legale: pratica.studio_legale ?? "",
    numero_fascicolo: (pratica as PraticaRow & { numero_fascicolo?: string | null }).numero_fascicolo ?? "",
    note: pratica.note ?? "",
    esito: (pratica as PraticaRow & { esito?: string | null }).esito ?? "",
  });
  const save = useMutation({
    mutationFn: async () => {
      const updates: Record<string, unknown> = {
        tipo: form.tipo,
        stato: form.stato,
        data_apertura: form.data_apertura || null,
        data_chiusura: form.data_chiusura || null,
        importo_contestato: form.importo_contestato ? Number(form.importo_contestato) : null,
        importo_recuperato: form.importo_recuperato ? Number(form.importo_recuperato) : null,
        riferimento_avvocato: form.riferimento_avvocato || null,
        studio_legale: form.studio_legale || null,
        numero_fascicolo: form.numero_fascicolo || null,
        note: form.note || null,
        esito: form.esito || null,
      };
      const { error } = await supabase.from("pratiche_legali" as never).update(updates as never).eq("id", pratica.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pratica aggiornata"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Modifica pratica legale</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as typeof TIPO_PRATICA[number] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_PRATICA.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Stato *</Label>
            <Select value={form.stato} onValueChange={(v) => setForm({ ...form, stato: v as typeof STATO_PRATICA[number] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATO_PRATICA.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Data apertura</Label><Input type="date" value={form.data_apertura} onChange={(e) => setForm({ ...form, data_apertura: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Data chiusura</Label><Input type="date" value={form.data_chiusura} onChange={(e) => setForm({ ...form, data_chiusura: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Importo contestato (€)</Label><Input type="number" step="0.01" value={form.importo_contestato} onChange={(e) => setForm({ ...form, importo_contestato: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Importo recuperato (€)</Label><Input type="number" step="0.01" value={form.importo_recuperato} onChange={(e) => setForm({ ...form, importo_recuperato: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Studio legale</Label><Input value={form.studio_legale} onChange={(e) => setForm({ ...form, studio_legale: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Avvocato</Label><Input value={form.riferimento_avvocato} onChange={(e) => setForm({ ...form, riferimento_avvocato: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>N. fascicolo</Label><Input value={form.numero_fascicolo} onChange={(e) => setForm({ ...form, numero_fascicolo: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Esito</Label><Input value={form.esito} onChange={(e) => setForm({ ...form, esito: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Note</Label><Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={save.isPending}>Salva modifiche</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}


function PraticaTimeline({ praticaId }: { praticaId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["pratica-timeline", praticaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storico_pratiche_legali" as never)
        .select("id, stato_precedente, stato_nuovo, nota, created_at")
        .eq("pratica_id", praticaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Array<{ id: string; stato_precedente: string | null; stato_nuovo: string; nota: string | null; created_at: string }>;
    },
  });
  if (isLoading) return <Skeleton className="h-16 mt-2" />;
  if (!data?.length) return <p className="text-xs text-muted-foreground mt-2">Nessun aggiornamento registrato</p>;
  return (
    <ol className="mt-3 relative border-s pl-4 space-y-3">
      {data.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1 size-3 rounded-full bg-primary border-2 border-background" />
          <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("it-IT")}</div>
          {e.stato_precedente && e.stato_precedente !== e.stato_nuovo && (
            <div className="text-xs">
              <Badge variant="outline" className="capitalize">{e.stato_precedente.replace(/_/g, " ")}</Badge>
              <span className="mx-1">→</span>
              <Badge variant="outline" className="capitalize">{e.stato_nuovo.replace(/_/g, " ")}</Badge>
            </div>
          )}
          {e.nota && <p className="text-sm whitespace-pre-wrap mt-1">{e.nota}</p>}
        </li>
      ))}
    </ol>
  );
}

function AggiornamentoPraticaDialog({ pratica, onClose, onSaved }: { pratica: PraticaRow; onClose: () => void; onSaved: () => void }) {
  const [nota, setNota] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      if (!nota.trim()) throw new Error("Nota obbligatoria");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("storico_pratiche_legali" as never).insert({
        pratica_id: pratica.id,
        stato_precedente: pratica.stato,
        stato_nuovo: pratica.stato,
        nota: nota.trim(),
        modificato_da: user?.id ?? null,
      } as never);
      if (error) throw error;
      await supabase.from("pratiche_legali" as never).update({ updated_at: new Date().toISOString() } as never).eq("id", pratica.id);
    },
    onSuccess: () => { toast.success("Aggiornamento registrato"); onSaved(); onClose(); setNota(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Aggiungi aggiornamento</DialogTitle></DialogHeader>
      <div className="space-y-2">
        <Label>Nota cronologica *</Label>
        <Textarea rows={4} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Es. Telefonata con avvocato..." />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !nota.trim()}>Salva</Button>
      </DialogFooter>
    </DialogContent>
  );
}





function NuovaPraticaDialog({ clienteId, onClose, onSaved }: { clienteId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    tipo: "decreto_ingiuntivo" as typeof TIPO_PRATICA[number],
    importo_contestato: "",
    studio_legale: "",
    riferimento_avvocato: "",
    numero_fascicolo: "",
    note: "",
  });
  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("pratiche_legali" as never).insert({
        cliente_id: clienteId,
        tipo: form.tipo,
        importo_contestato: form.importo_contestato ? Number(form.importo_contestato) : null,
        studio_legale: form.studio_legale || null,
        riferimento_avvocato: form.riferimento_avvocato || null,
        numero_fascicolo: form.numero_fascicolo || null,
        note: form.note || null,
        gestita_da: user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pratica creata"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Nuova pratica legale</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as typeof TIPO_PRATICA[number] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_PRATICA.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Importo contestato (€)</Label>
            <Input type="number" step="0.01" value={form.importo_contestato} onChange={(e) => setForm({ ...form, importo_contestato: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Studio legale</Label>
            <Input value={form.studio_legale} onChange={(e) => setForm({ ...form, studio_legale: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Avvocato</Label>
            <Input value={form.riferimento_avvocato} onChange={(e) => setForm({ ...form, riferimento_avvocato: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>N. fascicolo</Label>
          <Input value={form.numero_fascicolo} onChange={(e) => setForm({ ...form, numero_fascicolo: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Note</Label>
          <Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={save.isPending}>Crea pratica</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function CambiaStatoPraticaDialog({ pratica, onClose, onSaved }: { pratica: { id: string; stato: string }; onClose: () => void; onSaved: () => void }) {
  const [nuovoStato, setNuovoStato] = useState<typeof STATO_PRATICA[number]>(pratica.stato as typeof STATO_PRATICA[number]);
  const [nota, setNota] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const updates: Record<string, unknown> = { stato: nuovoStato };
      if (nuovoStato === "chiusa_pagamento" || nuovoStato === "chiusa_perdita") {
        updates.data_chiusura = new Date().toISOString().slice(0, 10);
      }
      const { error: eUpd } = await supabase.from("pratiche_legali" as never).update(updates as never).eq("id", pratica.id);
      if (eUpd) throw eUpd;
      const { error: eSt } = await supabase.from("storico_pratiche_legali" as never).insert({
        pratica_id: pratica.id,
        stato_precedente: pratica.stato,
        stato_nuovo: nuovoStato,
        nota: nota || null,
        modificato_da: user?.id ?? null,
      } as never);
      if (eSt) throw eSt;
    },
    onSuccess: () => { toast.success("Stato aggiornato"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Cambia stato pratica</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Nuovo stato</Label>
          <Select value={nuovoStato} onValueChange={(v) => setNuovoStato(v as typeof STATO_PRATICA[number])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATO_PRATICA.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Nota</Label>
          <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Salva</Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ============================== ASSICURAZIONI ============================== */

type PolizzaRow = {
  id: string;
  assicuratore: string;
  numero_polizza: string | null;
  importo_massimale: number | null;
  importo_assicurato: number | null;
  stato: string;
  data_inizio: string | null;
  data_scadenza: string | null;
  sinistro_aperto: boolean;
  numero_sinistro: string | null;
  data_apertura_sinistro: string | null;
  importo_sinistro: number | null;
  note_sinistro: string | null;
  esito_sinistro: string | null;
  note: string | null;
  gestita_da: string | null;
};

const STATO_POLIZZA = ["attiva", "sospesa", "scaduta", "sinistro_aperto", "sinistro_chiuso"] as const;

function AssicurazioniSection({ clienteId, canManage, canEditAllegati }: { clienteId: string; canManage: boolean; canEditAllegati: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [openSinistro, setOpenSinistro] = useState<string | null>(null);
  const [openEdit, setOpenEdit] = useState<string | null>(null);
  const [deletePol, setDeletePol] = useState<PolizzaRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: polizze, isLoading } = useQuery({
    queryKey: ["assicurazioni", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assicurazioni_credito" as never)
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PolizzaRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["assicurazioni", clienteId] });
    qc.invalidateQueries({ queryKey: ["assic-riepilogo", clienteId] });
  };

  async function handleDelete() {
    if (!deletePol || deleting) return;
    setDeleting(true);
    try {
      // Cascade applicativo allegati
      const { data: alleg, error: eAll } = await supabase
        .from("allegati")
        .select("id, storage_path")
        .eq("entita_tipo", "assicurazione")
        .eq("entita_id", deletePol.id);
      if (eAll) throw eAll;
      if (alleg && alleg.length > 0) {
        const paths = alleg.map((a) => a.storage_path).filter(Boolean);
        if (paths.length > 0) await supabase.storage.from(ALLEGATI_BUCKET).remove(paths);
        const ids = alleg.map((a) => a.id);
        const { error: eDelAll } = await supabase.from("allegati").delete().in("id", ids);
        if (eDelAll) throw eDelAll;
      }
      const { error } = await supabase.from("assicurazioni_credito" as never).delete().eq("id", deletePol.id);
      if (error) throw error;
      // Se era l'ultima polizza del cliente, ricalcola assicurazione_attiva = false
      const { count } = await supabase
        .from("assicurazioni_credito" as never)
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", clienteId);
      if ((count ?? 0) === 0) {
        await supabase.from("clienti").update({ assicurazione_attiva: false } as never).eq("id", clienteId);
      }
      toast.success("Polizza eliminata");
      setDeletePol(null);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore eliminazione");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="size-4" /> Aggiungi polizza</Button>
            </DialogTrigger>
            <NuovaPolizzaDialog clienteId={clienteId} onClose={() => setOpen(false)} onSaved={invalidate} />
          </Dialog>
        </div>
      )}
      {isLoading ? <Skeleton className="h-32" /> : !polizze || polizze.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nessuna polizza registrata</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {polizze.map((p) => {
            const daImport = isPolizzaGestitaDaImport(p);
            return (
              <Card key={p.id} className="p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{p.assicuratore}</p>
                      <Badge variant="outline" className="capitalize">{p.stato.replace(/_/g, " ")}</Badge>
                      {daImport && (
                        <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30 gap-1">
                          <Info className="size-3" /> Gestita da import
                        </Badge>
                      )}
                    </div>
                    {p.numero_polizza && <p className="text-xs text-muted-foreground mt-0.5 font-mono">N° {p.numero_polizza}</p>}
                    <p className="text-sm mt-1">Massimale: <strong>{fmtEuro(p.importo_massimale)}</strong></p>
                    {p.data_scadenza && <p className="text-xs text-muted-foreground">Scade: {fmtDate(p.data_scadenza)}</p>}
                    {p.sinistro_aperto && (
                      <Badge className="bg-destructive/15 text-destructive mt-2">
                        <AlertCircle className="size-3 mr-1" /> Sinistro {p.numero_sinistro ?? ""}
                      </Badge>
                    )}
                    {canManage && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {!p.sinistro_aperto && (
                          <Dialog open={openSinistro === p.id} onOpenChange={(v) => setOpenSinistro(v ? p.id : null)}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline">Apri sinistro</Button>
                            </DialogTrigger>
                            <ApriSinistroDialog polizzaId={p.id} onClose={() => setOpenSinistro(null)} onSaved={invalidate} />
                          </Dialog>
                        )}
                        <Dialog open={openEdit === p.id} onOpenChange={(v) => setOpenEdit(v ? p.id : null)} key={p.id}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1.5"><Pencil className="size-3.5" /> Modifica</Button>
                          </DialogTrigger>
                          <ModificaPolizzaDialog polizza={p} onClose={() => setOpenEdit(null)} onSaved={invalidate} />
                        </Dialog>
                        <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeletePol(p)}>
                          <Trash2 className="size-3.5" /> Elimina
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 border-t pt-3">
                  <AllegatiSection
                    entitaTipo="assicurazione"
                    entitaId={p.id}
                    clienteId={clienteId}
                    canEdit={canEditAllegati}
                    compact
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deletePol} onOpenChange={(v) => !v && !deleting && setDeletePol(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la polizza?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Verra eliminata la polizza <strong>{deletePol?.assicuratore}</strong>
                {deletePol?.numero_polizza ? <> (N° {deletePol.numero_polizza})</> : null} e tutti gli allegati collegati (file inclusi).
              </span>
              {deletePol && isPolizzaGestitaDaImport(deletePol) && (
                <span className="block rounded-md border border-orange-500/40 bg-orange-500/10 p-2 text-orange-800 dark:text-orange-200">
                  ⚠ Questa polizza e <strong>gestita dall'import (POUEY)</strong>. Eliminandola, il prossimo import potrebbe <strong>ricrearla automaticamente</strong>. Procedere?
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminazione…" : "Elimina polizza"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ModificaPolizzaDialog({ polizza, onClose, onSaved }: { polizza: PolizzaRow; onClose: () => void; onSaved: () => void }) {
  const daImport = isPolizzaGestitaDaImport(polizza);
  const [form, setForm] = useState({
    assicuratore: polizza.assicuratore ?? "",
    numero_polizza: polizza.numero_polizza ?? "",
    importo_massimale: polizza.importo_massimale != null ? String(polizza.importo_massimale) : "",
    importo_assicurato: polizza.importo_assicurato != null ? String(polizza.importo_assicurato) : "",
    stato: polizza.stato as typeof STATO_POLIZZA[number],
    data_inizio: polizza.data_inizio ?? "",
    data_scadenza: polizza.data_scadenza ?? "",
    note: polizza.note ?? "",
    numero_sinistro: polizza.numero_sinistro ?? "",
    data_apertura_sinistro: polizza.data_apertura_sinistro ?? "",
    importo_sinistro: polizza.importo_sinistro != null ? String(polizza.importo_sinistro) : "",
    note_sinistro: polizza.note_sinistro ?? "",
    esito_sinistro: polizza.esito_sinistro ?? "",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.assicuratore.trim()) throw new Error("Assicuratore obbligatorio");
      const updates: Record<string, unknown> = {
        assicuratore: form.assicuratore.trim(),
        numero_polizza: form.numero_polizza || null,
        importo_massimale: form.importo_massimale ? Number(form.importo_massimale) : null,
        importo_assicurato: form.importo_assicurato ? Number(form.importo_assicurato) : null,
        stato: form.stato,
        data_inizio: form.data_inizio || null,
        data_scadenza: form.data_scadenza || null,
        note: form.note || null,
        numero_sinistro: form.numero_sinistro || null,
        data_apertura_sinistro: form.data_apertura_sinistro || null,
        importo_sinistro: form.importo_sinistro ? Number(form.importo_sinistro) : null,
        note_sinistro: form.note_sinistro || null,
        esito_sinistro: form.esito_sinistro || null,
      };
      const { error } = await supabase.from("assicurazioni_credito" as never).update(updates as never).eq("id", polizza.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Polizza aggiornata"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Helper visuale: marca i campi a rischio sovrascrittura al prossimo import
  const RischioBadge = ({ field }: { field: string }) =>
    daImport && CAMPI_POLIZZA_SOVRASCRITTI.has(field) ? (
      <span title="Verra sovrascritto al prossimo import" className="inline-flex items-center text-orange-600 ml-1">
        <AlertTriangle className="size-3" />
      </span>
    ) : null;

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          Modifica polizza
          {daImport && (
            <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30 gap-1">
              <Info className="size-3" /> Gestita da import
            </Badge>
          )}
        </DialogTitle>
      </DialogHeader>
      {daImport && (
        <div className="rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-xs text-orange-900 dark:text-orange-200 space-y-1">
          <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="size-3.5" /> Avviso polizza da import</p>
          <p>
            I campi <strong>Massimale</strong>, <strong>Importo assicurato</strong>, <strong>Stato</strong> e <strong>Date inizio/scadenza</strong> verranno
            <strong> sovrascritti al prossimo import</strong>. Modifiche sicure: numero polizza, note, dati sinistro.
          </p>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
        <div className="space-y-1.5"><Label>Assicuratore *</Label><Input value={form.assicuratore} onChange={(e) => setForm({ ...form, assicuratore: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Numero polizza</Label><Input value={form.numero_polizza} onChange={(e) => setForm({ ...form, numero_polizza: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="flex items-center">Massimale (€)<RischioBadge field="importo_massimale" /></Label>
            <Input type="number" step="0.01" value={form.importo_massimale} onChange={(e) => setForm({ ...form, importo_massimale: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center">Importo assicurato (€)<RischioBadge field="importo_assicurato" /></Label>
            <Input type="number" step="0.01" value={form.importo_assicurato} onChange={(e) => setForm({ ...form, importo_assicurato: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center">Stato<RischioBadge field="stato" /></Label>
          <Select value={form.stato} onValueChange={(v) => setForm({ ...form, stato: v as typeof STATO_POLIZZA[number] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATO_POLIZZA.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="flex items-center">Data inizio<RischioBadge field="data_inizio" /></Label>
            <Input type="date" value={form.data_inizio} onChange={(e) => setForm({ ...form, data_inizio: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center">Data scadenza<RischioBadge field="data_scadenza" /></Label>
            <Input type="date" value={form.data_scadenza} onChange={(e) => setForm({ ...form, data_scadenza: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5"><Label>Note</Label><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>

        <div className="border-t pt-3 space-y-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Dati sinistro</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Numero sinistro</Label><Input value={form.numero_sinistro} onChange={(e) => setForm({ ...form, numero_sinistro: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Data apertura sinistro</Label><Input type="date" value={form.data_apertura_sinistro} onChange={(e) => setForm({ ...form, data_apertura_sinistro: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Importo sinistro (€)</Label><Input type="number" step="0.01" value={form.importo_sinistro} onChange={(e) => setForm({ ...form, importo_sinistro: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Esito sinistro</Label><Input value={form.esito_sinistro} onChange={(e) => setForm({ ...form, esito_sinistro: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Note sinistro</Label><Textarea rows={2} value={form.note_sinistro} onChange={(e) => setForm({ ...form, note_sinistro: e.target.value })} /></div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={save.isPending}>Salva modifiche</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}


function NuovaPolizzaDialog({ clienteId, onClose, onSaved }: { clienteId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    assicuratore: "",
    numero_polizza: "",
    importo_massimale: "",
    data_inizio: "",
    data_scadenza: "",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.assicuratore.trim()) throw new Error("Assicuratore obbligatorio");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("assicurazioni_credito" as never).insert({
        cliente_id: clienteId,
        assicuratore: form.assicuratore.trim(),
        numero_polizza: form.numero_polizza || null,
        importo_massimale: form.importo_massimale ? Number(form.importo_massimale) : null,
        data_inizio: form.data_inizio || null,
        data_scadenza: form.data_scadenza || null,
        gestita_da: user?.id ?? null,
      } as never);
      if (error) throw error;
      // Marca cliente come assicurato
      await supabase.from("clienti").update({ assicurazione_attiva: true } as never).eq("id", clienteId);
    },
    onSuccess: () => { toast.success("Polizza aggiunta"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nuova polizza</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Assicuratore *</Label><Input value={form.assicuratore} onChange={(e) => setForm({ ...form, assicuratore: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Numero polizza</Label><Input value={form.numero_polizza} onChange={(e) => setForm({ ...form, numero_polizza: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Massimale (€)</Label><Input type="number" step="0.01" value={form.importo_massimale} onChange={(e) => setForm({ ...form, importo_massimale: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Data inizio</Label><Input type="date" value={form.data_inizio} onChange={(e) => setForm({ ...form, data_inizio: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Data scadenza</Label><Input type="date" value={form.data_scadenza} onChange={(e) => setForm({ ...form, data_scadenza: e.target.value })} /></div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Salva</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ApriSinistroDialog({ polizzaId, onClose, onSaved }: { polizzaId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ numero_sinistro: "", importo_sinistro: "", note_sinistro: "" });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("assicurazioni_credito" as never).update({
        sinistro_aperto: true,
        stato: "sinistro_aperto",
        numero_sinistro: form.numero_sinistro || null,
        data_apertura_sinistro: new Date().toISOString().slice(0, 10),
        importo_sinistro: form.importo_sinistro ? Number(form.importo_sinistro) : null,
        note_sinistro: form.note_sinistro || null,
      } as never).eq("id", polizzaId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sinistro aperto"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Apri sinistro</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Numero sinistro</Label><Input value={form.numero_sinistro} onChange={(e) => setForm({ ...form, numero_sinistro: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Importo sinistro (€)</Label><Input type="number" step="0.01" value={form.importo_sinistro} onChange={(e) => setForm({ ...form, importo_sinistro: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Note</Label><Textarea rows={3} value={form.note_sinistro} onChange={(e) => setForm({ ...form, note_sinistro: e.target.value })} /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Apri sinistro</Button>
      </DialogFooter>
    </DialogContent>
  );
}
