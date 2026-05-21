import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Check, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatEuro, formatDate, TIPO_LABEL, TIPO_TONE, type TipoRichiesta } from "@/lib/fidi";

export const Route = createFileRoute("/_app/approvazioni")({
  component: ApprovazioniPage,
});

function ApprovazioniPage() {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isAdmin = role === "amministratore";
  const livello =
    role === "approvatore_liv3" ? 3 :
    role === "approvatore_liv2" ? 2 :
    role === "approvatore_liv1" ? 1 : 0;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<"approva" | "rifiuta" | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["approvazioni-queue", role],
    queryFn: async () => {
      let q = supabase
        .from("richieste_fido")
        .select("*, clienti(ragione_sociale, partita_iva), stores(nome)")
        .eq("stato", "in_approvazione")
        .order("data_invio", { ascending: true });
      if (!isAdmin) q = q.eq("livello_corrente", livello);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: isAdmin || livello > 0,
  });

  const richieste = data ?? [];
  const allSelected = richieste.length > 0 && selected.size === richieste.length;

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(richieste.map((r) => r.id)));
  }

  const selectedRichieste = useMemo(
    () => richieste.filter((r) => selected.has(r.id)),
    [richieste, selected]
  );
  const totaleSelezionato = selectedRichieste.reduce((s, r) => s + Number(r.importo_richiesto), 0);

  const bulk = useMutation({
    mutationFn: async (esito: "approvata" | "rifiutata") => {
      if (!user) throw new Error("Utente non autenticato");
      for (const r of selectedRichieste) {
        const livDecisione = r.livello_corrente;
        const { error: e1 } = await supabase.from("approvazioni").insert({
          richiesta_id: r.id,
          approvatore_id: user.id,
          livello: livDecisione,
          esito,
          importo_approvato: esito === "approvata" ? Number(r.importo_richiesto) : null,
          note: note || null,
        });
        if (e1) throw e1;
        if (esito === "rifiutata") {
          const { error } = await supabase.from("richieste_fido")
            .update({ stato: "rifiutata" })
            .eq("id", r.id);
          if (error) throw error;
        } else {
          const nextLiv = livDecisione + 1;
          if (nextLiv > r.livello_richiesto) {
            const { error } = await supabase.from("richieste_fido")
              .update({ stato: "approvata", importo_approvato: Number(r.importo_richiesto) })
              .eq("id", r.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("richieste_fido")
              .update({ livello_corrente: nextLiv })
              .eq("id", r.id);
            if (error) throw error;
          }
        }
      }
    },
    onSuccess: (_d, esito) => {
      toast.success(`${selectedRichieste.length} richieste ${esito === "approvata" ? "approvate" : "rifiutate"}`);
      setSelected(new Set());
      setAction(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
      qc.invalidateQueries({ queryKey: ["richieste"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Approvazioni</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? "Tutte le richieste in approvazione" : `Richieste in attesa al tuo livello (${livello})`}
        </p>
      </div>

      {selected.size > 0 && (
        <Card className="p-3 sm:p-4 bg-info/5 border-info/30 sticky top-2 z-10">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              <p className="text-sm font-medium">
                {selected.size} selezionate · totale {formatEuro(totaleSelezionato)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
                Annulla
              </Button>
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30"
                onClick={() => setAction("rifiuta")}>
                <X className="size-4" /> Rifiuta tutte
              </Button>
              <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90"
                onClick={() => setAction("approva")}>
                <Check className="size-4" /> Approva tutte
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : richieste.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="size-12 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-3">
            <CheckCheck className="size-5 text-success" />
          </div>
          <p className="font-medium">Nessuna richiesta in attesa</p>
          <p className="text-xs text-muted-foreground mt-1">Tutte le richieste sono state processate</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-4 text-xs text-muted-foreground">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            <span>Seleziona tutto</span>
          </div>
          {richieste.map((r) => {
            const isSel = selected.has(r.id);
            return (
              <Card key={r.id} className={`p-4 transition-shadow ${isSel ? "border-primary bg-primary/5" : "hover:shadow-md hover:border-primary/30"}`}>
                <div className="flex items-center gap-4">
                  <Checkbox checked={isSel} onCheckedChange={() => toggle(r.id)} />
                  <Link
                    to="/richieste/$richiestaId"
                    params={{ richiestaId: r.id }}
                    className="flex-1 min-w-0 flex items-center justify-between gap-4 flex-wrap"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{(r as any).clienti?.ragione_sociale}</p>
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>
                          {TIPO_LABEL[r.tipo as TipoRichiesta]}
                        </span>
                        <Badge variant="outline">Liv. {r.livello_corrente}/{r.livello_richiesto}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(r as any).stores?.nome ?? "—"} · Inviata il {formatDate(r.data_invio)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg tabular-nums">{formatEuro(Number(r.importo_richiesto))}</p>
                      <p className="text-xs text-muted-foreground">{r.durata_mesi} mesi</p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "approva" ? "Approvazione massiva" : "Rifiuto massivo"}
            </DialogTitle>
            <DialogDescription>
              Stai per {action === "approva" ? "approvare" : "rifiutare"} <strong>{selectedRichieste.length}</strong> richieste
              {action === "approva" && <> per un totale di <strong>{formatEuro(totaleSelezionato)}</strong></>}.
              L'operazione è irreversibile.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs space-y-1">
            {selectedRichieste.map((r) => (
              <div key={r.id} className="flex justify-between gap-2">
                <span className="truncate">{(r as any).clienti?.ragione_sociale}</span>
                <span className="tabular-nums shrink-0">{formatEuro(Number(r.importo_richiesto))}</span>
              </div>
            ))}
          </div>
          <Textarea
            placeholder="Note (opzionali, applicate a tutte)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={bulk.isPending}>
              Annulla
            </Button>
            <Button
              onClick={() => bulk.mutate(action === "approva" ? "approvata" : "rifiutata")}
              disabled={bulk.isPending}
              className={action === "approva" ? "bg-success text-success-foreground hover:bg-success/90" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {bulk.isPending ? "Elaborazione..." : action === "approva" ? "Conferma approvazione" : "Conferma rifiuto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
