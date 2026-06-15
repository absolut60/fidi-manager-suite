import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Esito = "da_fare" | "fatto" | "nessuna_risposta" | "promessa_pagamento" | "contestazione" | "pagato";

const ESITI: { value: Esito; label: string }[] = [
  { value: "da_fare", label: "Da fare" },
  { value: "fatto", label: "Fatto" },
  { value: "nessuna_risposta", label: "Nessuna risposta" },
  { value: "promessa_pagamento", label: "Promessa pagamento" },
  { value: "contestazione", label: "Contestazione" },
  { value: "pagato", label: "Pagato" },
];

export type AzioneModificabile = {
  id: string;
  cliente_id: string;
  tipo: string;
  esito: Esito;
  data_azione: string;
  data_promessa_pagamento: string | null;
  importo_riferimento: number | null;
  note: string | null;
  email_oggetto: string | null;
  email_corpo_html: string | null;
  email_destinatario: string | null;
  livello_sollecito: number | null;
};

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ModificaAzioneDialog({
  open, onOpenChange, azione, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  azione: AzioneModificabile;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const isEmail = azione.tipo === "email";
  const isSollecito = isEmail && azione.livello_sollecito != null && azione.livello_sollecito > 0;

  const [dataAzione, setDataAzione] = useState(toDatetimeLocal(azione.data_azione));
  const [esito, setEsito] = useState<Esito>(azione.esito);
  const [dataPromessa, setDataPromessa] = useState<string>(azione.data_promessa_pagamento ?? "");
  const [importo, setImporto] = useState<string>(azione.importo_riferimento != null ? String(azione.importo_riferimento) : "");
  const [note, setNote] = useState(azione.note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDataAzione(toDatetimeLocal(azione.data_azione));
      setEsito(azione.esito);
      setDataPromessa(azione.data_promessa_pagamento ?? "");
      setImporto(azione.importo_riferimento != null ? String(azione.importo_riferimento) : "");
      setNote(azione.note ?? "");
      setSaving(false);
    }
  }, [open, azione]);

  async function handleSave() {
    if (saving) return;
    const dt = new Date(dataAzione);
    if (isNaN(dt.getTime())) {
      toast.error("Data non valida");
      return;
    }
    setSaving(true);
    try {
      // Per email NON modifichiamo data_azione (è la data di invio reale).
      const patch: Record<string, unknown> = {
        esito,
        note: note.trim() || null,
        data_promessa_pagamento: esito === "promessa_pagamento" && dataPromessa ? dataPromessa : null,
      };
      if (!isEmail) {
        patch.data_azione = dt.toISOString();
        const n = importo.trim() === "" ? null : Number(importo);
        if (n != null && !isNaN(n)) patch.importo_riferimento = n;
        else if (importo.trim() === "") patch.importo_riferimento = null;
      }
      const { error } = await supabase
        .from("azioni_recupero")
        .update(patch)
        .eq("id", azione.id);
      if (error) throw error;
      toast.success("Azione aggiornata");
      qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", azione.cliente_id] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-counts"] });
      qc.invalidateQueries({ queryKey: ["azioni-calendario"] });
      qc.invalidateQueries({ queryKey: ["recupero-clienti"] });
      qc.invalidateQueries({ queryKey: ["clienti-avvisati"] });
      onSaved?.();
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
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5" /> Modifica azione
          </DialogTitle>
          <DialogDescription>
            {isEmail
              ? "Email già inviata: il contenuto è in sola lettura. Puoi aggiornare solo esito e note."
              : "Aggiorna i dati dell'azione."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isEmail && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> Prova di invio — non modificabile
              </div>
              {azione.email_destinatario && (
                <div className="text-sm"><span className="text-muted-foreground">A: </span>{azione.email_destinatario}</div>
              )}
              {azione.email_oggetto && (
                <div className="text-sm"><span className="text-muted-foreground">Oggetto: </span>{azione.email_oggetto}</div>
              )}
              {isSollecito && (
                <div className="text-xs text-muted-foreground">Livello sollecito: {azione.livello_sollecito}</div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data e ora</Label>
              <Input
                type="datetime-local"
                value={dataAzione}
                onChange={(e) => setDataAzione(e.target.value)}
                disabled={isEmail}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Esito</Label>
              <Select value={esito} onValueChange={(v) => setEsito(v as Esito)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESITI.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {esito === "promessa_pagamento" && (
            <div className="space-y-1.5">
              <Label>Data promessa pagamento</Label>
              <Input
                type="date"
                value={dataPromessa}
                onChange={(e) => setDataPromessa(e.target.value)}
              />
            </div>
          )}

          {!isEmail && (
            <div className="space-y-1.5">
              <Label>Importo di riferimento (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            <Pencil className="size-4" /> {saving ? "Salvataggio…" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
