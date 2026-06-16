import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Paperclip, Plus, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadAllegatoFile,
  validateAllegatoFile,
  fmtAllegatoBytes,
} from "@/components/allegati-section";
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
  /** Se fornito, il cliente è fissato. Se assente, il dialog mostra un selettore. */
  clienteId?: string;
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
  open, onOpenChange, clienteId: clienteIdProp, tipoIniziale = "promemoria", dataIniziale, onCreated,
}: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const clienteFissato = !!clienteIdProp;

  const [tipo, setTipo] = useState<TipoAzione>(tipoIniziale);
  const [dataAzione, setDataAzione] = useState<string>(toDatetimeLocal(dataIniziale ?? new Date()));
  const [note, setNote] = useState("");
  const [scadenzeSel, setScadenzeSel] = useState<Set<string>>(new Set());
  const [reminder, setReminder] = useState<ReminderState>(defaultReminderFor(tipoIniziale));
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; descrizione: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Cliente: se fissato dal prop, usa quello; altrimenti gestito tramite picker interno
  const [pickedClienteId, setPickedClienteId] = useState<string | null>(null);

  const effectiveClienteId = clienteFissato ? clienteIdProp! : pickedClienteId;

  // Reset on open
  useEffect(() => {
    if (open) {
      setTipo(tipoIniziale);
      setDataAzione(toDatetimeLocal(dataIniziale ?? new Date()));
      setNote("");
      setScadenzeSel(new Set());
      setReminder(defaultReminderFor(tipoIniziale));
      setSaving(false);
      setPickedClienteId(null);
      setPendingFiles([]);
    }
  }, [open, tipoIniziale, dataIniziale]);

  // Cliente (per nome) — solo se abbiamo un id
  const { data: cliente } = useQuery({
    queryKey: ["crea-azione-cliente", effectiveClienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale")
        .eq("id", effectiveClienteId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!effectiveClienteId,
  });

  // Scadenze del cliente
  const { data: scadenze } = useQuery({
    queryKey: ["crea-azione-scadenze", effectiveClienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("id, numero_documento, data_scadenza, importo_scadenza, giorni_ritardo, stato_contabile, tempi_scadenza")
        .eq("cliente_id", effectiveClienteId!)
        .order("data_scadenza", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((s: any) => classificaScadenza(s) === "scaduto");
    },
    enabled: open && !!effectiveClienteId,
  });

  // Reset scadenze sel quando cambia cliente
  useEffect(() => {
    setScadenzeSel(new Set());
  }, [effectiveClienteId]);

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
    if (!effectiveClienteId) {
      toast.error("Seleziona un cliente");
      return;
    }
    const dt = new Date(dataAzione);
    if (isNaN(dt.getTime())) {
      toast.error("Data non valida");
      return;
    }
    const now = new Date();
    const futura = dt.getTime() > now.getTime() + 60 * 1000;
    const esito: "da_fare" | "fatto" = futura ? "da_fare" : "fatto";

    setSaving(true);
    try {
      const scadIds = Array.from(scadenzeSel);
      const { data: inserita, error } = await supabase
        .from("azioni_recupero")
        .insert({
          cliente_id: effectiveClienteId,
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
            clienteId: effectiveClienteId,
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

      // Upload allegati in sospeso (dopo che l'azione e stata creata con successo).
      // Se un upload fallisce, l'azione resta valida e segnaliamo l'errore.
      let allegatiFalliti: string[] = [];
      if (pendingFiles.length && inserita?.id) {
        for (const item of pendingFiles) {
          const res = await uploadAllegatoFile({
            file: item.file,
            descrizione: item.descrizione,
            entitaTipo: "azione_recupero",
            entitaId: inserita.id,
            clienteId: effectiveClienteId,
            userId: user?.id ?? null,
          });
          if (!res.ok) allegatiFalliti.push(`${item.file.name}: ${res.error}`);
        }
      }

      if (allegatiFalliti.length) {
        toast.warning(
          `Azione creata, ma alcuni allegati non sono stati caricati: ${allegatiFalliti.join("; ")}. Riprova dalla scheda azione.`,
        );
      } else {
        toast.success("Azione creata");
      }
      qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-counts"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", effectiveClienteId] });
      qc.invalidateQueries({ queryKey: ["azioni-calendario"] });
      qc.invalidateQueries({ queryKey: ["allegati", "azione_recupero", inserita?.id] });
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
            {clienteFissato
              ? (cliente ? <>Cliente: <strong>{cliente.ragione_sociale}</strong></> : "Caricamento cliente...")
              : "Seleziona un cliente e compila i dettagli dell'azione."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!clienteFissato && (
            <ClientePicker
              selected={pickedClienteId}
              selectedName={cliente?.ragione_sociale ?? null}
              onPick={setPickedClienteId}
              onClear={() => setPickedClienteId(null)}
            />
          )}

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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Paperclip className="size-4 text-muted-foreground" />
                Allegati (opzionale)
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                <Plus className="size-4" /> Aggiungi
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  const toAdd: { file: File; descrizione: string }[] = [];
                  for (const f of files) {
                    const err = validateAllegatoFile(f);
                    if (err) {
                      toast.error(`${f.name}: ${err}`);
                      continue;
                    }
                    toAdd.push({ file: f, descrizione: "" });
                  }
                  if (toAdd.length) setPendingFiles((p) => [...p, ...toAdd]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
            </div>
            {pendingFiles.length > 0 ? (
              <ul className="rounded-md border border-border divide-y divide-border text-sm">
                {pendingFiles.map((it, idx) => (
                  <li key={idx} className="flex items-center gap-2 px-3 py-2">
                    <Paperclip className="size-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{it.file.name}</div>
                      <div className="text-xs text-muted-foreground">{fmtAllegatoBytes(it.file.size)}</div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setPendingFiles((p) => p.filter((_, i) => i !== idx))}
                      disabled={saving}
                      title="Rimuovi"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nessun allegato selezionato. Verranno caricati dopo la creazione dell'azione.
              </p>
            )}
          </div>

          <ReminderControls tipo={tipo} state={reminder} onChange={setReminder} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Annulla</Button>
          <Button onClick={handleConferma} disabled={saving || !effectiveClienteId} className="gap-1.5">
            <Plus className="size-4" /> {saving ? "Salvataggio…" : "Crea azione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientePicker({
  selected, selectedName, onPick, onClear,
}: {
  selected: string | null;
  selectedName: string | null;
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: risultati, isFetching } = useQuery({
    queryKey: ["crea-azione-cliente-search", debounced],
    enabled: !selected && debounced.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, partita_iva")
        .ilike("ragione_sociale", `%${debounced}%`)
        .order("ragione_sociale")
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (selected) {
    return (
      <div className="space-y-1.5">
        <Label>Cliente</Label>
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium truncate">{selectedName ?? "Caricamento…"}</span>
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={onClear}>
            <X className="size-3.5" /> Cambia
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label>Cliente *</Label>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Cerca per ragione sociale (min. 2 caratteri)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>
      {debounced.length >= 2 && (
        <div className="rounded-md border border-border max-h-48 overflow-y-auto divide-y divide-border">
          {isFetching && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Ricerca in corso…</div>
          )}
          {!isFetching && (risultati?.length ?? 0) === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nessun cliente trovato</div>
          )}
          {(risultati ?? []).map((c: any) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 flex items-center justify-between gap-2"
            >
              <span className="font-medium truncate">{c.ragione_sociale}</span>
              {c.partita_iva && (
                <span className="text-xs text-muted-foreground shrink-0">{c.partita_iva}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
