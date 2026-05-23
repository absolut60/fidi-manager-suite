import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Search, FileText, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STATO_LABEL, STATO_TONE, TIPO_LABEL, TIPO_TONE, calcolaLivello, LIVELLO_LABEL, formatEuro, formatDate, type TipoRichiesta } from "@/lib/fidi";

export const Route = createFileRoute("/_app/richieste")({
  component: RichiestePage,
});

const schema = z.object({
  cliente_id: z.string().uuid("Seleziona un cliente"),
  tipo: z.enum(["nuovo", "nuovo_fido", "aumento", "diminuzione", "rinnovo"]),
  importo_richiesto: z.coerce.number().positive("Importo deve essere maggiore di 0").max(99999999),
  durata_mesi: z.coerce.number().int().min(1).max(120),
  motivazione: z.string().trim().max(1000).optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});
type Form = z.infer<typeof schema>;

const STATI_MODIFICABILI = ["bozza"]; // enum DB non ha "integrazioni_richieste"

function RichiestePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [stato, setStato] = useState<string>("tutti");
  const [tipoFilter, setTipoFilter] = useState<string>("tutti");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const { data: richieste, isLoading } = useQuery({
    queryKey: ["richieste"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_fido")
        .select("*, clienti(ragione_sociale), stores(nome, codice)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (r: any) => {
      if (r.stato !== "bozza") {
        throw new Error("Non puoi eliminare una richiesta già inviata");
      }
      const { error } = await supabase.from("richieste_fido").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Richiesta eliminata");
      qc.invalidateQueries({ queryKey: ["richieste"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (richieste ?? []).filter((r) => {
    if (stato !== "tutti" && r.stato !== stato) return false;
    if (tipoFilter !== "tutti" && r.tipo !== tipoFilter) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (r as any).clienti?.ragione_sociale?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Richieste fido</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestisci le richieste di fido commerciale
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="size-4" />
              Nuova richiesta
            </Button>
          </DialogTrigger>
          <NewRichiestaDialog onClose={() => setOpen(false)} />
        </Dialog>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per cliente..."
              className="pl-9"
            />
          </div>
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti i tipi</SelectItem>
              <SelectItem value="nuovo">Nuovo fido</SelectItem>
              <SelectItem value="aumento">Aumento</SelectItem>
              <SelectItem value="diminuzione">Diminuzione</SelectItem>
              <SelectItem value="rinnovo">Rinnovo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stato} onValueChange={setStato}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti gli stati</SelectItem>
              <SelectItem value="bozza">Bozza</SelectItem>
              <SelectItem value="in_approvazione">In approvazione</SelectItem>
              <SelectItem value="approvata">Approvata</SelectItem>
              <SelectItem value="rifiutata">Rifiutata</SelectItem>
              <SelectItem value="annullata">Annullata</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <p className="font-medium text-sm">Nessuna richiesta trovata</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search || stato !== "tutti" ? "Modifica i filtri" : "Crea la prima richiesta di fido"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead>Durata</TableHead>
                  <TableHead>Livello</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const editable = STATI_MODIFICABILI.includes(r.stato);
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => navigate({ to: "/clienti/$clienteId", params: { clienteId: r.cliente_id } })}
                    >
                      <TableCell className="font-medium">
                        {(r as any).clienti?.ragione_sociale ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>
                          {TIPO_LABEL[r.tipo as TipoRichiesta]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEuro(Number(r.importo_richiesto))}
                      </TableCell>
                      <TableCell className="text-sm">{r.durata_mesi} mesi</TableCell>
                      <TableCell>
                        <Badge variant="outline">Liv. {r.livello_corrente}/{r.livello_richiesto}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.stato]}`}>
                          {STATO_LABEL[r.stato]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(r.data_invio ?? r.created_at)}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            disabled={!editable}
                            title={editable ? "Modifica" : "Modificabile solo se in bozza"}
                            onClick={() => editable && setEditing(r)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-destructive hover:text-destructive"
                            title="Elimina"
                            onClick={() => {
                              if (r.stato !== "bozza") {
                                toast.error("Non puoi eliminare una richiesta già inviata");
                                return;
                              }
                              setDeleting(r);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <EditRichiestaDialog richiesta={editing} onClose={() => setEditing(null)} />
        )}
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la richiesta?</AlertDialogTitle>
            <AlertDialogDescription>
              L'operazione è irreversibile. La richiesta in bozza verrà rimossa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (deleting) deleteMut.mutate(deleting); }}
              disabled={deleteMut.isPending}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditRichiestaDialog({ richiesta, onClose }: { richiesta: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>({
    cliente_id: richiesta.cliente_id,
    tipo: richiesta.tipo,
    importo_richiesto: Number(richiesta.importo_richiesto),
    durata_mesi: richiesta.durata_mesi,
    motivazione: richiesta.motivazione ?? "",
    note: richiesta.note ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mut = useMutation({
    mutationFn: async (input: Form) => {
      const parsed = schema.parse(input);
      const { error } = await supabase.from("richieste_fido").update({
        tipo: parsed.tipo,
        importo_richiesto: parsed.importo_richiesto,
        durata_mesi: parsed.durata_mesi,
        motivazione: parsed.motivazione || null,
        note: parsed.note || null,
      }).eq("id", richiesta.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Richiesta aggiornata");
      qc.invalidateQueries({ queryKey: ["richieste"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = schema.safeParse(form);
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    mut.mutate(form);
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Modifica richiesta fido</DialogTitle>
        <DialogDescription>Aggiorna i dati della richiesta in bozza.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Tipo richiesta *</Label>
          <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoRichiesta })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nuovo">Nuovo fido</SelectItem>
              <SelectItem value="aumento">Aumento fido</SelectItem>
              <SelectItem value="diminuzione">Diminuzione fido</SelectItem>
              <SelectItem value="rinnovo">Rinnovo fido</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Importo (€) *</Label>
            <Input type="number" step="0.01" min="0"
              value={form.importo_richiesto || ""}
              onChange={(e) => setForm({ ...form, importo_richiesto: Number(e.target.value) })} />
            {errors.importo_richiesto && <p className="text-xs text-destructive">{errors.importo_richiesto}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Durata (mesi) *</Label>
            <Input type="number" min="1" max="120"
              value={form.durata_mesi}
              onChange={(e) => setForm({ ...form, durata_mesi: Number(e.target.value) })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Motivazione</Label>
          <Textarea rows={3} value={form.motivazione}
            onChange={(e) => setForm({ ...form, motivazione: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Note</Label>
          <Textarea rows={2} value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? "Salvataggio..." : "Salva modifiche"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function NewRichiestaDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>({
    cliente_id: "",
    tipo: "nuovo",
    importo_richiesto: 0,
    durata_mesi: 12,
    motivazione: "",
    note: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [inviaSubito, setInviaSubito] = useState(true);

  const { data: clienti } = useQuery({
    queryKey: ["clienti", "select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, store_id")
        .eq("attivo", true)
        .order("ragione_sociale");
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: Form) => {
      const parsed = schema.parse(input);
      const { data: { user } } = await supabase.auth.getUser();
      const cliente = clienti?.find((c) => c.id === parsed.cliente_id);
      const { error } = await supabase.from("richieste_fido").insert({
        cliente_id: parsed.cliente_id,
        tipo: parsed.tipo,
        store_id: cliente?.store_id ?? null,
        importo_richiesto: parsed.importo_richiesto,
        durata_mesi: parsed.durata_mesi,
        motivazione: parsed.motivazione || null,
        note: parsed.note || null,
        created_by: user?.id,
        stato: inviaSubito ? "in_approvazione" : "bozza",
        data_invio: inviaSubito ? new Date().toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(inviaSubito ? "Richiesta inviata in approvazione" : "Bozza salvata");
      qc.invalidateQueries({ queryKey: ["richieste"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = schema.safeParse(form);
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    mutation.mutate(form);
  }

  const livelloPreview = form.importo_richiesto > 0 ? calcolaLivello(Number(form.importo_richiesto)) : null;

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Nuova richiesta fido</DialogTitle>
        <DialogDescription>Compila i dettagli della richiesta.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="cliente_id">Cliente *</Label>
          <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
            <SelectTrigger id="cliente_id">
              <SelectValue placeholder={clienti?.length ? "Seleziona cliente..." : "Nessun cliente disponibile"} />
            </SelectTrigger>
            <SelectContent>
              {clienti?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.ragione_sociale}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.cliente_id && <p className="text-xs text-destructive">{errors.cliente_id}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tipo">Tipo richiesta *</Label>
          <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoRichiesta })}>
            <SelectTrigger id="tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nuovo">Nuovo fido</SelectItem>
              <SelectItem value="aumento">Aumento fido</SelectItem>
              <SelectItem value="diminuzione">Diminuzione fido</SelectItem>
              <SelectItem value="rinnovo">Rinnovo fido</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="importo">Importo (€) *</Label>
            <Input id="importo" type="number" step="0.01" min="0"
              value={form.importo_richiesto || ""}
              onChange={(e) => setForm({ ...form, importo_richiesto: Number(e.target.value) })} />
            {errors.importo_richiesto && <p className="text-xs text-destructive">{errors.importo_richiesto}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="durata">Durata (mesi) *</Label>
            <Input id="durata" type="number" min="1" max="120"
              value={form.durata_mesi}
              onChange={(e) => setForm({ ...form, durata_mesi: Number(e.target.value) })} />
          </div>
        </div>

        {livelloPreview && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Livello di approvazione richiesto: <strong className="text-foreground">{LIVELLO_LABEL[livelloPreview]}</strong>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="motivazione">Motivazione</Label>
          <Textarea id="motivazione" rows={3} value={form.motivazione}
            onChange={(e) => setForm({ ...form, motivazione: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" rows={2} value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={inviaSubito}
            onChange={(e) => setInviaSubito(e.target.checked)} className="size-4 rounded" />
          Invia subito in approvazione
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : inviaSubito ? "Invia richiesta" : "Salva bozza"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
