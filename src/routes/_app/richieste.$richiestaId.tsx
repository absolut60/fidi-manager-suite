import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, X, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { STATO_LABEL, STATO_TONE, TIPO_LABEL, TIPO_TONE, LIVELLO_LABEL, formatEuro, formatDate, type TipoRichiesta } from "@/lib/fidi";

export const Route = createFileRoute("/_app/richieste/$richiestaId")({
  component: RichiestaDetail,
});

function RichiestaDetail() {
  const { richiestaId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, role } = useAuth();

  const { data: r, isLoading } = useQuery({
    queryKey: ["richiesta", richiestaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_fido")
        .select("*, clienti(id, ragione_sociale, partita_iva), stores(nome, codice)")
        .eq("id", richiestaId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: approvazioni } = useQuery({
    queryKey: ["approvazioni", richiestaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approvazioni")
        .select("*, profili:approvatore_id(nome, cognome, email)")
        .eq("richiesta_id", richiestaId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const isAdmin = role === "amministratore";
  const livelloUtente =
    role === "approvatore_liv3" ? 3 :
    role === "approvatore_liv2" ? 2 :
    role === "approvatore_liv1" ? 1 : 0;

  const canApprove = r?.stato === "in_approvazione" &&
    (isAdmin || livelloUtente === r.livello_corrente);
  const canSubmit = r?.stato === "bozza" && r?.created_by === user?.id;
  const canDelete = isAdmin;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("richieste_fido")
        .update({ stato: "in_approvazione" })
        .eq("id", richiestaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Richiesta inviata in approvazione");
      qc.invalidateQueries({ queryKey: ["richiesta", richiestaId] });
      qc.invalidateQueries({ queryKey: ["richieste"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("richieste_fido").delete().eq("id", richiestaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Richiesta eliminata");
      navigate({ to: "/richieste" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  if (!r) return <div className="text-center py-12"><p>Richiesta non trovata</p><Link to="/richieste" className="text-primary text-sm">← Torna alla lista</Link></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/richieste"><ArrowLeft className="size-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold">{(r as any).clienti?.ragione_sociale}</h1>
          <p className="text-xs text-muted-foreground">
            Richiesta del {formatDate(r.created_at)} · {(r as any).clienti?.partita_iva || "P.IVA non specificata"}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium ${STATO_TONE[r.stato]}`}>
          {STATO_LABEL[r.stato]}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2 space-y-4">
          <h2 className="font-semibold">Dettagli</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <Info label="Importo richiesto" value={formatEuro(Number(r.importo_richiesto))} />
            <Info label="Importo approvato" value={r.importo_approvato ? formatEuro(Number(r.importo_approvato)) : "—"} />
            <Info label="Durata" value={`${r.durata_mesi} mesi`} />
            <Info label="Punto vendita" value={(r as any).stores?.nome ?? "—"} />
            <Info label="Livello richiesto" value={LIVELLO_LABEL[r.livello_richiesto]} />
            <Info label="Livello corrente" value={`Liv. ${r.livello_corrente}`} />
            <Info label="Inviata il" value={formatDate(r.data_invio)} />
            <Info label="Chiusa il" value={formatDate(r.data_chiusura)} />
          </div>
          {r.motivazione && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Motivazione</p>
                <p className="text-sm whitespace-pre-wrap">{r.motivazione}</p>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            {canSubmit && (
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="gap-1.5">
                <Send className="size-4" /> Invia in approvazione
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => { if (confirm("Eliminare definitivamente questa richiesta?")) deleteMutation.mutate(); }}
              >
                <Trash2 className="size-4" /> Elimina
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Workflow</h2>
          {[1, 2, 3].slice(0, r.livello_richiesto).map((liv) => {
            const done = approvazioni?.find((a) => a.livello === liv);
            const isCurrent = r.stato === "in_approvazione" && r.livello_corrente === liv;
            return (
              <div key={liv} className="flex items-start gap-3">
                <div className={`size-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  done?.esito === "approvata" ? "bg-success/15 text-success" :
                  done?.esito === "rifiutata" ? "bg-destructive/15 text-destructive" :
                  isCurrent ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"
                }`}>
                  {done?.esito === "approvata" ? <Check className="size-3.5" /> :
                   done?.esito === "rifiutata" ? <X className="size-3.5" /> : liv}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Livello {liv}</p>
                  {done ? (
                    <p className="text-xs text-muted-foreground">
                      {done.esito === "approvata" ? "Approvato" : "Rifiutato"} da {(done as any).profili?.nome ?? "—"} {(done as any).profili?.cognome ?? ""} il {formatDate(done.created_at)}
                    </p>
                  ) : isCurrent ? (
                    <p className="text-xs text-info">In attesa di decisione</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Da svolgere</p>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {canApprove && <ApprovaForm richiesta={r} userId={user!.id} />}

      {approvazioni && approvazioni.length > 0 && (
        <Card className="p-5">
          <h2 className="font-semibold mb-3">Storico decisioni</h2>
          <div className="space-y-3">
            {approvazioni.map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm border-l-2 pl-3"
                style={{ borderColor: a.esito === "approvata" ? "var(--success)" : "var(--destructive)" }}>
                <div className="flex-1">
                  <p>
                    <strong>Liv. {a.livello}</strong> — {a.esito === "approvata" ? "Approvata" : "Rifiutata"}
                    {a.importo_approvato && ` · ${formatEuro(Number(a.importo_approvato))}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(a as any).profili?.nome ?? ""} {(a as any).profili?.cognome ?? ""} · {formatDate(a.created_at)}
                  </p>
                  {a.note && <p className="text-xs mt-1">{a.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-medium mt-0.5">{value}</p>
    </div>
  );
}

function ApprovaForm({ richiesta, userId }: { richiesta: any; userId: string }) {
  const qc = useQueryClient();
  const [importo, setImporto] = useState<string>(String(richiesta.importo_richiesto));
  const [note, setNote] = useState("");

  const decide = useMutation({
    mutationFn: async (esito: "approvata" | "rifiutata") => {
      const importoNum = Number(importo);
      const { error: e1 } = await supabase.from("approvazioni").insert({
        richiesta_id: richiesta.id,
        approvatore_id: userId,
        livello: richiesta.livello_corrente,
        esito,
        importo_approvato: esito === "approvata" ? importoNum : null,
        note: note || null,
      });
      if (e1) throw e1;

      // Aggiorna richiesta
      if (esito === "rifiutata") {
        const { error } = await supabase.from("richieste_fido")
          .update({ stato: "rifiutata" })
          .eq("id", richiesta.id);
        if (error) throw error;
      } else {
        const nextLiv = richiesta.livello_corrente + 1;
        if (nextLiv > richiesta.livello_richiesto) {
          const { error } = await supabase.from("richieste_fido")
            .update({ stato: "approvata", importo_approvato: importoNum })
            .eq("id", richiesta.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("richieste_fido")
            .update({ livello_corrente: nextLiv })
            .eq("id", richiesta.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: (_d, esito) => {
      toast.success(esito === "approvata" ? "Approvazione registrata" : "Richiesta rifiutata");
      qc.invalidateQueries({ queryKey: ["richiesta", richiesta.id] });
      qc.invalidateQueries({ queryKey: ["approvazioni", richiesta.id] });
      qc.invalidateQueries({ queryKey: ["richieste"] });
      qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-5 border-info/40 bg-info/5">
      <h2 className="font-semibold mb-3">Decisione livello {richiesta.livello_corrente}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="importo_app">Importo da approvare (€)</Label>
          <Input
            id="importo_app"
            type="number"
            step="0.01"
            value={importo}
            onChange={(e) => setImporto(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note_app">Note</Label>
          <Textarea
            id="note_app"
            rows={1}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivazione (opzionale)"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <Button
          onClick={() => decide.mutate("approvata")}
          disabled={decide.isPending}
          className="gap-1.5 bg-success text-success-foreground hover:bg-success/90"
        >
          <Check className="size-4" /> Approva
        </Button>
        <Button
          variant="outline"
          onClick={() => decide.mutate("rifiutata")}
          disabled={decide.isPending}
          className="gap-1.5 text-destructive hover:text-destructive border-destructive/30"
        >
          <X className="size-4" /> Rifiuta
        </Button>
      </div>
    </Card>
  );
}
