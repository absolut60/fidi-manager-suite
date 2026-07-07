// 1) Livello 1/2  2) Selezione scadenze aperte  3) Rate libere (no vincolo)
// 4) Note  →  Salva (crea piano, documenti, rate + registra azione recupero).
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { fmtEuro } from "@/lib/piani-rientro";
import { SelettoreScadenzeAperte, type ScadenzaAperta } from "@/components/selettore-scadenze-aperte";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  clienteLabel?: string;
  onCreated?: (pianoId: string) => void;
};

// ScadenzaAperta ora è importata da @/components/selettore-scadenze-aperte.

type RataForm = { data: string; importo: string };

function todayISO(): string {
  const d = new Date(); return d.toISOString().slice(0, 10);
}
function addDaysISO(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function PianoRientroNuovoDialog({ open, onOpenChange, clienteId, clienteLabel, onCreated }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [livello, setLivello] = useState<1 | 2>(1);
  const [selectedScadenze, setSelectedScadenze] = useState<Set<string>>(new Set());
  const [rate, setRate] = useState<RataForm[]>([{ data: addDaysISO(30), importo: "" }]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Scadenze aperte + totale selezionato sono gestiti dal componente
  // SelettoreScadenzeAperte (fonte unica). Qui teniamo solo lo specchio
  // necessario al salvataggio (importo_alla_selezione per ogni riga scelta).
  const [scadenzeCaricate, setScadenzeCaricate] = useState<ScadenzaAperta[]>([]);
  const [totaleSelezionato, setTotaleSelezionato] = useState<number>(0);
  const handleSelettoreState = useCallback(
    (info: { scadenze: ScadenzaAperta[]; totaleSelezionato: number }) => {
      setScadenzeCaricate(info.scadenze);
      setTotaleSelezionato(info.totaleSelezionato);
    },
    [],
  );

  const totaleRate = useMemo(() => {
    return rate.reduce((acc, r) => {
      const n = Number(String(r.importo).replace(",", "."));
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [rate]);

  const diff = totaleRate - totaleSelezionato;

  function reset() {
    setLivello(1);
    setSelectedScadenze(new Set());
    setRate([{ data: addDaysISO(30), importo: "" }]);
    setNote("");
    setSaving(false);
  }

  // toggleScadenza / toggleAll ora sono gestiti internamente dal
  // componente SelettoreScadenzeAperte tramite selectedScadenze/onChange.

  function aggiungiRata() {
    setRate((r) => [...r, { data: addDaysISO(30 * (r.length + 1)), importo: "" }]);
  }
  function rimuoviRata(idx: number) {
    setRate((r) => r.filter((_, i) => i !== idx));
  }
  function updateRata(idx: number, patch: Partial<RataForm>) {
    setRate((r) => r.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  async function handleSubmit() {
    if (saving) return;
    if (selectedScadenze.size === 0) { toast.error("Seleziona almeno una scadenza"); return; }
    if (rate.length === 0) { toast.error("Definisci almeno una rata"); return; }
    for (let i = 0; i < rate.length; i++) {
      if (!rate[i].data) { toast.error(`Rata ${i + 1}: data mancante`); return; }
      const n = Number(String(rate[i].importo).replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) { toast.error(`Rata ${i + 1}: importo non valido`); return; }
    }

    setSaving(true);
    try {
      // 1) crea piano
      const pianoPayload = {
        cliente_id: clienteId,
        livello,
        stato: "attivo",
        note: note.trim() || null,
        creato_da: user?.id ?? null,
      };
      const { data: piano, error: eP } = await supabase
        .from("piani_rientro" as never)
        .insert(pianoPayload as never)
        .select("id")
        .single();
      if (eP) throw eP;
      const pianoId = (piano as { id: string }).id;

      // 2) documenti
      const docsRows = Array.from(selectedScadenze).map((sid) => {
        const s = scadenzeCaricate.find((x) => x.id === sid);
        return {
          piano_id: pianoId,
          scadenza_id: sid,
          importo_alla_selezione: s ? Number(s.importo_scadenza ?? 0) : null,
        };
      });
      const { error: eD } = await supabase
        .from("piani_rientro_documenti" as never)
        .insert(docsRows as never);
      if (eD) throw eD;

      // 3) rate
      const rateRows = rate.map((r, idx) => ({
        piano_id: pianoId,
        numero_rata: idx + 1,
        data_rata: r.data,
        importo: Number(String(r.importo).replace(",", ".")),
        stato: "da_pagare",
      }));
      const { error: eR } = await supabase
        .from("piani_rientro_rate" as never)
        .insert(rateRows as never);
      if (eR) throw eR;

      // 4) registra azione nello storico (stesso pattern promessa) — collegata
      //    al piano tramite piano_rientro_id: quando il piano viene eliminato,
      //    l'azione viene cancellata in cascade.
      await supabase.from("azioni_recupero").insert({
        cliente_id: clienteId,
        operatore_id: user?.id ?? null,
        tipo: "nota",
        esito: "piano_rientro",
        data_azione: new Date().toISOString(),
        importo_riferimento: totaleSelezionato,
        piano_rientro_id: pianoId,
        note: `Piano di rientro L${livello} creato: ${selectedScadenze.size} documenti, ${rate.length} rate, totale rate ${totaleRate.toFixed(2)} €.${note.trim() ? ` Note: ${note.trim()}` : ""}`,
      } as never);

      toast.success("Piano di rientro creato");
      qc.invalidateQueries({ queryKey: ["piani-cliente", clienteId] });
      qc.invalidateQueries({ queryKey: ["piani-rientro-lista"] });
      qc.invalidateQueries({ queryKey: ["scadenziario-lista"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", clienteId] });
      qc.invalidateQueries({ queryKey: ["azioni-calendario"] });
      onCreated?.(pianoId);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  const allSelected = (scadenze ?? []).length > 0 && (scadenze ?? []).every((s) => selectedScadenze.has(s.id));
  const someSelected = selectedScadenze.size > 0 && !allSelected;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { if (!v) reset(); onOpenChange(v); } }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-5" /> Nuovo piano di rientro
          </DialogTitle>
          <DialogDescription>
            Cliente: <strong>{clienteLabel ?? clienteId}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 1. Livello */}
          <div>
            <Label className="text-sm font-semibold">1. Livello</Label>
            <RadioGroup value={String(livello)} onValueChange={(v) => setLivello(Number(v) as 1 | 2)} className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="1" /> Livello 1
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="2" /> Livello 2
              </label>
            </RadioGroup>
          </div>

          {/* 2. Documenti */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">2. Documenti (scadenze aperte)</Label>
              <div className="text-sm">
                Totale selezionato: <strong className="tabular-nums">{fmtEuro(totaleSelezionato)}</strong>
                {" · "}<span className="text-muted-foreground">{selectedScadenze.size} righe</span>
              </div>
            </div>
            <div className="border rounded-md max-h-72 overflow-y-auto">
              {isLoading ? <Skeleton className="h-24 m-2" /> : (scadenze ?? []).length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground italic">Nessuna scadenza aperta per questo cliente.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={(v) => toggleAll(!!v)}
                        />
                      </TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Data scadenza</TableHead>
                      <TableHead className="text-right">Importo</TableHead>
                      <TableHead className="text-right">gg ritardo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(scadenze ?? []).map((s) => {
                      const sel = selectedScadenze.has(s.id);
                      const altriPiani = scadenzeInAltriPiani.get(s.id) ?? [];
                      return (
                        <TableRow key={s.id} className="cursor-pointer" onClick={() => toggleScadenza(s.id)}>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={sel} onCheckedChange={() => toggleScadenza(s.id)} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{s.numero_documento ?? "—"}</span>
                              {altriPiani.length > 0 && (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-[10px] font-normal"
                                  title={altriPiani
                                    .map((p: { piano_id: string; created_at: string; stato: string }) => `Piano del ${fmtDate(p.created_at)} — ${p.stato}`)
                                    .join("\n")}
                                >
                                  già in {altriPiani.length === 1 ? "un piano" : `${altriPiani.length} piani`} del {fmtDate(altriPiani[0].created_at)}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{fmtDate(s.data_scadenza)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtEuro(s.importo_scadenza)}</TableCell>
                          <TableCell className="text-right">
                            {(s.giorni_ritardo ?? 0) > 0 ? (
                              <Badge className="bg-orange-500 text-white hover:bg-orange-500">{s.giorni_ritardo} gg</Badge>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {/* 3. Rate */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">3. Rate</Label>
              <Button size="sm" variant="outline" onClick={aggiungiRata} type="button">
                <Plus className="size-4" /> Aggiungi rata
              </Button>
            </div>
            <div className="space-y-2">
              {rate.map((r, idx) => (
                <div key={idx} className="flex items-end gap-2 border rounded-md p-2">
                  <div className="w-10 text-center text-sm font-medium text-muted-foreground">#{idx + 1}</div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Data rata</Label>
                    <Input type="date" value={r.data} onChange={(e) => updateRata(idx, { data: e.target.value })} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Importo (€)</Label>
                    <Input type="number" inputMode="decimal" step="0.01" min="0"
                      value={r.importo} onChange={(e) => updateRata(idx, { importo: e.target.value })} />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => rimuoviRata(idx)} type="button"
                    className="text-destructive hover:text-destructive" disabled={rate.length === 1}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2 text-sm px-1">
              Distribuito <strong className="tabular-nums">{fmtEuro(totaleRate)}</strong> di{" "}
              <strong className="tabular-nums">{fmtEuro(totaleSelezionato)}</strong>
              {Math.abs(diff) > 0.005 && (
                <Badge variant="outline" className={`ml-2 ${diff > 0 ? "border-orange-500 text-orange-700" : "border-blue-500 text-blue-700"}`}>
                  Differenza {diff > 0 ? "+" : ""}{fmtEuro(diff)}
                </Badge>
              )}
              <div className="text-xs text-muted-foreground mt-0.5">
                La somma delle rate può differire liberamente dal totale documenti (es. spese o sconti). Nessun vincolo.
              </div>
            </div>
          </div>

          {/* 4. Note */}
          <div>
            <Label className="text-sm font-semibold">4. Note</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Accordi, riferimenti, dettagli…" className="mt-1" />
            <div className="text-xs text-muted-foreground mt-1">Puoi allegare il piano firmato dopo aver salvato.</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={saving || selectedScadenze.size === 0 || rate.length === 0}>
            {saving ? "Salvataggio…" : "Crea piano"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
