import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, FileText, Pencil, Ban, Send, History, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getFidoAttuale } from "@/lib/fido-cliente";
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
import { useConfig } from "@/hooks/use-config";
import { useAuth } from "@/hooks/use-auth";

const STATI_IN_CORSO: StatoRichiesta[] = ["bozza", "in_approvazione", "in_attesa_liv1", "in_attesa_liv2", "in_attesa_liv3", "integrazioni_richieste"];
const STATI_MODIFICABILI: StatoRichiesta[] = ["bozza", "integrazioni_richieste"];
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
  const { hasRole } = useAuth();
  const isAgente = hasRole("agente");

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

  const { data: cliente } = useQuery({
    queryKey: ["cliente-gestionale", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("fido_gestionale, ind_blocco, assicurazione_attiva, ultima_data_fatturazione, cliente_attivo, totale_rischio, scaduto, fido_residuo")
        .eq("id", clienteId)
        .maybeSingle();
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
      <FidoGestionaleCard cliente={cliente ?? null} />

      {/* SEZIONE 1: Richieste in corso */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Richieste in corso</h3>
          {inCorso.length > 0 && !isAgente && (
            <Button size="sm" className="gap-1.5" onClick={() => setOpenNew(true)}>
              <Plus className="size-4" /> Nuova richiesta fido
            </Button>
          )}
        </div>

        {inCorso.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="size-8 mx-auto text-muted-foreground mb-2" />
            <p className="font-medium text-sm">Nessuna richiesta in corso</p>
            {!isAgente && (
              <Button size="sm" className="gap-1.5 mt-3" onClick={() => setOpenNew(true)}>
                <Plus className="size-4" /> Nuova richiesta fido
              </Button>
            )}
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
                  {STATI_MODIFICABILI.includes(r.stato as StatoRichiesta) && !isAgente && (
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
          clienteData={cliente}
          ultimoApprovatoImp={(() => {
            const r = (richieste ?? []).find(
              (x) => x.stato === "approvata" && x.importo_approvato != null,
            );
            return r ? Number(r.importo_approvato) : null;
          })()}
          onClose={() => setOpenNew(false)}
          onSaved={invalidate}
        />
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <RichiestaDialog
            clienteId={clienteId}
            clienteData={cliente}
            ultimoApprovatoImp={(() => {
              const r = (richieste ?? []).find(
                (x) => x.stato === "approvata" && x.importo_approvato != null,
              );
              return r ? Number(r.importo_approvato) : null;
            })()}
            richiesta={editing}
            onClose={() => setEditing(null)}
            onSaved={invalidate}
          />
        )}
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <RichiestaDialog
            clienteId={clienteId}
            clienteData={cliente}
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
  clienteId, richiesta, onClose, onSaved, clienteData, ultimoApprovatoImp,
}: {
  clienteId: string;
  richiesta?: any;
  onClose: () => void;
  onSaved: () => void;
  clienteData?: any;
  ultimoApprovatoImp?: number | null;
}) {
  const config = useConfig();
  const fidoAttuale = getFidoAttuale(clienteData);
  const totaleRischio = Number(clienteData?.totale_rischio ?? 0);
  const scaduto = Number(clienteData?.scaduto ?? 0);
  const fidoResiduo = clienteData?.fido_residuo != null
    ? Number(clienteData.fido_residuo) : null;

  const fidoProposto = totaleRischio > 0
    ? Math.ceil(totaleRischio / 500) * 500
    : fidoAttuale > 0 ? fidoAttuale : 0;

  function determinaTipo(attuale: number, proposto: number): RichiestaForm["tipo"] {
    if (!attuale || attuale === 0) return "nuovo_fido";
    if (proposto > attuale) return "aumento";
    if (proposto < attuale) return "diminuzione";
    return "rinnovo";
  }

  const isEdit = !!richiesta;
  const [form, setForm] = useState<RichiestaForm>({
    tipo: (richiesta?.tipo === "nuovo" ? "nuovo_fido" : richiesta?.tipo)
      ?? determinaTipo(fidoAttuale, fidoProposto),
    importo_richiesto: richiesta?.importo_richiesto ?? fidoProposto,
    durata_mesi: richiesta?.durata_mesi ?? config.durata_default_mesi,
    motivazione: richiesta?.motivazione ?? "",
    note: richiesta?.note ?? "",
  });

  function handleImportoChange(v: number) {
    const tipoAuto = determinaTipo(fidoAttuale, v);
    setForm(f => ({ ...f, importo_richiesto: v, tipo: tipoAuto }));
  }
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
        {clienteData && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Situazione attuale
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Fido gestionale</p>
                <p className="font-semibold tabular-nums">{formatEuro(fidoAttuale)}</p>
                {ultimoApprovatoImp != null && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                    Ultimo approv. in app: <span className="font-medium tabular-nums">{formatEuro(ultimoApprovatoImp)}</span>
                    {Math.abs(ultimoApprovatoImp - fidoAttuale) > 0.01 && (
                      <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-warning/15 text-warning border border-warning/30">Da allineare</span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Totale rischio</p>
                <p className={`font-semibold tabular-nums ${totaleRischio > fidoAttuale ? "text-destructive" : ""}`}>
                  {formatEuro(totaleRischio)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fido residuo</p>
                <p className="font-semibold tabular-nums">
                  {fidoResiduo != null ? formatEuro(fidoResiduo) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Scaduto</p>
                <p className={`font-semibold tabular-nums ${scaduto > 0 ? "text-destructive" : ""}`}>
                  {formatEuro(scaduto)}
                </p>
              </div>
            </div>
            {!isEdit && fidoProposto > 0 && (
              <p className="text-xs text-primary pt-1 border-t">
                💡 Importo proposto: <strong>{formatEuro(fidoProposto)}</strong>{" "}
                (copre il totale rischio attuale)
              </p>
            )}
          </div>
        )}
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
          <p className="text-xs text-muted-foreground">
            Determinato automaticamente in base al fido attuale e all'importo richiesto.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Importo richiesto (€) *</Label>
              {!isEdit && fidoProposto > 0 && fidoProposto !== form.importo_richiesto && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => handleImportoChange(fidoProposto)}
                >
                  Usa proposta ({formatEuro(fidoProposto)})
                </button>
              )}
            </div>
            <Input type="number" step="0.01" min="0"
              value={form.importo_richiesto || ""}
              onChange={(e) => handleImportoChange(Number(e.target.value))} />
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
        {(!isEdit || STATI_MODIFICABILI.includes(richiesta?.stato as StatoRichiesta)) && (
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

type ClienteGestionale = {
  fido_gestionale: number | null;
  ind_blocco: number | null;
  assicurazione_attiva: boolean | null;
  ultima_data_fatturazione: string | null;
  cliente_attivo: boolean | null;
} | null;

function FidoGestionaleCard({ cliente }: { cliente: ClienteGestionale }) {
  const fmtEuro = (n: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const fmtDate = (d: string) => {
    const [y, m, day] = d.slice(0, 10).split("-");
    return `${day}/${m}/${y}`;
  };

  const allNull =
    !cliente ||
    (cliente.fido_gestionale == null &&
      cliente.ind_blocco == null &&
      cliente.assicurazione_attiva == null &&
      cliente.ultima_data_fatturazione == null &&
      cliente.cliente_attivo == null);

  const fidoLabel =
    cliente?.fido_gestionale && Number(cliente.fido_gestionale) > 0
      ? fmtEuro(Number(cliente.fido_gestionale))
      : "Non assegnato";

  const ind = Number(cliente?.ind_blocco ?? 0);
  const bloccoBadge =
    ind === 2 ? (
      <Badge className="bg-red-500 text-white hover:bg-red-500">Bloccato</Badge>
    ) : ind === 1 ? (
      <Badge className="bg-orange-500 text-white hover:bg-orange-500">Bloccato revocabile</Badge>
    ) : (
      <Badge className="bg-green-600 text-white hover:bg-green-600">Non bloccato</Badge>
    );

  const assBadge = cliente?.assicurazione_attiva ? (
    <Badge className="bg-green-600 text-white hover:bg-green-600">POUEY attiva</Badge>
  ) : (
    <Badge variant="secondary">Non assicurato</Badge>
  );

  const attivoBadge = cliente?.cliente_attivo ? (
    <Badge className="bg-green-600 text-white hover:bg-green-600">Cliente attivo</Badge>
  ) : (
    <Badge variant="secondary">Non attivo</Badge>
  );

  return (
    <Card className="p-5 bg-blue-50/40 border-blue-100">
      <div className="flex items-center gap-2 mb-4">
        <Wallet className="size-4 text-blue-700" />
        <h3 className="font-semibold text-base">Fido Gestionale</h3>
      </div>

      {allNull ? (
        <p className="text-sm text-muted-foreground">Dati gestionali non disponibili</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Fido concesso</p>
              <p className="text-lg font-bold tabular-nums">{fidoLabel}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Blocco fido</p>
              <div>{bloccoBadge}</div>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Assicurazione</p>
              <div>{assBadge}</div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-blue-100 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            <span>
              Ultima fatturazione:{" "}
              <strong className="text-foreground">
                {cliente?.ultima_data_fatturazione
                  ? fmtDate(cliente.ultima_data_fatturazione)
                  : "Nessuna fatturazione registrata"}
              </strong>
            </span>
            <span className="hidden sm:inline">•</span>
            {attivoBadge}
          </div>
        </>
      )}
    </Card>
  );
}
