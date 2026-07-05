// Tab "Piani di rientro" dentro la sezione Insoluti del cliente.
// Mostra la lista dei piani del cliente + wizard "Nuovo piano".
// Cliccando su un piano si apre il dettaglio (rate + allegati).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, CalendarClock, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { PianoRientroNuovoDialog } from "@/components/piano-rientro-nuovo-dialog";
import { PianoRientroDettaglio } from "@/components/piano-rientro-dettaglio";
import { fetchPianiCliente, fmtDate, fmtEuro, type PianoStato } from "@/lib/piani-rientro";
import { supabase } from "@/integrations/supabase/client";

const STATO_LABEL: Record<PianoStato, string> = {
  attivo: "Attivo",
  completato: "Completato",
  non_rispettato: "Non rispettato",
  annullato: "Annullato",
};
const STATO_CLASS: Record<PianoStato, string> = {
  attivo: "bg-primary/15 text-primary border-primary/30",
  completato: "bg-emerald-600/15 text-emerald-700 border-emerald-600/30",
  non_rispettato: "bg-destructive/15 text-destructive border-destructive/30",
  annullato: "bg-muted text-muted-foreground border-border",
};

export function ClientePianiRientroTab({ clienteId }: { clienteId: string }) {
  const { roles } = useAuth();
  const canManage = roles.some((r) =>
    ["amministratore", "amministrazione", "direzione", "approvatore_liv1", "approvatore_liv2", "approvatore_liv3"].includes(r),
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPiano, setSelectedPiano] = useState<string | null>(null);

  const { data: piani = [], isLoading } = useQuery({
    queryKey: ["piani-cliente", clienteId],
    queryFn: () => fetchPianiCliente(clienteId),
  });

  // Statistiche per riga (numero rate + prossima rata) — 1 query batch
  const pianiIds = piani.map((p) => p.id);
  const { data: statsMap = new Map() } = useQuery({
    queryKey: ["piani-cliente-stats", pianiIds.sort().join(",")],
    enabled: pianiIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piani_rientro_rate" as never)
        .select("piano_id, stato, data_rata, importo")
        .in("piano_id", pianiIds);
      if (error) throw error;
      const map = new Map<string, { totali: number; pagate: number; prossima_data: string | null; prossima_importo: number | null }>();
      for (const id of pianiIds) map.set(id, { totali: 0, pagate: 0, prossima_data: null, prossima_importo: null });
      const rows = (data ?? []) as unknown as Array<{ piano_id: string; stato: string; data_rata: string; importo: number }>;
      const byPiano = new Map<string, typeof rows>();
      for (const r of rows) {
        if (!byPiano.has(r.piano_id)) byPiano.set(r.piano_id, []);
        byPiano.get(r.piano_id)!.push(r);
      }
      for (const [pid, rr] of byPiano) {
        const totali = rr.length;
        const pagate = rr.filter((r) => r.stato === "pagata").length;
        const daPagare = rr.filter((r) => r.stato === "da_pagare").sort((a, b) => a.data_rata.localeCompare(b.data_rata));
        const nx = daPagare[0] ?? null;
        map.set(pid, {
          totali, pagate,
          prossima_data: nx?.data_rata ?? null,
          prossima_importo: nx ? Number(nx.importo) : null,
        });
      }
      return map;
    },
  });

  if (selectedPiano) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setSelectedPiano(null)}>
          <ChevronLeft className="size-4" /> Torna ai piani
        </Button>
        <PianoRientroDettaglio pianoId={selectedPiano} onDeleted={() => setSelectedPiano(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Piani di rientro</h2>
          <Badge variant="outline">{piani.length}</Badge>
        </div>
        {canManage && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Nuovo piano di rientro
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : piani.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nessun piano di rientro. {canManage && "Clicca su “Nuovo piano di rientro” per crearne uno."}
        </Card>
      ) : (
        <div className="space-y-2">
          {piani.map((p) => {
            const s = statsMap.get(p.id) ?? { totali: 0, pagate: 0, prossima_data: null, prossima_importo: null };
            return (
              <Card key={p.id} className="p-4 cursor-pointer hover:bg-muted/40" onClick={() => setSelectedPiano(p.id)}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={STATO_CLASS[p.stato]}>{STATO_LABEL[p.stato]}</Badge>
                    <span className="text-sm">Livello <strong>{p.livello}</strong></span>
                    <span className="text-xs text-muted-foreground">Creato il {fmtDate(p.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div>Rate <strong>{s.pagate}/{s.totali}</strong></div>
                    {s.prossima_data && (
                      <div>Prossima rata: <strong>{fmtDate(s.prossima_data)}</strong> · {fmtEuro(s.prossima_importo)}</div>
                    )}
                  </div>
                </div>
                {p.note && <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{p.note}</div>}
              </Card>
            );
          })}
        </div>
      )}

      <PianoRientroNuovoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clienteId={clienteId}
        onCreated={(pid) => setSelectedPiano(pid)}
      />
    </div>
  );
}
