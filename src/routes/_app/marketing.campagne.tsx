import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Pencil, Trash2, Copy, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AllegatiSection } from "@/components/allegati-section";
import { renderTemplate, wrapEmailHtml } from "@/lib/template-email-render";

export const Route = createFileRoute("/_app/marketing/campagne")({
  component: MarketingCampagnePage,
});

const MARKETING_ROLES = new Set(["amministratore", "amministrazione", "direzione"]);

type Campagna = {
  id: string;
  nome: string;
  oggetto: string;
  corpo_html: string;
  stato: string;
  created_at: string;
  updated_at: string;
};

// Placeholder disponibili per le campagne marketing. {{ragione_sociale}} è
// gestito dal motore condiviso (renderTemplate); gli altri sono campi cliente
// sostituiti prima di passare dal motore.
const PLACEHOLDER_MARKETING: { key: string; descr: string; esempio: string }[] = [
  { key: "ragione_sociale", descr: "Denominazione del cliente", esempio: "Cliente di Esempio S.r.l." },
  { key: "citta", descr: "Città del cliente", esempio: "Milano" },
  { key: "agente", descr: "Agente assegnato al cliente", esempio: "Mario Rossi" },
  { key: "categoria", descr: "Categoria merceologica del cliente", esempio: "Edilizia" },
];

function statoBadge(stato: string) {
  return stato === "pronta"
    ? <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Pronta</Badge>
    : <Badge variant="secondary">Bozza</Badge>;
}

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString("it-IT"); } catch { return s; }
}

/** Anteprima: stessa pipeline dell'invio reale (renderTemplate + wrapEmailHtml). */
function buildAnteprima(oggetto: string, corpo: string): { oggetto: string; html: string } {
  const sostituisci = (t: string) =>
    PLACEHOLDER_MARKETING.filter((p) => p.key !== "ragione_sociale").reduce(
      (acc, p) => acc.replace(new RegExp(`\\{\\{\\s*${p.key}\\s*\\}\\}`, "gi"), p.esempio),
      t ?? "",
    );
  const reso = renderTemplate(
    { oggetto: sostituisci(oggetto), corpo: sostituisci(corpo) },
    { ragione_sociale: "Cliente di Esempio S.r.l.", scadenze: [], nome_operatore: "Ufficio Marketing" },
    { tipo: "libero" },
  );
  return {
    oggetto: reso.oggetto,
    html: wrapEmailHtml(
      reso.corpo,
      null,
      { nome: "Ufficio Marketing MADE" },
      { tipo: "libero", senzaBande: true, sottotitolo: "Comunicazione commerciale" },
    ),
  };
}

function MarketingCampagnePage() {
  const { roles, user, loading } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Campagna | null>(null);
  const [deleting, setDeleting] = useState<Campagna | null>(null);

  const canSee = useMemo(() => (roles as string[]).some((r) => MARKETING_ROLES.has(r)), [roles]);

  const { data: campagne, isLoading } = useQuery({
    queryKey: ["campagne_email_marketing"],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_email_marketing")
        .select("id, nome, oggetto, corpo_html, stato, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campagna[];
    },
  });

  const crea = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("campagne_email_marketing")
        .insert({
          nome: "Nuova campagna",
          oggetto: "",
          corpo_html: "<p>Gentile {{ragione_sociale}},</p>\n<p></p>",
          stato: "bozza",
          created_by: user?.id ?? null,
        })
        .select("id, nome, oggetto, corpo_html, stato, created_at, updated_at")
        .single();
      if (error) throw error;
      return data as Campagna;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["campagne_email_marketing"] });
      setEditing(c);
    },
    onError: (e: any) => toast.error(e.message ?? "Errore creazione campagna"),
  });

  const duplica = useMutation({
    mutationFn: async (c: Campagna) => {
      const { error } = await supabase.from("campagne_email_marketing").insert({
        nome: `${c.nome} (copia)`,
        oggetto: c.oggetto,
        corpo_html: c.corpo_html,
        stato: "bozza",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna duplicata");
      qc.invalidateQueries({ queryKey: ["campagne_email_marketing"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Errore duplicazione"),
  });

  const elimina = useMutation({
    mutationFn: async (c: Campagna) => {
      const { error } = await supabase.from("campagne_email_marketing").delete().eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna eliminata");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["campagne_email_marketing"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Errore eliminazione"),
  });

  if (loading) return <div className="p-6 text-muted-foreground">Caricamento...</div>;
  if (!canSee) return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Mail className="size-6" /> Campagne email
          </h1>
          <p className="text-sm text-muted-foreground">
            Componi, salva e visualizza in anteprima le email di campagna. In questa fase non è previsto alcun invio.
          </p>
        </div>
        <Button onClick={() => crea.mutate()} disabled={crea.isPending}>
          <Plus className="size-4 mr-2" /> Nuova campagna
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !campagne?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nessuna campagna salvata.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Oggetto</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Aggiornata</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campagne.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{c.oggetto || "—"}</TableCell>
                  <TableCell>{statoBadge(c.stato)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(c.updated_at)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(c)} title="Modifica">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => duplica.mutate(c)} title="Duplica">
                      <Copy className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(c)} title="Elimina">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {editing && (
        <EditorCampagna
          campagna={editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["campagne_email_marketing"] })}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la campagna?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleting?.nome}» verrà eliminata definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && elimina.mutate(deleting)}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditorCampagna({
  campagna, onClose, onSaved,
}: { campagna: Campagna; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(campagna.nome);
  const [oggetto, setOggetto] = useState(campagna.oggetto);
  const [corpo, setCorpo] = useState(campagna.corpo_html);
  const corpoRef = useRef<HTMLTextAreaElement | null>(null);

  const anteprima = useMemo(() => buildAnteprima(oggetto, corpo), [oggetto, corpo]);

  const salva = useMutation({
    mutationFn: async (stato: "bozza" | "pronta") => {
      if (!nome.trim()) throw new Error("Il nome campagna è obbligatorio");
      if (!oggetto.trim()) throw new Error("L'oggetto è obbligatorio");
      const { error } = await supabase
        .from("campagne_email_marketing")
        .update({ nome: nome.trim(), oggetto: oggetto.trim(), corpo_html: corpo, stato })
        .eq("id", campagna.id);
      if (error) throw error;
      return stato;
    },
    onSuccess: (stato) => {
      toast.success(stato === "pronta" ? "Campagna segnata come pronta" : "Campagna salvata");
      onSaved();
      if (stato === "pronta") onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Errore salvataggio"),
  });

  const insertPlaceholder = (key: string) => {
    const el = corpoRef.current;
    const token = `{{${key}}}`;
    if (!el) { setCorpo((c) => c + token); return; }
    const start = el.selectionStart ?? corpo.length;
    const end = el.selectionEnd ?? corpo.length;
    const next = corpo.slice(0, start) + token + corpo.slice(end);
    setCorpo(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editor campagna email</DialogTitle>
          <DialogDescription>
            Componi il messaggio e controlla l'anteprima. Nessun invio viene effettuato da questa schermata.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome campagna (interno)</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Promo primavera 2026" />
            </div>
            <div className="space-y-2">
              <Label>Oggetto email</Label>
              <Input value={oggetto} onChange={(e) => setOggetto(e.target.value)} placeholder="Oggetto visibile al cliente" />
            </div>
            <div className="space-y-2">
              <Label>Corpo email (HTML semplice)</Label>
              <Textarea
                ref={corpoRef}
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                rows={14}
                className="font-mono text-xs"
              />
            </div>

            <Card className="p-3 space-y-2">
              <div className="text-sm font-medium">Placeholder disponibili</div>
              <div className="space-y-1">
                {PLACEHOLDER_MARKETING.map((p) => (
                  <div key={p.key} className="flex items-center justify-between gap-3 text-xs">
                    <div>
                      <button
                        type="button"
                        className="font-mono text-primary hover:underline"
                        onClick={() => insertPlaceholder(p.key)}
                      >
                        {`{{${p.key}}}`}
                      </button>
                      <span className="text-muted-foreground"> — {p.descr}</span>
                    </div>
                    <span className="text-muted-foreground shrink-0">es. {p.esempio}</span>
                  </div>
                ))}
              </div>
            </Card>

            <AllegatiSection
              entitaTipo="campagna_email"
              entitaId={campagna.id}
              title="Allegati campagna (PDF, volantini)"
              compact
            />
          </div>

          <div className="space-y-2">
            <Label>Anteprima</Label>
            <div className="text-xs text-muted-foreground">
              Oggetto: <span className="font-medium text-foreground">{anteprima.oggetto || "—"}</span>
            </div>
            <iframe
              title="Anteprima campagna"
              srcDoc={anteprima.html}
              className="w-full h-[560px] rounded-md border bg-white"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
          <Button variant="secondary" onClick={() => salva.mutate("bozza")} disabled={salva.isPending}>
            <Save className="size-4 mr-2" /> Salva bozza
          </Button>
          <Button onClick={() => salva.mutate("pronta")} disabled={salva.isPending}>
            <CheckCircle2 className="size-4 mr-2" /> Segna come pronta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
