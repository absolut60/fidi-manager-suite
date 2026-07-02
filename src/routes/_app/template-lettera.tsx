import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useConfig } from "@/hooks/use-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PLACEHOLDERS_LETTERA,
  renderLettera,
  caricaDatiClienteLettera,
  type TemplateLettera,
} from "@/lib/template-lettera";

export const Route = createFileRoute("/_app/template-lettera")({
  component: TemplateLetteraPage,
});

const TIPI: { value: string; label: string }[] = [
  { value: "sollecito_cartaceo", label: "Sollecito cartaceo" },
  { value: "messa_in_mora_cartacea", label: "Messa in mora cartacea" },
  { value: "comunicazione", label: "Comunicazione" },
  { value: "libero", label: "Libero" },
];

function TipoLabel({ tipo }: { tipo: string }) {
  const found = TIPI.find((t) => t.value === tipo);
  return <Badge variant="secondary">{found?.label ?? tipo}</Badge>;
}

function TemplateLetteraPage() {
  const { roles, loading } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateLettera | null>(null);
  const [deleting, setDeleting] = useState<TemplateLettera | null>(null);

  const canManage =
    roles.includes("amministratore") ||
    roles.includes("amministrazione") ||
    roles.includes("direzione");

  const { data: templates, isLoading } = useQuery({
    queryKey: ["template_lettera"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_lettera")
        .select("id, nome, oggetto, corpo, tipo, usa_dati_automatici, attivo")
        .order("nome");
      if (error) throw error;
      return data as TemplateLettera[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("template_lettera").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template eliminato");
      qc.invalidateQueries({ queryKey: ["template_lettera"] });
      setDeleting(null);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore eliminazione"),
  });

  if (!loading && !canManage) {
    return <Card className="p-8 text-center"><p className="font-medium">Accesso riservato</p></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Template Lettere</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Modelli per le lettere cartacee (sollecito, messa in mora, comunicazioni)
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="gap-1.5">
          <Plus className="size-4" /> Nuovo template
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !templates?.length ? (
          <div className="p-12 text-center text-muted-foreground">
            <FileText className="size-10 mx-auto mb-3 opacity-40" />
            <p>Nessun template configurato.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Oggetto</TableHead>
                <TableHead className="w-32">Dati auto</TableHead>
                <TableHead className="w-24">Attivo</TableHead>
                <TableHead className="w-32 text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell><TipoLabel tipo={t.tipo} /></TableCell>
                  <TableCell className="text-muted-foreground text-sm truncate max-w-md">{t.oggetto ?? "—"}</TableCell>
                  <TableCell>
                    {t.usa_dati_automatici ? <Badge variant="outline">Auto</Badge> : <Badge variant="outline">Libero</Badge>}
                  </TableCell>
                  <TableCell>
                    {t.attivo ? <Badge>Attivo</Badge> : <Badge variant="outline">Disattivo</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(t)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {open && (
        <TemplateDialog
          key={editing?.id ?? "new"}
          editing={editing}
          onClose={() => setOpen(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["template_lettera"] }); setOpen(false); }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il template?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare &laquo;{deleting?.nome}&raquo;. L&apos;operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMutation.mutate(deleting.id)}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateDialog({
  editing, onClose, onSaved,
}: { editing: TemplateLettera | null; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [tipo, setTipo] = useState(editing?.tipo ?? "sollecito_cartaceo");
  const [oggetto, setOggetto] = useState(editing?.oggetto ?? "");
  const [corpo, setCorpo] = useState(editing?.corpo ?? "");
  const [usaDatiAutomatici, setUsaDatiAutomatici] = useState(editing?.usa_dati_automatici ?? true);
  const [attivo, setAttivo] = useState(editing?.attivo ?? true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const oggettoRef = useRef<HTMLInputElement>(null);
  const corpoRef = useRef<HTMLTextAreaElement>(null);
  const [focusedField, setFocusedField] = useState<"oggetto" | "corpo">("corpo");

  function insertPlaceholder(ph: string, soloCorpo?: boolean) {
    const target = soloCorpo || focusedField === "corpo" ? "corpo" : "oggetto";
    if (target === "oggetto") {
      const el = oggettoRef.current; if (!el) return;
      const start = el.selectionStart ?? oggetto.length;
      const end = el.selectionEnd ?? oggetto.length;
      const next = oggetto.slice(0, start) + ph + oggetto.slice(end);
      setOggetto(next);
      setTimeout(() => { el.focus(); el.setSelectionRange(start + ph.length, start + ph.length); }, 0);
    } else {
      const el = corpoRef.current; if (!el) return;
      const start = el.selectionStart ?? corpo.length;
      const end = el.selectionEnd ?? corpo.length;
      const next = corpo.slice(0, start) + ph + corpo.slice(end);
      setCorpo(next);
      setTimeout(() => { el.focus(); el.setSelectionRange(start + ph.length, start + ph.length); }, 0);
    }
  }

  async function handleSave() {
    if (!nome.trim() || !corpo.trim()) {
      toast.error("Compila almeno nome e corpo");
      return;
    }
    setSaving(true);
    const payload = {
      nome: nome.trim(),
      tipo,
      oggetto: oggetto.trim() || null,
      corpo,
      usa_dati_automatici: usaDatiAutomatici,
      attivo,
    };
    const { error } = editing
      ? await supabase.from("template_lettera").update(payload).eq("id", editing.id)
      : await supabase.from("template_lettera").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Template aggiornato" : "Template creato");
    onSaved();
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica template lettera" : "Nuovo template lettera"}</DialogTitle>
            <DialogDescription>
              Lettera cartacea: il corpo è testo semplice (no HTML). La generazione del PDF arriverà nella fase 2.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="es. Sollecito cartaceo" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPI.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Oggetto / Riferimento</Label>
              <Input
                ref={oggettoRef}
                value={oggetto}
                onChange={(e) => setOggetto(e.target.value)}
                onFocus={() => setFocusedField("oggetto")}
                placeholder="es. Oggetto: sollecito di pagamento"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Corpo (testo)</Label>
              <Textarea
                ref={corpoRef}
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                onFocus={() => setFocusedField("corpo")}
                rows={18}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Placeholder disponibili</Label>
              <div className="flex flex-wrap gap-2">
                {PLACEHOLDERS_LETTERA.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => insertPlaceholder(p.label, p.soloCorpo)}
                    className="inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground hover:bg-accent/80 transition px-3 py-1 text-xs font-mono"
                    title={p.descr + (p.soloCorpo ? " (solo corpo)" : "")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Clic su un placeholder per inserirlo nel campo attivo. {`{{elenco_scadenze}}`} è disponibile solo nel corpo.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={usaDatiAutomatici}
                  onCheckedChange={setUsaDatiAutomatici}
                  id="usa_dati_automatici"
                />
                <Label htmlFor="usa_dati_automatici" className="cursor-pointer">
                  Popola dati automaticamente (scaduto, scadenze)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={attivo} onCheckedChange={setAttivo} id="attivo" />
                <Label htmlFor="attivo" className="cursor-pointer">Attivo</Label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-1.5">
              <Eye className="size-4" /> Anteprima testo
            </Button>
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvataggio..." : "Salva"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewOpen && (
        <PreviewDialog
          template={{ oggetto, corpo }}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

function PreviewDialog({
  template, onClose,
}: { template: { oggetto: string; corpo: string }; onClose: () => void }) {
  const { profilo } = useAuth();
  const nomeOperatore = `${profilo?.nome ?? ""} ${profilo?.cognome ?? ""}`.trim() || "Operatore";

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: clienti } = useQuery({
    queryKey: ["clienti-search-lettera", search],
    queryFn: async () => {
      let q = supabase.from("clienti").select("id, ragione_sociale").order("ragione_sociale").limit(20);
      if (search.trim()) q = q.ilike("ragione_sociale", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data as { id: string; ragione_sociale: string }[];
    },
  });

  const { data: dati, isFetching } = useQuery({
    queryKey: ["template-lettera-preview", selectedId],
    queryFn: () => caricaDatiClienteLettera(selectedId!, nomeOperatore),
    enabled: !!selectedId,
  });

  const rendered = useMemo(() => {
    if (!dati) return null;
    return renderLettera({ oggetto: template.oggetto, corpo: template.corpo }, dati);
  }, [template, dati]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anteprima lettera (testo)</DialogTitle>
          <DialogDescription>
            Seleziona un cliente per vedere il testo della lettera con i placeholder sostituiti. Il PDF arriverà nella fase 2.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Cerca cliente per ragione sociale..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-40 overflow-y-auto rounded border border-border divide-y divide-border">
            {(clienti ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition ${
                  selectedId === c.id ? "bg-accent font-medium" : ""
                }`}
              >
                {c.ragione_sociale}
              </button>
            ))}
            {!clienti?.length && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">Nessun cliente</div>
            )}
          </div>

          {selectedId && (
            <div className="space-y-3 pt-2 border-t border-border">
              {isFetching && <Skeleton className="h-32 w-full" />}
              {rendered && (
                <>
                  {rendered.oggetto && (
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Oggetto</Label>
                      <div className="mt-1 rounded border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                        {rendered.oggetto}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Corpo</Label>
                    <pre className="mt-1 rounded border border-border bg-background px-4 py-3 text-sm whitespace-pre-wrap font-sans leading-relaxed">
{rendered.corpo}
                    </pre>
                  </div>
                  {dati && (!dati.cliente.indirizzo || !dati.cliente.cap || !dati.cliente.citta) && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Attenzione: indirizzo cliente parziale o assente — verificare i dati anagrafici prima di stampare la lettera.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
