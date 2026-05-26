import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Building2, Pencil, Trash2, Sliders, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/impostazioni")({
  component: ImpostazioniPage,
});

const storeSchema = z.object({
  codice: z.string().trim().min(1, "Obbligatorio").max(20).regex(/^[A-Z0-9_-]+$/i, "Solo lettere, numeri, - _"),
  nome: z.string().trim().min(1, "Obbligatorio").max(100),
  indirizzo: z.string().trim().max(200).optional().or(z.literal("")),
  citta: z.string().trim().max(100).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
});
type StoreForm = z.infer<typeof storeSchema>;
type StoreRow = { id: string; codice: string; nome: string; indirizzo: string | null; citta: string | null; telefono: string | null; attivo: boolean };

function ImpostazioniPage() {
  const { role, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StoreRow | null>(null);

  const { data: stores, isLoading } = useQuery({
    queryKey: ["stores", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").order("codice");
      if (error) throw error;
      return data as StoreRow[];
    },
  });

  if (!loading && role !== "amministratore") {
    return <Card className="p-8 text-center"><p className="font-medium">Accesso riservato agli amministratori</p></Card>;
  }

  function openEdit(s: StoreRow) {
    setEditing(s);
    setOpen(true);
  }

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Impostazioni</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestisci i punti vendita del Gruppo MADE</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="gap-1.5"><Plus className="size-4" /> Nuovo punto vendita</Button>
          </DialogTrigger>
          <StoreDialog editing={editing} onClose={() => setOpen(false)} />
        </Dialog>
      </div>

      <ConfigurazioniCard />

      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Building2 className="size-4" /> Punti vendita ({stores?.length ?? 0})
        </h2>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !stores || stores.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm font-medium">Nessun punto vendita</p>
            <p className="text-xs text-muted-foreground mt-1">Aggiungi i 10 punti vendita del gruppo</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codice</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Città</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.codice}</TableCell>
                    <TableCell className="font-medium">{s.nome}</TableCell>
                    <TableCell className="text-sm">{s.citta || "—"}</TableCell>
                    <TableCell className="text-sm">{s.telefono || "—"}</TableCell>
                    <TableCell><Badge variant={s.attivo ? "default" : "secondary"}>{s.attivo ? "Attivo" : "Inattivo"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StoreDialog({ editing, onClose }: { editing: StoreRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<StoreForm>({
    codice: editing?.codice ?? "",
    nome: editing?.nome ?? "",
    indirizzo: editing?.indirizzo ?? "",
    citta: editing?.citta ?? "",
    telefono: editing?.telefono ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (input: StoreForm) => {
      const parsed = storeSchema.parse(input);
      const payload = {
        codice: parsed.codice.toUpperCase(),
        nome: parsed.nome,
        indirizzo: parsed.indirizzo || null,
        citta: parsed.citta || null,
        telefono: parsed.telefono || null,
      };
      if (editing) {
        const { error } = await supabase.from("stores").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stores").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Punto vendita aggiornato" : "Punto vendita creato");
      qc.invalidateQueries({ queryKey: ["stores"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase.from("stores").update({ attivo: !editing.attivo }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stato aggiornato");
      qc.invalidateQueries({ queryKey: ["stores"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = storeSchema.safeParse(form);
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    mutation.mutate(form);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Modifica punto vendita" : "Nuovo punto vendita"}</DialogTitle>
        <DialogDescription>Compila i dati del punto vendita.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="codice">Codice *</Label>
            <Input id="codice" value={form.codice} onChange={(e) => setForm({ ...form, codice: e.target.value.toUpperCase() })} placeholder="MADE01" />
            {errors.codice && <p className="text-xs text-destructive">{errors.codice}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="indirizzo">Indirizzo</Label>
          <Input id="indirizzo" value={form.indirizzo} onChange={(e) => setForm({ ...form, indirizzo: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="citta">Città</Label>
            <Input id="citta" value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telefono">Telefono</Label>
            <Input id="telefono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          {editing && (
            <Button type="button" variant="outline" className="mr-auto gap-1.5" onClick={() => deleteMutation.mutate()}>
              <Trash2 className="size-4" /> {editing.attivo ? "Disattiva" : "Riattiva"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvataggio..." : "Salva"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

type ConfigRow = { chiave: string; valore: string; descrizione: string | null };

const CONFIG_FIELDS: { chiave: string; label: string; suffix?: string; hint?: string; type?: string }[] = [
  { chiave: "soglia_livello_1", label: "Soglia Livello 1", suffix: "€", hint: "Importo massimo gestito dal liv. 1" },
  { chiave: "soglia_livello_2", label: "Soglia Livello 2", suffix: "€", hint: "Importo massimo gestito dal liv. 2 (oltre serve liv. 3)" },
  { chiave: "durata_default_mesi", label: "Durata di default", suffix: "mesi", hint: "Durata del fido proposta nelle nuove richieste" },
  { chiave: "reminder_giorni_scadenza", label: "Reminder scadenza", suffix: "giorni", hint: "Giorni di anticipo per segnalare i fidi in scadenza" },
  {
    chiave: "cutoff_cliente_attivo_anno",
    label: "Anno attività cliente",
    suffix: "",
    hint: "Un cliente è considerato 'attivo' se ha fatture con data ≥ 01/01/[anno]. Aggiorna ogni anno (es. 2026).",
    type: "year",
  },
];

function ConfigurazioniCard() {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["configurazioni"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configurazioni").select("*");
      if (error) throw error;
      return data as ConfigRow[];
    },
  });

  useEffect(() => {
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((r) => { map[r.chiave] = r.valore; });
      setValues(map);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const s1 = Number(values.soglia_livello_1);
      const s2 = Number(values.soglia_livello_2);
      if (!isFinite(s1) || !isFinite(s2) || s1 <= 0 || s2 <= s1) {
        throw new Error("Soglia liv.2 deve essere maggiore di soglia liv.1, entrambe > 0");
      }
      const anno = Number(values.cutoff_cliente_attivo_anno);
      if (!isFinite(anno) || anno < 2020 || anno > 2100) {
        throw new Error("Anno attività cliente non valido (es. 2025, 2026)");
      }
      const updates = CONFIG_FIELDS.map((f) =>
        supabase.from("configurazioni").update({ valore: values[f.chiave] ?? "" }).eq("chiave", f.chiave)
      );
      const results = await Promise.all(updates);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onSuccess: () => {
      toast.success("Parametri aggiornati");
      qc.invalidateQueries({ queryKey: ["configurazioni"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="font-semibold mb-1 flex items-center gap-2">
        <Sliders className="size-4" /> Soglie & parametri fido
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Soglie usate per assegnare automaticamente il livello di approvazione e parametri generali.
      </p>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CONFIG_FIELDS.map((f) => (
              <div key={f.chiave} className="space-y-1.5">
                <Label htmlFor={f.chiave}>{f.label}</Label>
                <div className="relative">
                  <Input
                    id={f.chiave}
                    type="number"
                    inputMode="numeric"
                    value={values[f.chiave] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.chiave]: e.target.value }))}
                    className={f.suffix ? "pr-14" : ""}
                  />
                  {f.suffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{f.suffix}</span>
                  )}
                </div>
                {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
              <Save className="size-4" /> {save.isPending ? "Salvataggio..." : "Salva parametri"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
