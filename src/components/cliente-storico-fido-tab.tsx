import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, FileText, Pencil, Ban, Send, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  STATO_LABEL, STATO_TONE, TIPO_LABEL, TIPO_TONE, formatEuro, formatDate,
  type TipoRichiesta, type StatoRichiesta,
} from "@/lib/fidi";

const STATI_IN_CORSO: StatoRichiesta[] = ["bozza", "in_approvazione"];
const STATI_STORICO: StatoRichiesta[] = ["approvata", "rifiutata", "annullata"];

const richiestaSchema = z.object({
  tipo: z.enum(["nuovo_fido", "aumento", "diminuzione", "rinnovo"]),
  importo_richiesto: z.coerce.number().positive("Importo > 0").max(99999999),
  durata_mesi: z.coerce.number().int().min(1).max(120).default(12),
  motivazione: z.string().trim().max(1000).optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});
type RichiestaForm = z.infer<typeof richiestaSchema>;

export function ClienteStoricoFidoTab({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: richieste, isLoading } = useQuery({
    queryKey: ["richieste-cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_fido")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["richieste-cliente", clienteId] });

  const annullaMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("richieste_fido")
        .update({ stato: "annullata", data_chiusura: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Richiesta annullata"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviaMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("richieste_fido")
        .update({ stato: "in_approvazione", data_invio: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Richiesta inviata in approvazione"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const inCorso = (richieste ?? []).filter((r) => STATI_IN_CORSO.includes(r.stato as StatoRichiesta));
  const storico = (richieste ?? []).filter((r) => STATI_STORICO.includes(r.stato as StatoRichiesta));

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* SEZIONE 1: Richieste in corso */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Richieste in corso</h3>
          {inCorso.length > 0 && (
            <Button size="sm" className="gap-1.5" onClick={() => setOpenNew(true)}>
              <Plus className="size-4" /> Nuova richiesta fido
            </Button>
          )}
        </div>

        {inCorso.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="size-8 mx-auto text-muted-foreground mb-2" />
            <p className="font-medium text-sm">Nessuna richiesta in corso</p>
            <Button size="sm" className="gap-1.5 mt-3" onClick={() => setOpenNew(true)}>
              <Plus className="size-4" /> Nuova richiesta fido
            </Button>
          </Card>
        ) : (
          <div className="space-y-2">
            {inCorso.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>
                        {TIPO_LABEL[r.tipo as TipoRichiesta]}
                      </span>
                      <span className="text-lg font-bold tabular-nums">{formatEuro(Number(r.importo_richiesto))}</span>
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.stato as StatoRichiesta]}`}>
                        {STATO_LABEL[r.stato as StatoRichiesta]}
                      </span>
                      <Badge variant="outline">Liv. {r.livello_corrente}/{r.livello_richiesto}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Creata il {formatDate(r.created_at)}
                      {r.data_invio && ` • Inviata il ${formatDate(r.data_invio)}`}
                    </p>
                    {r.motivazione && <p className="text-sm text-muted-foreground">{r.motivazione}</p>}
                  </div>
                  {r.stato === "bozza" && (
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(r)}>
                        <Pencil className="size-3.5" /> Modifica
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => inviaMut.mutate(r.id)} disabled={inviaMut.isPending}>
                        <Send className="size-3.5" /> Invia
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => annullaMut.mutate(r.id)} disabled={annullaMut.isPending}>
                        <Ban className="size-3.5" /> Annulla
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* SEZIONE 2: Storico approvazioni */}
      <section className="space-y-3">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <History className="size-4" /> Storico approvazioni
        </h3>
        {storico.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nessuna richiesta archiviata.
          </Card>
        ) : (
          <div className="space-y-2">
            {storico.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>
                        {TIPO_LABEL[r.tipo as TipoRichiesta]}
                      </span>
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.stato as StatoRichiesta]}`}>
                        {STATO_LABEL[r.stato as StatoRichiesta]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span>Richiesto: <strong className="tabular-nums">{formatEuro(Number(r.importo_richiesto))}</strong></span>
                      {r.importo_approvato != null && (
                        <span>Approvato: <strong className="tabular-nums text-success">{formatEuro(Number(r.importo_approvato))}</strong></span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(r.data_chiusura ?? r.created_at)}
                    </p>
                    {r.note && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.note}</p>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <RichiestaDialog
          clienteId={clienteId}
          onClose={() => setOpenNew(false)}
          onSaved={invalidate}
        />
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <RichiestaDialog
            clienteId={clienteId}
            richiesta={editing}
            onClose={() => setEditing(null)}
            onSaved={invalidate}
          />
        )}
      </Dialog>
    </div>
  );
}

function RichiestaDialog({
  clienteId, richiesta, onClose, onSaved,
}: {
  clienteId: string;
  richiesta?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!richiesta;
  const [form, setForm] = useState<RichiestaForm>({
    tipo: (richiesta?.tipo === "nuovo" ? "nuovo_fido" : richiesta?.tipo) ?? "nuovo_fido",
    importo_richiesto: richiesta?.importo_richiesto ?? 0,
    durata_mesi: richiesta?.durata_mesi ?? 12,
    motivazione: richiesta?.motivazione ?? "",
    note: richiesta?.note ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async (invia: boolean) => {
      const parsed = richiestaSchema.parse(form);
      const { data: { user } } = await supabase.auth.getUser();
      if (isEdit) {
        const { error } = await supabase
          .from("richieste_fido")
          .update({
            tipo: parsed.tipo,
            importo_richiesto: parsed.importo_richiesto,
            durata_mesi: parsed.durata_mesi,
            motivazione: parsed.motivazione || null,
            note: parsed.note || null,
            ...(invia ? { stato: "in_approvazione", data_invio: new Date().toISOString() } : {}),
          })
          .eq("id", richiesta.id);
        if (error) throw error;
      } else {
        const { data: cli } = await supabase.from("clienti").select("store_id").eq("id", clienteId).maybeSingle();
        const { error } = await supabase.from("richieste_fido").insert({
          cliente_id: clienteId,
          tipo: parsed.tipo,
          store_id: cli?.store_id ?? null,
          importo_richiesto: parsed.importo_richiesto,
          durata_mesi: parsed.durata_mesi,
          motivazione: parsed.motivazione || null,
          note: parsed.note || null,
          created_by: user?.id,
          stato: invia ? "in_approvazione" : "bozza",
          data_invio: invia ? new Date().toISOString() : null,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, invia) => {
      toast.success(invia ? "Richiesta inviata" : "Salvata come bozza");
      onSaved(); onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(invia: boolean) {
    const r = richiestaSchema.safeParse(form);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    save.mutate(invia);
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Modifica richiesta fido" : "Nuova richiesta fido"}</DialogTitle>
        <DialogDescription>Compila i dati della richiesta.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Tipo richiesta *</Label>
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Importo richiesto (€) *</Label>
            <Input type="number" step="0.01" min="0"
              value={form.importo_richiesto || ""}
              onChange={(e) => setForm({ ...form, importo_richiesto: Number(e.target.value) })} />
            {errors.importo_richiesto && <p className="text-xs text-destructive">{errors.importo_richiesto}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Durata (mesi)</Label>
            <Input type="number" min="1" max="120"
              value={form.durata_mesi}
              onChange={(e) => setForm({ ...form, durata_mesi: Number(e.target.value) })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Motivazione</Label>
          <Textarea rows={2} value={form.motivazione}
            onChange={(e) => setForm({ ...form, motivazione: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Note</Label>
          <Textarea rows={2} value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
        {(!isEdit || richiesta?.stato === "bozza") && (
          <>
            <Button type="button" variant="secondary" disabled={save.isPending}
              onClick={() => handleSubmit(false)}>
              Salva come bozza
            </Button>
            <Button type="button" disabled={save.isPending}
              onClick={() => handleSubmit(true)}>
              Invia subito
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
