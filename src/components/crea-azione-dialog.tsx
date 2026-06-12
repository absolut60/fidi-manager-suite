import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { classificaScadenza } from "@/lib/scadenze";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ReminderControls,
  defaultReminderFor,
  creaFollowUp,
  type ReminderState,
  type TipoAzione,
} from "@/components/reminder-controls";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  /** Tipo iniziale (default 'promemoria') */
  tipoIniziale?: TipoAzione;
  /** Data iniziale (default = now) */
  dataIniziale?: Date;
  onCreated?: () => void;
};

const TIPI: { value: TipoAzione; label: string }[] = [
  { value: "promemoria", label: "Promemoria" },
  { value: "telefonata", label: "Telefonata" },
  { value: "nota", label: "Nota" },
  { value: "lettera", label: "Lettera" },
];

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreaAzioneDialog({
  open, onOpenChange, clienteId, tipoIniziale = "promemoria", dataIniziale, onCreated,
}: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [tipo, setTipo] = useState<TipoAzione>(tipoIniziale);
  const [dataAzione, setDataAzione] = useState<string>(toDatetimeLocal(dataIniziale ?? new Date()));
  const [note, setNote] = useState("");
  const [scadenzeSel, setScadenzeSel] = useState<Set<string>>(new Set());
  const [reminder, setReminder] = useState<ReminderState>(defaultReminderFor(tipoIniziale));
  const [saving, setSaving] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setTipo(tipoIniziale);
      setDataAzione(toDatetimeLocal(dataIniziale ?? new Date()));
      setNote("");
      setScadenzeSel(new Set());
      setReminder(defaultReminderFor(tipoIniziale));
      setSaving(false);
    }
  }, [open, tipoIniziale, dataIniziale]);

  // Cliente (per nome)
  const { data: cliente } = useQuery({
    queryKey: ["crea-azione-cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale")
        .eq("id", clienteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!clienteId,
  });

  // Scadenze del cliente
  const { data: scadenze } = useQuery({
    queryKey: ["crea-azione-scadenze", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("id, numero_documento, data_scadenza, importo_scadenza, giorni_ritardo, stato_contabile, tempi_scadenza")
        .eq("cliente_id", clienteId)
        .order("data_scadenza", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((s: any) => classificaScadenza(s) === "scaduto");
    },
    enabled: open && !!clienteId,
  });

  const totaleScaduto = useMemo(
    () => (scadenze ?? []).reduce((a: number, s: any) => a + Number(s.importo_scadenza ?? 0), 0),
    [scadenze],
  );

  function toggleScad(id: string) {
    setScadenzeSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function handleConferma() {
    if (saving) return;
    const dt = new Date(dataAzione);
    if (isNaN(dt.getTime())) {
      toast.error("Data non valida");
      return;
    }
    // Esito: 'nota' → 'fatto' se data <= ora, altrimenti 'da_fare'. Altri tipi: 'fatto' se passata, altrimenti 'da_fare'.
    const now = new Date();
    const futura = dt.getTime() > now.getTime() + 60 * 1000;
    let esito: "da_fare" | "fatto";
    if (tipo === "nota") {
      esito = futura ? "da_fare" : "fatto";
    } else if (tipo === "promemoria" || tipo === "telefonata") {
      esito = futura ? "da_fare" : "fatto";
    } else {
      esito = futura ? "da_fare" : "fatto";
    }

    setSaving(true);
    try {
      const scadIds = Array.from(scadenzeSel);
      const { data: inserita, error } = await supabase
        .from("azioni_recupero")
        .insert({
          cliente_id: clienteId,
          operatore_id: user?.id ?? null,
          tipo,
          esito,
          data_azione: dt.toISOString(),
          importo_riferimento: totaleScaduto,
          note: note.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (scadIds.length && inserita?.id) {
        const rows = scadIds.map((sid) => ({ azione_id: inserita.id, scadenza_id: sid }));
        const { error: e2 } = await supabase.from("azioni_recupero_scadenze").insert(rows);
        if (e2) throw e2;
      }

      if (reminder.attivo && reminder.giorni > 0) {
        try {
          await creaFollowUp({
            clienteId,
            operatoreId: user?.id ?? null,
            dataPrincipale: dt,
            giorni: reminder.giorni,
            tipoOriginale: tipo,
            importoRiferimento: totaleScaduto,
            scadenzeIds: scadIds,
            descrizioneOriginale: TIPI.find((t) => t.value === tipo)?.label.toLowerCase() ?? tipo,
          });
        } catch (e: any) {
          console.error("Follow-up error", e);
          toast.warning("Azione creata, ma follow-up non creato: " + (e?.message ?? "errore"));
        }
      }

      toast.success("Azione creata");
      qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-counts"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", clienteId] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-calendario"] });
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Errore creazione azione");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-5" /> Nuova azione di recupero
          </DialogTitle>
          <DialogDescription>
            {cliente ? <>Cliente: <strong>{cliente.ragione_sociale}</strong></> : "Caricamento cliente..."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoAzione)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPI.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data e ora</Label>
              <Input
                type="datetime-local"
                value={dataAzione}
                onChange={(e) => setDataAzione(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Annotazioni libere…"
            />
          </div>

          {(scadenze?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <Label>Scadenze scadute da collegare (opzionale)</Label>
              <div className="rounded-md border border-border max-h-44 overflow-y-auto divide-y divide-border">
                {(scadenze ?? []).map((s: any) => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                    <Checkbox
                      checked={scadenzeSel.has(s.id)}
                      onCheckedChange={() => toggleScad(s.id)}
                    />
                    <span className="font-mono text-xs text-muted-foreground w-28 shrink-0 truncate">
                      {s.numero_documento ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground w-24 shrink-0">
                      {s.data_scadenza ? new Date(s.data_scadenza).toLocaleDateString("it-IT") : "—"}
                    </span>
                    <span className="ml-auto font-medium">
                      {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(s.importo_scadenza ?? 0))}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Totale scaduto: <strong>{new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(totaleScaduto)}</strong>
              </p>
            </div>
          )}

          <ReminderControls tipo={tipo} state={reminder} onChange={setReminder} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Annulla</Button>
          <Button onClick={handleConferma} disabled={saving} className="gap-1.5">
            <Plus className="size-4" /> {saving ? "Salvataggio…" : "Crea azione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
