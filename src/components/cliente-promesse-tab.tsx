// Scheda "Promesse" del cliente. Dati: useAzioniRecuperoCliente (stessa cache di
// Attività recupero) filtrati con isPromessaPagamento. Riga: TimelineItem della
// timeline, con scadenza, fatture collegate e badge "Da verificare" in più.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAzioniRecuperoCliente, useOperatoriAttivita, type Azione } from "@/hooks/use-azioni-recupero-cliente";
import { giorniDaOggi, isPromessaDaVerificare, isPromessaPagamento, oggiISOLocale } from "@/lib/azioni-recupero-ui";
import {
  TimelineItem, eliminaAzioneConAllegati, fmtData, fmtDateTime, fmtEuro, invalidaRecuperoCliente, puoModificareAzione,
} from "@/components/cliente-attivita-recupero-tab";
import { RegistraPromessaDialog } from "@/components/registra-promessa-dialog";
import { ModificaAzioneDialog, type AzioneModificabile } from "@/components/modifica-azione-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ClientePromesseTab({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const { azioni, isLoading } = useAzioniRecuperoCliente(clienteId);
  const { data: operatori } = useOperatoriAttivita();
  const [nuovaOpen, setNuovaOpen] = useState(false);
  const [editAzione, setEditAzione] = useState<Azione | null>(null);
  const [deleteAzione, setDeleteAzione] = useState<Azione | null>(null);
  const [deleting, setDeleting] = useState(false);

  const operatoreMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of operatori ?? []) m[o.id] = `${o.nome ?? ""} ${o.cognome ?? ""}`.trim() || "—";
    return m;
  }, [operatori]);

  const oggi = oggiISOLocale();
  const promesse = useMemo(() => {
    const lista = (azioni ?? []).filter(isPromessaPagamento);
    const attiva = (a: Azione) => (a.stato_promessa ?? "attiva") === "attiva";
    const d = (a: Azione) => a.data_promessa_pagamento ?? "";
    return lista.sort((a, b) => {
      if (attiva(a) !== attiva(b)) return attiva(a) ? -1 : 1;
      // Attive: scadenza più vicina prima; altre: data decrescente.
      return attiva(a) ? d(a).localeCompare(d(b)) : d(b).localeCompare(d(a));
    });
  }, [azioni]);

  const riepilogo = useMemo(() => {
    const att = promesse.filter((a) => (a.stato_promessa ?? "attiva") === "attiva");
    return {
      nAttive: att.length,
      totAttive: att.reduce((s, a) => s + Number(a.importo_riferimento ?? 0), 0),
      nVerificare: att.filter((a) => isPromessaDaVerificare(a, oggi)).length,
      nMantenute: promesse.filter((a) => a.stato_promessa === "mantenuta").length,
      nDisattese: promesse.filter((a) => a.stato_promessa === "disattesa").length,
    };
  }, [promesse, oggi]);

  // Fatture collegate (tabella ponte, sola lettura): numeri documento per promessa.
  const ids = promesse.map((p) => p.id);
  const { data: fatture } = useQuery({
    queryKey: ["promesse-cliente-fatture", clienteId, ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("azioni_recupero_scadenze")
        .select("azione_id, scadenza:scadenze(numero_documento)")
        .in("azione_id", ids);
      if (error) throw error;
      const m = new Map<string, string[]>();
      for (const r of (data ?? []) as unknown as { azione_id: string; scadenza: { numero_documento: string | null } | null }[]) {
        const arr = m.get(r.azione_id) ?? [];
        arr.push(r.scadenza?.numero_documento ?? "—");
        m.set(r.azione_id, arr);
      }
      return m;
    },
  });

  function invalida() {
    invalidaRecuperoCliente(qc, clienteId);
    qc.invalidateQueries({ queryKey: ["promesse-cliente-fatture", clienteId] });
  }

  async function handleDelete() {
    if (!deleteAzione || deleting) return;
    setDeleting(true);
    try {
      await eliminaAzioneConAllegati(deleteAzione.id);
      toast.success("Azione eliminata");
      setDeleteAzione(null);
      invalida();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore eliminazione");
    } finally {
      setDeleting(false);
    }
  }

  const pulsante = (
    <Button size="sm" onClick={() => setNuovaOpen(true)} className="gap-1.5 min-h-10 sm:min-h-9">
      <HandCoins className="size-4" /> Registra promessa
    </Button>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 min-w-0 flex-1">
            <Stat label="Attive" value={String(riepilogo.nAttive)} sotto={fmtEuro(riepilogo.totAttive)} />
            <Stat label="Da verificare" value={String(riepilogo.nVerificare)} cls={riepilogo.nVerificare > 0 ? "text-destructive" : ""} />
            <Stat label="Mantenute" value={String(riepilogo.nMantenute)} />
            <Stat label="Disattese" value={String(riepilogo.nDisattese)} />
          </div>
          <div className="shrink-0">{pulsante}</div>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : promesse.length === 0 ? (
        <Card className="p-10 text-center space-y-3">
          <HandCoins className="size-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm font-medium">Nessuna promessa registrata</p>
          <div>{pulsante}</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {promesse.map((a) => {
            const verifica = isPromessaDaVerificare(a, oggi);
            const gg = a.data_promessa_pagamento ? giorniDaOggi(a.data_promessa_pagamento) : 0;
            const numeri = fatture?.get(a.id) ?? [];
            return (
              <TimelineItem
                key={a.id}
                azione={a}
                operatoreName={a.operatore_id ? operatoreMap[a.operatore_id] : null}
                canEdit={puoModificareAzione(roles as string[], user?.id, a)}
                onChangeEsito={() => {}}
                onViewEmail={() => {}}
                onEdit={() => setEditAzione(a)}
                onDelete={() => setDeleteAzione(a)}
                extra={
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>
                        Scadenza promessa: <span className="font-medium">{a.data_promessa_pagamento ? fmtData(a.data_promessa_pagamento) : "—"}</span>
                      </span>
                      <span className="font-medium tabular-nums">
                        {a.importo_riferimento != null ? fmtEuro(a.importo_riferimento) : "Importo mancante"}
                      </span>
                      {verifica && (
                        <Badge variant="destructive">Da verificare · da {gg} {gg === 1 ? "giorno" : "giorni"}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground break-words">
                      {numeri.length} {numeri.length === 1 ? "fattura collegata" : "fatture collegate"}
                      {numeri.length > 0 && `: ${numeri.join(", ")}`}
                      {" · inserita da "}{(a.operatore_id && operatoreMap[a.operatore_id]) || "—"} il {fmtDateTime(a.created_at)}
                    </div>
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      <RegistraPromessaDialog open={nuovaOpen} onOpenChange={setNuovaOpen} clienteId={clienteId} onCreated={invalida} />

      {editAzione && (
        <ModificaAzioneDialog
          key={editAzione.id}
          open={!!editAzione}
          onOpenChange={(v) => !v && setEditAzione(null)}
          azione={editAzione as AzioneModificabile}
          onSaved={invalida}
        />
      )}

      <AlertDialog open={!!deleteAzione} onOpenChange={(v) => !v && !deleting && setDeleteAzione(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa azione?</AlertDialogTitle>
            <AlertDialogDescription>
              Promessa di pagamento del {deleteAzione ? fmtDateTime(deleteAzione.data_azione) : ""}.
              Verranno rimossi anche eventuali allegati collegati (file e righe). L'operazione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminazione…" : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, sotto, cls }: { label: string; value: string; sotto?: string; cls?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 tabular-nums ${cls ?? ""}`}>{value}</div>
      {sotto && <div className="text-xs text-muted-foreground tabular-nums">{sotto}</div>}
    </div>
  );
}
