// Vista/gestione di un singolo piano di rientro (dentro la tab cliente):
// - intestazione con stato, livello, totali
// - elenco rate: conferma manuale pagamento, salta, badge "possibile pagamento rilevato"
// - documenti collegati
// - allegati (riusa AllegatiSection)
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, CalendarClock, AlertTriangle, CheckCircle2, Info, Ban, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AllegatiSection, ALLEGATI_BUCKET } from "@/components/allegati-section";
import {
  fetchPiano, fetchRatePiano, fetchDocumentiPiano, fmtEuro, fmtDate,
  totaleIncassatoDocumenti, prossimaRata, type PianoRata, type PianoStato,
} from "@/lib/piani-rientro";

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

export function PianoRientroDettaglio({ pianoId, onDeleted }: { pianoId: string; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canDelete = roles.some((r) =>
    ["amministratore", "amministrazione", "direzione", "approvatore_liv1", "approvatore_liv2", "approvatore_liv3"].includes(r),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmStep1, setConfirmStep1] = useState(false);
  const [confirmStep2, setConfirmStep2] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { data: piano, isLoading: lp } = useQuery({
    queryKey: ["piano", pianoId],
    queryFn: () => fetchPiano(pianoId),
  });
  const { data: rate = [], isLoading: lr } = useQuery({
    queryKey: ["piano-rate", pianoId],
    queryFn: () => fetchRatePiano(pianoId),
  });
  const { data: documenti = [], isLoading: ld } = useQuery({
    queryKey: ["piano-documenti", pianoId],
    queryFn: () => fetchDocumentiPiano(pianoId),
  });

  // Allegati count (solo per il riepilogo di eliminazione)
  const { data: allegatiCount = 0 } = useQuery({
    queryKey: ["piano-allegati-count", pianoId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("allegati")
        .select("id", { count: "exact", head: true })
        .eq("entita_tipo", "piano_rientro")
        .eq("entita_id", pianoId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["piano", pianoId] });
    qc.invalidateQueries({ queryKey: ["piano-rate", pianoId] });
    qc.invalidateQueries({ queryKey: ["piani-cliente"] });
    qc.invalidateQueries({ queryKey: ["piani-rientro-lista"] });
    qc.invalidateQueries({ queryKey: ["scadenziario-lista"] });
    qc.invalidateQueries({ queryKey: ["azioni-calendario"] });
    qc.invalidateQueries({ queryKey: ["piano-rate-calendario"] });
    qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente"] });
    qc.invalidateQueries({ queryKey: ["piano-scadenze-altri-piani"] });
  };

  async function eliminaPianoDefinitivamente() {
    if (deleting) return;
    setDeleting(true);
    try {
      // 1) fetch storage_path degli allegati per rimuovere i file
      const { data: allegatiRows, error: eA } = await supabase
        .from("allegati")
        .select("id, storage_path")
        .eq("entita_tipo", "piano_rientro")
        .eq("entita_id", pianoId);
      if (eA) throw eA;
      const paths = (allegatiRows ?? []).map((a) => a.storage_path).filter(Boolean);

      // 2) rimuovi i file dallo storage (best-effort: se fallisce, non blocca)
      if (paths.length > 0) {
        const { error: eSt } = await supabase.storage.from(ALLEGATI_BUCKET).remove(paths);
        if (eSt) console.warn("Rimozione file allegati (storage):", eSt.message);
      }

      // 3) rimuovi le righe allegati
      if ((allegatiRows ?? []).length > 0) {
        const { error: eAd } = await supabase
          .from("allegati")
          .delete()
          .eq("entita_tipo", "piano_rientro")
          .eq("entita_id", pianoId);
        if (eAd) throw eAd;
      }

      // 4) elimina il piano — CASCADE su piani_rientro_rate, piani_rientro_documenti
      //    e azioni_recupero (via piano_rientro_id). Nessuna scrittura su `scadenze`.
      const { error: eP } = await supabase
        .from("piani_rientro" as never)
        .delete()
        .eq("id", pianoId);
      if (eP) throw eP;

      toast.success("Piano eliminato definitivamente");
      invalidateAll();
      setConfirmStep2(false);
      setConfirmStep1(false);
      onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore eliminazione piano");
    } finally {
      setDeleting(false);
    }
  }

  async function updateRataStato(rata: PianoRata, nuovoStato: "pagata" | "saltata" | "da_pagare", dataPag?: string) {
    setSaving(rata.id);
    try {
      const patch: Record<string, unknown> = { stato: nuovoStato };
      if (nuovoStato === "pagata") patch.data_pagamento_confermata = dataPag ?? new Date().toISOString().slice(0, 10);
      if (nuovoStato !== "pagata") patch.data_pagamento_confermata = null;
      const { error } = await supabase
        .from("piani_rientro_rate" as never)
        .update(patch as never)
        .eq("id", rata.id);
      if (error) throw error;

      const nuoveRate = rate.map((r) => (r.id === rata.id ? { ...r, stato: nuovoStato } : r));
      const tutteOK = nuoveRate.every((r) => r.stato === "pagata");
      if (tutteOK && piano?.stato === "attivo") {
        toast.success("Rata aggiornata — tutte le rate risultano pagate.", {
          action: {
            label: "Segna piano completato",
            onClick: () => updatePianoStato("completato"),
          },
        });
      } else {
        toast.success("Rata aggiornata");
      }
      invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore aggiornamento");
    } finally {
      setSaving(null);
    }
  }

  async function updatePianoStato(nuovoStato: PianoStato) {
    try {
      const { error } = await supabase
        .from("piani_rientro" as never)
        .update({ stato: nuovoStato } as never)
        .eq("id", pianoId);
      if (error) throw error;
      toast.success(`Piano segnato come ${STATO_LABEL[nuovoStato].toLowerCase()}`);
      invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    }
  }

  const totaleRate = useMemo(() => rate.reduce((a, r) => a + Number(r.importo || 0), 0), [rate]);
  const totalePagato = useMemo(
    () => rate.filter((r) => r.stato === "pagata").reduce((a, r) => a + Number(r.importo || 0), 0),
    [rate],
  );
  const totaleDocumenti = useMemo(
    () => documenti.reduce((a, d) => a + Number(d.importo_alla_selezione ?? 0), 0),
    [documenti],
  );
  const incassatoDoc = useMemo(() => totaleIncassatoDocumenti(documenti), [documenti]);
  const prossima = useMemo(() => prossimaRata(rate), [rate]);

  if (lp || lr || ld) return <Skeleton className="h-64" />;
  if (!piano) return <div className="text-sm text-muted-foreground italic">Piano non trovato.</div>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 grid place-content-center">
              <CalendarClock className="size-5 text-primary" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Piano di rientro · Livello {piano.livello}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={STATO_CLASS[piano.stato]}>{STATO_LABEL[piano.stato]}</Badge>
                <span className="text-xs text-muted-foreground">Creato il {fmtDate(piano.created_at)}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {piano.stato === "attivo" && (
              <>
                <Button size="sm" variant="outline" onClick={() => updatePianoStato("completato")}>
                  <CheckCircle2 className="size-4" /> Completato
                </Button>
                <Button size="sm" variant="outline" onClick={() => updatePianoStato("non_rispettato")}
                  className="text-destructive hover:text-destructive">
                  <AlertTriangle className="size-4" /> Non rispettato
                </Button>
                <Button size="sm" variant="ghost" onClick={() => updatePianoStato("annullato")}>
                  <Ban className="size-4" /> Annulla
                </Button>
              </>
            )}
            {canDelete && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmStep1(true)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="size-4" /> Elimina piano
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Kpi label="Totale documenti" value={fmtEuro(totaleDocumenti)} />
          <Kpi label="Totale rate" value={fmtEuro(totaleRate)} />
          <Kpi label="Pagato" value={fmtEuro(totalePagato)} tone="ok" />
          <Kpi
            label="Rate pagate"
            value={`${rate.filter((r) => r.stato === "pagata").length}/${rate.length}`}
          />
        </div>

        {piano.note && (
          <div className="mt-4 text-sm bg-muted/40 rounded-md p-3 whitespace-pre-wrap">{piano.note}</div>
        )}
      </Card>

      {/* Rate */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Rate</h3>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">#</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rate.map((r) => {
                const inRitardo = r.stato === "da_pagare" && r.data_rata < today;
                const isProssima = prossima?.id === r.id;
                const proposta = isProssima && incassatoDoc > 0 && piano.stato === "attivo";
                return (
                  <TableRow key={r.id} className={inRitardo ? "bg-destructive/5" : ""}>
                    <TableCell className="font-medium">{r.numero_rata}</TableCell>
                    <TableCell>
                      {fmtDate(r.data_rata)}
                      {inRitardo && (
                        <Badge className="ml-2 bg-destructive text-destructive-foreground hover:bg-destructive">Scaduta</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEuro(r.importo)}</TableCell>
                    <TableCell>
                      {r.stato === "pagata" && <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Pagata</Badge>}
                      {r.stato === "saltata" && <Badge variant="outline" className="text-muted-foreground">Saltata</Badge>}
                      {r.stato === "da_pagare" && <Badge variant="outline">Da pagare</Badge>}
                      {r.data_pagamento_confermata && (
                        <div className="text-xs text-muted-foreground mt-0.5">Pagata il {fmtDate(r.data_pagamento_confermata)}</div>
                      )}
                      {proposta && (
                        <div className="mt-1.5 flex items-start gap-1.5 text-xs bg-orange-50 border border-orange-200 rounded-md px-2 py-1 max-w-xs">
                          <Info className="size-3.5 text-orange-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="text-orange-900">
                              Possibile pagamento rilevato: <strong>{fmtEuro(incassatoDoc)}</strong> incassati sui documenti del piano
                            </div>
                            <Button size="sm" variant="link" className="h-auto p-0 text-orange-700"
                              onClick={() => updateRataStato(r, "pagata")}>
                              Conferma pagamento
                            </Button>
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{r.note ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {piano.stato === "attivo" && (
                        <div className="flex items-center justify-end gap-1">
                          {r.stato !== "pagata" && (
                            <Button size="sm" variant="outline" disabled={saving === r.id}
                              onClick={() => updateRataStato(r, "pagata")}>
                              <Check className="size-3.5" /> Pagata
                            </Button>
                          )}
                          {r.stato !== "saltata" && (
                            <Button size="sm" variant="ghost" disabled={saving === r.id}
                              onClick={() => updateRataStato(r, "saltata")}>
                              <X className="size-3.5" /> Salta
                            </Button>
                          )}
                          {r.stato !== "da_pagare" && (
                            <Button size="sm" variant="ghost" disabled={saving === r.id}
                              onClick={() => updateRataStato(r, "da_pagare")}>
                              Ripristina
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Documenti collegati */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Documenti collegati ({documenti.length})</h3>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Data scadenza</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documenti.map((d) => {
                const s = d.scadenza;
                const pagato = s.data_pagamento_effettiva != null;
                return (
                  <TableRow key={d.scadenza_id}>
                    <TableCell className="font-mono text-xs">{s.numero_documento ?? "—"}</TableCell>
                    <TableCell>{fmtDate(s.data_scadenza)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEuro(d.importo_alla_selezione)}</TableCell>
                    <TableCell>
                      {pagato ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          Incassato {fmtDate(s.data_pagamento_effettiva)} — {fmtEuro(s.importo_pagato)}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Aperto</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Allegati */}
      <Card className="p-4">
        <AllegatiSection
          entitaTipo="piano_rientro"
          entitaId={pianoId}
          clienteId={piano.cliente_id}
          title="Allegati piano"
        />
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 tabular-nums ${tone === "ok" ? "text-emerald-700" : ""}`}>{value}</div>
    </div>
  );
}
