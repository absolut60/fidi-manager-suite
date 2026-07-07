// Registra promessa di pagamento — componente UNICO riutilizzato in:
// - scheda cliente (tab "Attività di recupero")
// - pagina recupero-crediti (toolbar)
// - cruscotto incassi (azione di riga sulla lista "Da incassare")
//
// Persistenza: azioni_recupero (tipo='nota', esito='promessa_pagamento',
// data_promessa_pagamento=<data promessa>, importo_riferimento=<importo>).
// Facoltativamente collega scadenze aperte via ponte azioni_recupero_scadenze.
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelettoreScadenzeAperte } from "@/components/selettore-scadenze-aperte";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  /** Etichetta cliente pre-caricata: evita una fetch quando disponibile. */
  clienteLabel?: string;
  onCreated?: () => void;
};

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function RegistraPromessaDialog({
  open, onOpenChange, clienteId, clienteLabel, onCreated,
}: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [dataPromessa, setDataPromessa] = useState<string>(todayISO());
  const [importo, setImporto] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [selectedScadenze, setSelectedScadenze] = useState<Set<string>>(new Set());
  const [totaleSelezionato, setTotaleSelezionato] = useState(0);

  useEffect(() => {
    if (open) {
      setDataPromessa(todayISO());
      setImporto("");
      setNote("");
      setSaving(false);
      setSelectedScadenze(new Set());
      setTotaleSelezionato(0);
    }
  }, [open, clienteId]);

  const { data: cliente } = useQuery({
    queryKey: ["registra-promessa-cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("ragione_sociale")
        .eq("id", clienteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !clienteLabel,
  });

  const label = clienteLabel ?? cliente?.ragione_sociale ?? "…";

  const handleStateChange = useCallback(
    (info: { scadenze: unknown[]; totaleSelezionato: number }) => {
      setTotaleSelezionato(info.totaleSelezionato);
    },
    [],
  );

  async function handleSubmit() {
    if (saving) return;
    if (!dataPromessa) {
      toast.error("Indica la data della promessa");
      return;
    }
    const importoNum = importo.trim() ? Number(importo.replace(",", ".")) : null;
    if (importoNum != null && (!Number.isFinite(importoNum) || importoNum < 0)) {
      toast.error("Importo non valido");
      return;
    }
    setSaving(true);
    try {
      const { data: inserted, error } = await supabase
        .from("azioni_recupero")
        .insert({
          cliente_id: clienteId,
          operatore_id: user?.id ?? null,
          tipo: "nota",
          esito: "promessa_pagamento",
          data_azione: new Date().toISOString(),
          data_promessa_pagamento: dataPromessa,
          importo_riferimento: importoNum,
          note: note.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const azioneId = inserted?.id as string | undefined;
      const scadenzeIds = Array.from(selectedScadenze);
      if (azioneId && scadenzeIds.length > 0) {
        const { error: eLink } = await supabase
          .from("azioni_recupero_scadenze")
          .insert(scadenzeIds.map((sid) => ({ azione_id: azioneId, scadenza_id: sid })));
        if (eLink) {
          // rollback manuale: elimina l'azione appena creata per non lasciarla orfana
          await supabase.from("azioni_recupero").delete().eq("id", azioneId);
          throw eLink;
        }
      }

      toast.success("Promessa registrata");
      qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", clienteId] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
      qc.invalidateQueries({ queryKey: ["recupero-clienti-aggregato"] });
      qc.invalidateQueries({ queryKey: ["cruscotto_incassi_dettaglio"] });
      qc.invalidateQueries({ queryKey: ["azioni-calendario"] });
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore salvataggio";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="size-5" /> Registra promessa di pagamento
          </DialogTitle>
          <DialogDescription>
            Cliente: <strong>{label}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="promessa-data">Data promessa *</Label>
              <Input
                id="promessa-data"
                type="date"
                value={dataPromessa}
                onChange={(e) => setDataPromessa(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="promessa-importo">Importo (opzionale)</Label>
                {selectedScadenze.size > 0 && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setImporto(String(totaleSelezionato.toFixed(2)))}
                  >
                    Usa totale selezionato
                  </button>
                )}
              </div>
              <Input
                id="promessa-importo"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="€"
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promessa-note">Note</Label>
            <Textarea
              id="promessa-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Riferimenti, modalità, canale…"
            />
          </div>

          <SelettoreScadenzeAperte
            clienteId={clienteId}
            open={open}
            selectedIds={selectedScadenze}
            onChange={setSelectedScadenze}
            mostraBadgePiani={false}
            titolo="Scadenze collegate (opzionale)"
            onStateChange={handleStateChange}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
            <HandCoins className="size-4" />
            {saving ? "Salvataggio…" : "Registra promessa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
