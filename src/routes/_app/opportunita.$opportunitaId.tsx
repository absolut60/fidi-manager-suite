// Scheda dettaglio opportunità commerciale + sezione Attività (appuntamenti, visite, chiamate…).
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, CalendarClock, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { OpportunitaDialog } from "@/components/opportunita-dialog";
import { AttivitaCommercialeDialog } from "@/components/attivita-commerciale-dialog";
import { BottoneElimina } from "@/components/conferma-eliminazione";
import { usePermessiCommerciale } from "@/hooks/use-permessi-commerciale";
import {
  STATO_LABEL, STATO_CLASS, TIPO_LABEL, fmtEuro, fmtData, nomeSoggetto, type OpportunitaRow,
} from "@/lib/opportunita";
import {
  TIPO_ATTIVITA_LABEL, TIPO_ATTIVITA_CLASS, fmtDataOra, type AttivitaRow,
} from "@/lib/attivita-commerciale";

export const Route = createFileRoute("/_app/opportunita/$opportunitaId")({
  head: () => ({
    meta: [
      { title: "Dettaglio opportunità — FidiManager" },
      { name: "description", content: "Dettaglio dell'opportunità commerciale e attività collegate." },
      { property: "og:title", content: "Dettaglio opportunità — FidiManager" },
      { property: "og:description", content: "Dettaglio dell'opportunità commerciale e attività collegate." },
    ],
  }),
  component: DettaglioOpportunita,
});

function Voce({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function DettaglioOpportunita() {
  const { opportunitaId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { puoEliminareOpportunita } = usePermessiCommerciale();
  const [editOpen, setEditOpen] = useState(false);
  const [attivitaOpen, setAttivitaOpen] = useState(false);
  const [attivitaInModifica, setAttivitaInModifica] = useState<AttivitaRow | null>(null);

  const { data: agenti = [] } = useQuery({
    queryKey: ["agenti-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return (data ?? []) as Array<{ codice: string; descrizione: string | null }>;
    },
    staleTime: 300_000,
  });

  const { data: opp, isLoading } = useQuery({
    queryKey: ["opportunita-dettaglio", opportunitaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunita")
        .select("*, clienti(ragione_sociale, codice_agente), lead(ragione_sociale, nome, cognome), cantieri(nome)")
        .eq("id", opportunitaId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as OpportunitaRow) ?? null;
    },
  });

  const { data: attivita = [], isLoading: loadingAttivita } = useQuery({
    queryKey: ["attivita-commerciale", opportunitaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attivita_commerciale")
        .select("*")
        .eq("opportunita_id", opportunitaId)
        .order("data_pianificata", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(0, 999);
      if (error) throw error;
      return (data ?? []) as unknown as AttivitaRow[];
    },
  });

  async function toggleCompletata(a: AttivitaRow, valore: boolean) {
    const { error } = await supabase
      .from("attivita_commerciale")
      .update({
        completata: valore,
        data_svolgimento: valore ? (a.data_svolgimento ?? new Date().toISOString()) : null,
      })
      .eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["attivita-commerciale"] });
  }

  async function elimina() {
    const { error } = await supabase.from("opportunita").delete().eq("id", opportunitaId);
    if (error) {
      toast.error("Eliminazione non riuscita: non hai i permessi su questa opportunità.");
      return;
    }
    toast.success("Opportunità eliminata");
    qc.invalidateQueries({ queryKey: ["opportunita-lista"] });
    navigate({ to: "/opportunita" });
  }

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (!opp) return <div className="py-10 text-center text-sm text-muted-foreground">Opportunità non trovata.</div>;

  const agenteDesc = opp.agente_codice
    ? (agenti.find((a) => a.codice === opp.agente_codice)?.descrizione ?? opp.agente_codice)
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild title="Torna alla lista" className="shrink-0">
            <Link to="/opportunita"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
              <Target className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 break-words">{opp.titolo}</span>
            </h1>
            <p className="text-sm text-muted-foreground">{nomeSoggetto(opp)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Modifica
          </Button>
          {puoEliminareOpportunita(opp) && (
            <BottoneElimina
              variant="outline"
              etichetta="Elimina"
              titolo="Eliminare questa opportunità?"
              descrizione={`"${opp.titolo}" verrà eliminata definitivamente insieme alle attività collegate. L'azione è irreversibile.`}
              onConferma={elimina}
              className="text-destructive hover:text-destructive"
            />
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Voce label="Stato" value={<Badge variant="outline" className={STATO_CLASS[opp.stato]}>{STATO_LABEL[opp.stato]}</Badge>} />
          <Voce label="Tipo" value={TIPO_LABEL[opp.tipo]} />
          <Voce label="Valore stimato" value={fmtEuro(opp.valore_stimato)} />
          <Voce label="Probabilità" value={opp.probabilita != null ? `${opp.probabilita}%` : "—"} />
          <Voce label="Agente" value={agenteDesc} />
          <Voce label="Cantiere" value={opp.cantieri?.nome ?? "—"} />
          <Voce label="Chiusura prevista" value={fmtData(opp.data_prevista_chiusura)} />
          <Voce label="Chiusura effettiva" value={fmtData(opp.data_chiusura)} />
        </div>
        {(opp.descrizione || opp.note || opp.motivo_perdita) && (
          <div className="mt-4 space-y-2 border-t pt-3 text-sm">
            {opp.descrizione && <div><span className="text-muted-foreground">Descrizione: </span>{opp.descrizione}</div>}
            {opp.motivo_perdita && <div><span className="text-muted-foreground">Motivo perdita: </span>{opp.motivo_perdita}</div>}
            {opp.note && <div><span className="text-muted-foreground">Note: </span>{opp.note}</div>}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" /> Attività
          </h2>
          <Button size="sm" onClick={() => { setAttivitaInModifica(null); setAttivitaOpen(true); }}>
            <Plus className="size-4" /> Registra attività
          </Button>
        </div>

        {loadingAttivita ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : attivita.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nessuna attività registrata.</div>
        ) : (
          <div className="space-y-2">
            {attivita.map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  className="mt-1"
                  checked={a.completata}
                  onCheckedChange={(v) => toggleCompletata(a, v === true)}
                  aria-label="Segna come completata"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={TIPO_ATTIVITA_CLASS[a.tipo]}>{TIPO_ATTIVITA_LABEL[a.tipo]}</Badge>
                    <span className="font-medium">{a.titolo}</span>
                    <Badge variant={a.completata ? "secondary" : "outline"}>
                      {a.completata ? "Fatto" : "Da fare"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-4">
                    <span>Pianificata: {fmtDataOra(a.data_pianificata)}</span>
                    {a.completata && <span>Svolta: {fmtDataOra(a.data_svolgimento)}</span>}
                    {a.esito && <span>Esito: {a.esito}</span>}
                    {a.luogo && <span>Luogo: {a.luogo}</span>}
                  </div>
                  {a.note && <div className="mt-1 text-sm">{a.note}</div>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Modifica attività"
                  onClick={() => { setAttivitaInModifica(a); setAttivitaOpen(true); }}
                >
                  <Pencil className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <OpportunitaDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        opportunita={opp}
        agenti={agenti}
        onDeleted={() => navigate({ to: "/opportunita" })}
      />
      <AttivitaCommercialeDialog
        open={attivitaOpen}
        onOpenChange={setAttivitaOpen}
        attivita={attivitaInModifica}
        contesto={{
          opportunita_id: opp.id,
          cliente_id: opp.cliente_id,
          lead_id: opp.lead_id,
          agente_codice: opp.agente_codice,
          store_id: opp.store_id,
        }}
      />
    </div>
  );
}
