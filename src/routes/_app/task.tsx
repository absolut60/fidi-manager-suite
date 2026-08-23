import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, isBefore, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";
import { STATI, STATO_LABEL, STATO_BADGE, type StatoTask } from "@/lib/task-stato";

type TaskRow = Database["public"]["Tables"]["task"]["Row"];

export const Route = createFileRoute("/_app/task")({
  component: TaskPage,
  head: () => ({
    meta: [
      { title: "Task — FidiManager" },
      { name: "description", content: "Gestione dei task assegnati: creazione, delega, stato e scadenze." },
      { property: "og:title", content: "Task — FidiManager" },
      { property: "og:description", content: "Gestione dei task assegnati: creazione, delega, stato e scadenze." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});


const NESSUNO = "__nessuno__";
const TUTTI = "__tutti__";

function TaskPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = role === "amministratore";
  const userId = user?.id ?? null;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [daEliminare, setDaEliminare] = useState<TaskRow | null>(null);
  const [filtroStato, setFiltroStato] = useState<string>(TUTTI);
  const [soloMiei, setSoloMiei] = useState(false);

  const { data: task, isLoading } = useQuery({
    queryKey: ["task"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profili } = useQuery({
    queryKey: ["task", "profili"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profili")
        .select("id, nome, cognome, attivo")
        .eq("attivo", true)
        .order("cognome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: aree } = useQuery({
    queryKey: ["task", "aree"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("aree_funzionali")
        .select("id, nome")
        .eq("attiva", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  function nomeUtente(id: string | null) {
    if (!id) return null;
    const p = (profili ?? []).find((x) => x.id === id);
    if (!p) return "—";
    return [p.nome, p.cognome].filter(Boolean).join(" ") || "—";
  }

  function puoModificare(t: TaskRow) {
    return isAdmin || t.titolare_id === userId || t.esecutore_id === userId;
  }
  function puoEliminare(t: TaskRow) {
    return isAdmin || t.titolare_id === userId;
  }

  const righe = useMemo(() => {
    let lista = task ?? [];
    if (filtroStato === TUTTI) {
      lista = lista.filter((t) => t.stato !== "annullato");
    } else {
      lista = lista.filter((t) => t.stato === filtroStato);
    }
    if (soloMiei && userId) {
      lista = lista.filter(
        (t) => t.esecutore_id === userId || (t.esecutore_id === null && t.titolare_id === userId),
      );
    }
    return lista;
  }, [task, filtroStato, soloMiei, userId]);

  const cambiaStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: StatoTask }) => {
      const { error } = await supabase.from("task").update({ stato }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stato aggiornato");
      qc.invalidateQueries({ queryKey: ["task"] });
    },
    onError: () => toast.error("Non hai i permessi per modificare questo task"),
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task eliminato");
      setDaEliminare(null);
      qc.invalidateQueries({ queryKey: ["task"] });
    },
    onError: () => toast.error("Non hai i permessi per eliminare questo task"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Task</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Le attività che ti riguardano: create da te, assegnate a te o della tua area
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="size-4" /> Nuovo task
        </Button>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Stato</Label>
            <Select value={filtroStato} onValueChange={setFiltroStato}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutti (esclusi annullati)</SelectItem>
                {STATI.map((s) => (
                  <SelectItem key={s} value={s}>{STATO_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="solo-miei"
              checked={soloMiei}
              onCheckedChange={(c) => setSoloMiei(c === true)}
            />
            <Label htmlFor="solo-miei" className="font-normal">Solo assegnati a me</Label>
          </div>
        </div>

        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <ListChecks className="size-4" /> Task ({righe.length})
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : righe.length === 0 ? (
          <div className="text-center py-10"><p className="text-sm">Nessun task da mostrare</p></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titolo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Titolare</TableHead>
                  <TableHead>Esecutore</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {righe.map((t) => {
                  const scaduto =
                    !!t.scadenza &&
                    t.stato !== "fatto" &&
                    t.stato !== "annullato" &&
                    isBefore(new Date(t.scadenza), startOfDay(new Date()));
                  const badge = STATO_BADGE[t.stato];
                  return (
                    <TableRow key={t.id}>
                      <TableCell
                        className="cursor-pointer"
                        onClick={() => navigate({ to: "/task/$id", params: { id: t.id } })}
                      >
                        <div className="font-medium hover:underline">{t.titolo}</div>
                        {t.descrizione && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {t.descrizione}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {puoModificare(t) ? (
                          <Select
                            value={t.stato}
                            onValueChange={(v) => cambiaStato.mutate({ id: t.id, stato: v as StatoTask })}
                          >
                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATI.map((s) => (
                                <SelectItem key={s} value={s}>{STATO_LABEL[s]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={badge.variant} className={badge.className}>
                            {STATO_LABEL[t.stato]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{nomeUtente(t.titolare_id) ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.esecutore_id ? nomeUtente(t.esecutore_id) : "— (non assegnato)"}
                      </TableCell>
                      <TableCell className={`text-sm ${scaduto ? "text-destructive font-medium" : ""}`}>
                        {t.scadenza ? format(new Date(t.scadenza), "d MMM yyyy", { locale: it }) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Modifica task"
                            onClick={() => setEditing(t)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          {puoEliminare(t) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Elimina task"
                              onClick={() => setDaEliminare(t)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
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

      {(creating || editing) && (
        <TaskDialog
          task={editing}
          profili={profili ?? []}
          aree={aree ?? []}
          titolareLabel={editing ? (nomeUtente(editing.titolare_id) ?? "—") : ""}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}

      <AlertDialog open={!!daEliminare} onOpenChange={(o) => { if (!o) setDaEliminare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il task?</AlertDialogTitle>
            <AlertDialogDescription>
              «{daEliminare?.titolo}» verrà eliminato definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (daEliminare) elimina.mutate(daEliminare.id); }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TaskDialog({
  task,
  profili,
  aree,
  titolareLabel,
  onClose,
}: {
  task: TaskRow | null;
  profili: Array<{ id: string; nome: string | null; cognome: string | null }>;
  aree: Array<{ id: string; nome: string }>;
  titolareLabel: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [titolo, setTitolo] = useState(task?.titolo ?? "");
  const [descrizione, setDescrizione] = useState(task?.descrizione ?? "");
  const [esecutoreId, setEsecutoreId] = useState<string>(task?.esecutore_id ?? NESSUNO);
  const [areaId, setAreaId] = useState<string>(task?.area_id ?? NESSUNO);
  const [scadenza, setScadenza] = useState<string>(
    task?.scadenza ? format(new Date(task.scadenza), "yyyy-MM-dd") : "",
  );

  const salva = useMutation({
    mutationFn: async () => {
      const payload = {
        titolo: titolo.trim(),
        descrizione: descrizione.trim() || null,
        esecutore_id: esecutoreId === NESSUNO ? null : esecutoreId,
        area_id: areaId === NESSUNO ? null : areaId,
        scadenza: scadenza ? new Date(`${scadenza}T00:00:00`).toISOString() : null,
      };
      if (task) {
        const { error } = await supabase.from("task").update(payload).eq("id", task.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("task").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(task ? "Task aggiornato" : "Task creato");
      qc.invalidateQueries({ queryKey: ["task"] });
      onClose();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "";
      if (/row-level security|policy|permission/i.test(msg)) {
        toast.error("Non hai i permessi per modificare questo task");
      } else {
        toast.error(msg || "Errore nel salvataggio");
      }
    },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Modifica task" : "Nuovo task"}</DialogTitle>
          <DialogDescription>
            Definisci cosa va fatto, a chi è assegnato ed entro quando.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {task && (
            <div className="text-sm text-muted-foreground">
              Titolare: <span className="font-medium text-foreground">{titolareLabel}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="task-titolo">Titolo</Label>
            <Input
              id="task-titolo"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Es. Richiamare il cliente per il saldo"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-descrizione">Descrizione</Label>
            <Textarea
              id="task-descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={3}
              placeholder="Dettagli opzionali"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Esecutore</Label>
            <Select value={esecutoreId} onValueChange={setEsecutoreId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNO}>— Non assegnato —</SelectItem>
                {profili.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {[p.nome, p.cognome].filter(Boolean).join(" ") || p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Area</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNO}>— Nessuna —</SelectItem>
                {aree.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-scadenza">Scadenza</Label>
            <Input
              id="task-scadenza"
              type="date"
              value={scadenza}
              onChange={(e) => setScadenza(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => salva.mutate()} disabled={!titolo.trim() || salva.isPending}>
            {salva.isPending ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
