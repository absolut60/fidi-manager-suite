import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle, AlertCircle, Plus, Calendar, Mail, Phone, FileText, Scale,
  Shield, Bell, CheckCircle2, Clock, Gavel, ShieldCheck, Loader2,
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
import { classificaScadenza } from "@/lib/scadenze";

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
  const { role } = useAuth();
  const isStoreManager = role === "store_manager";
  const isAdminOrApprov = role === "amministratore" || role === "approvatore_liv1" || role === "approvatore_liv2" || role === "approvatore_liv3";

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
        {!isStoreManager && <TabsContent value="legali"><PraticheLegaliSection clienteId={cliente.id} isAdmin={role === "amministratore"} /></TabsContent>}
        {!isStoreManager && <TabsContent value="assicurazioni"><AssicurazioniSection clienteId={cliente.id} isAdmin={role === "amministratore"} /></TabsContent>}
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
        .select("importo_scadenza, giorni_ritardo, stato_contabile, tempi_scadenza")
        .eq("cliente_id", clienteId);
      if (error) throw error;
      const rows = (scad ?? []) as Array<{ importo_scadenza: number | null; giorni_ritardo: number | null; stato_contabile: string | null; tempi_scadenza: string | null }>;
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
  const d = data ?? { num_scadenze_aperte: 0, totale_scaduto: 0, max_giorni_ritardo: 0, scaduto_0_30: 0, scaduto_30_60: 0, scaduto_oltre_60: 0, ultimo_sollecito: null };
  const totFasce = Number(d.scaduto_0_30) + Number(d.scaduto_30_60) + Number(d.scaduto_oltre_60);
  const pct = (v: number) => totFasce > 0 ? (v / totFasce) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Totale scaduto" value={fmtEuro(d.totale_scaduto)} tone="destructive" icon={AlertTriangle} />
        <KpiCard label="Scadenze aperte" value={String(d.num_scadenze_aperte)} tone="info" icon={FileText} />
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
    </div>
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
  sezionale: string | null;
  data_documento: string | null;
  data_scadenza: string | null;
  descrizione_pagamento: string | null;
  importo_scadenza: number | null;
  giorni_ritardo: number | null;
  stato_contabile: string | null;
};

function ScadenziarioSection({ clienteId }: { clienteId: string; canEdit?: boolean }) {
  const { data: scadenze, isLoading } = useQuery({
    queryKey: ["scadenze", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("id, numero_documento, sezionale, data_documento, data_scadenza, descrizione_pagamento, importo_scadenza, giorni_ritardo, stato_contabile")
        .eq("cliente_id", clienteId)
        .eq("stato_contabile", "Aperta")
        .order("data_scadenza", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScadenzaRow[];
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;
  const rows = scadenze ?? [];
  const scadute = rows.filter((s) => Number(s.giorni_ritardo ?? 0) > 0);
  const aScadere = rows.filter((s) => Number(s.giorni_ritardo ?? 0) <= 0);

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
                  const gg = Number(s.giorni_ritardo ?? 0);
                  const rowCls = gg > 60 ? "bg-destructive/10" : gg > 30 ? "bg-orange-500/10" : "bg-yellow-500/10";
                  return (
                    <TableRow key={s.id} className={rowCls}>
                      <TableCell className="font-mono text-xs">{s.numero_documento ?? "—"}</TableCell>
                      <TableCell className="text-xs">{s.sezionale ?? "—"}</TableCell>
                      <TableCell className="text-sm">{fmtDate(s.data_documento)}</TableCell>
                      <TableCell className="text-sm">{fmtDate(s.data_scadenza)}</TableCell>
                      <TableCell className="text-xs">{s.descrizione_pagamento ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtEuro(s.importo_scadenza)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{gg}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={5} className="font-semibold text-right">Totale</TableCell>
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
                      <TableCell className="text-xs">{s.sezionale ?? "—"}</TableCell>
                      <TableCell className="text-sm">{fmtDate(s.data_documento)}</TableCell>
                      <TableCell className="text-sm">{fmtDate(s.data_scadenza)}</TableCell>
                      <TableCell className="text-xs">{s.descrizione_pagamento ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtEuro(s.importo_scadenza)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{Number(s.giorni_ritardo ?? 0)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={5} className="font-semibold text-right">Totale</TableCell>
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

/* ============================== PRATICHE LEGALI ============================== */

function PraticheLegaliSection({ clienteId, isAdmin }: { clienteId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [openChange, setOpenChange] = useState<string | null>(null);

  const { data: pratiche, isLoading } = useQuery({
    queryKey: ["pratiche-legali", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pratiche_legali" as never)
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Array<{ id: string; tipo: string; stato: string; importo_contestato: number | null; importo_recuperato: number | null; riferimento_avvocato: string | null; studio_legale: string | null; note: string | null; data_apertura: string; data_chiusura: string | null }>;
    },
  });

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="size-4" /> Nuova pratica</Button>
            </DialogTrigger>
            <NuovaPraticaDialog clienteId={clienteId} onClose={() => setOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["pratiche-legali", clienteId] })} />
          </Dialog>
        </div>
      )}
      {isLoading ? <Skeleton className="h-32" /> : !pratiche || pratiche.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nessuna pratica legale aperta</Card>
      ) : (
        <div className="space-y-2">
          {pratiche.map((p) => (
            <Card key={p.id} className="p-4">
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
                  {p.note && <p className="text-xs text-muted-foreground mt-1">{p.note}</p>}
                </div>
                {isAdmin && (
                  <Dialog open={openChange === p.id} onOpenChange={(v) => setOpenChange(v ? p.id : null)}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">Cambia stato</Button>
                    </DialogTrigger>
                    <CambiaStatoPraticaDialog
                      pratica={p}
                      onClose={() => setOpenChange(null)}
                      onSaved={() => qc.invalidateQueries({ queryKey: ["pratiche-legali", clienteId] })}
                    />
                  </Dialog>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
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

function AssicurazioniSection({ clienteId, isAdmin }: { clienteId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [openSinistro, setOpenSinistro] = useState<string | null>(null);

  const { data: polizze, isLoading } = useQuery({
    queryKey: ["assicurazioni", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assicurazioni_credito" as never)
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Array<{ id: string; assicuratore: string; numero_polizza: string | null; importo_massimale: number | null; stato: string; data_scadenza: string | null; sinistro_aperto: boolean; numero_sinistro: string | null }>;
    },
  });

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="size-4" /> Aggiungi polizza</Button>
            </DialogTrigger>
            <NuovaPolizzaDialog clienteId={clienteId} onClose={() => setOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["assicurazioni", clienteId] })} />
          </Dialog>
        </div>
      )}
      {isLoading ? <Skeleton className="h-32" /> : !polizze || polizze.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nessuna polizza registrata</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {polizze.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{p.assicuratore}</p>
                    <Badge variant="outline" className="capitalize">{p.stato.replace(/_/g, " ")}</Badge>
                  </div>
                  {p.numero_polizza && <p className="text-xs text-muted-foreground mt-0.5 font-mono">N° {p.numero_polizza}</p>}
                  <p className="text-sm mt-1">Massimale: <strong>{fmtEuro(p.importo_massimale)}</strong></p>
                  {p.data_scadenza && <p className="text-xs text-muted-foreground">Scade: {fmtDate(p.data_scadenza)}</p>}
                  {p.sinistro_aperto && (
                    <Badge className="bg-destructive/15 text-destructive mt-2">
                      <AlertCircle className="size-3 mr-1" /> Sinistro {p.numero_sinistro ?? ""}
                    </Badge>
                  )}
                  {isAdmin && !p.sinistro_aperto && (
                    <div className="mt-2">
                      <Dialog open={openSinistro === p.id} onOpenChange={(v) => setOpenSinistro(v ? p.id : null)}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">Apri sinistro</Button>
                        </DialogTrigger>
                        <ApriSinistroDialog polizzaId={p.id} onClose={() => setOpenSinistro(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["assicurazioni", clienteId] })} />
                      </Dialog>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
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
