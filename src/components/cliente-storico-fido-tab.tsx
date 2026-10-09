import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, FileText, Pencil, Ban, Send, History, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CambioCondizionePagamento } from "@/components/cambio-condizione-pagamento";
import { mapRichiestaFido } from "@/lib/richieste-fido-data";
import { FidoTeoricoBlocco } from "@/components/fido-teorico-blocco";
import { RichiestaFormDialog, ModificaRichiestaFidoDialog } from "@/components/richiesta-fido-form-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import {
  STATO_LABEL, STATO_TONE, TIPO_LABEL, TIPO_TONE, formatEuro, formatDate, puoModificareRichiestaFido,
  type TipoRichiesta, type StatoRichiesta,
} from "@/lib/fidi";
import { useAuth } from "@/hooks/use-auth";

const STATI_IN_CORSO: StatoRichiesta[] = ["bozza", "in_approvazione", "in_attesa_liv1", "in_attesa_liv2", "in_attesa_liv3", "integrazioni_richieste"];
const STATI_MODIFICABILI: StatoRichiesta[] = ["bozza", "integrazioni_richieste"];
const STATI_STORICO: StatoRichiesta[] = ["approvata", "rifiutata", "annullata"];

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
        .select("fido_gestionale, ind_blocco, assicurazione_attiva, ultima_data_fatturazione, cliente_attivo, totale_rischio, scaduto, fido_residuo, condizione_pagamento_cod, condizione_pagamento_desc")
        .eq("id", clienteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });


  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["richieste-cliente", clienteId] });
    qc.invalidateQueries({ queryKey: ["richieste"] });
    qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
  };

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

      <FidoTeoricoBlocco clienteId={clienteId} variant="card" />



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
                      <CambioCondizionePagamento variant="badge" richiesta={{ ...r, clienti: cliente ?? null }} />
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
                  {puoModificareRichiestaFido(r) && !isAgente && (
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
                      <CambioCondizionePagamento variant="badge" richiesta={{ ...r, clienti: cliente ?? null }} />
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.stato as StatoRichiesta]}`}>
                        {STATO_LABEL[r.stato as StatoRichiesta]}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span>Richiesto: <strong className="tabular-nums">{formatEuro(Number(r.importo_richiesto))}</strong></span>
                      {mapRichiestaFido(r).soloCondizione ? (
                        <span className="text-muted-foreground">Approvato: solo cond. pag.</span>
                      ) : r.importo_approvato != null && (
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
        {openNew && (
          <RichiestaFormDialog
            clienteIdFisso={clienteId}
            onClose={() => setOpenNew(false)}
            onSaved={invalidate}
          />
        )}
      </Dialog>

      {editing && (
        <ModificaRichiestaFidoDialog
          richiesta={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          onSaved={invalidate}
        />
      )}
    </div>
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
