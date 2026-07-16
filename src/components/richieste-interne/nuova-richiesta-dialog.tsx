import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Paperclip, X, ChevronsUpDown } from "lucide-react";
import { notifyRichiestaEvento } from "@/lib/richieste-email.functions";


type Tipo = "preventivo" | "attivita" | "acquisto";

const TIPI: Array<{ value: Tipo; label: string }> = [
  { value: "preventivo", label: "Approvazione preventivo" },
  { value: "attivita", label: "Richiesta attività" },
  { value: "acquisto", label: "Acquisto materiali/servizi" },
];

const BUCKET = "richieste-allegati";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function parseImporto(v: string): number | null {
  const s = v.trim().replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function NuovaRichiestaDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { user, profilo } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [tipo, setTipo] = useState<Tipo>("acquisto");
  const [importo, setImporto] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [sedeId, setSedeId] = useState<string>("");
  const [fornitore, setFornitore] = useState("");
  const [fornitoreOpen, setFornitoreOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const { data: sedi } = useQuery({
    queryKey: ["stores", "select"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id,nome,codice").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: fornitori } = useQuery({
    queryKey: ["fornitori", "select"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("fornitori").select("id,nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const sedeCorrenteId = profilo?.store_id ?? "";
  useEffect(() => {
    if (open && !sedeId && sedeCorrenteId) setSedeId(sedeCorrenteId);
  }, [open, sedeCorrenteId, sedeId]);

  function reset() {
    setTitle(""); setTipo("acquisto"); setImporto(""); setDescrizione("");
    setSedeId(""); setFornitore(""); setFiles([]);
  }

  const fornitoriFiltered = useMemo(() => {
    const q = fornitore.trim().toLowerCase();
    const all = fornitori ?? [];
    if (!q) return all;
    return all.filter((f) => f.nome.toLowerCase().includes(q));
  }, [fornitori, fornitore]);
  const fornitoreExactMatch = (fornitori ?? []).some((f) => f.nome.toLowerCase() === fornitore.trim().toLowerCase());

  async function onSubmit() {
    if (!user?.id) { toast.error("Sessione non valida"); return; }
    if (!title.trim()) { toast.error("Il titolo è obbligatorio"); return; }

    setSaving(true);
    try {
      const requesterName =
        [profilo?.nome, profilo?.cognome].filter(Boolean).join(" ").trim() ||
        profilo?.email || user.email || "Utente";
      const sedeName = sedi?.find((s) => s.id === sedeId)?.nome ?? null;
      const amount = parseImporto(importo);
      const fornitoreTrim = fornitore.trim();

      const { data: inserted, error: insErr } = await supabase
        .from("richieste_interne")
        .insert({
          title: title.trim(),
          type: tipo,
          description: descrizione.trim() || null,
          amount,
          fornitore: fornitoreTrim || null,
          requester_id: user.id,
          requester_name: requesterName,
          sede_id: sedeId || null,
          sede_name: sedeName,
          status: "pending",
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw insErr ?? new Error("Insert fallita");
      const richiestaId = inserted.id;

      // Upsert fornitore lookup (auto-apprendimento)
      if (fornitoreTrim.length > 1) {
        const { error: fErr } = await supabase
          .from("fornitori")
          .upsert({ nome: fornitoreTrim }, { onConflict: "nome", ignoreDuplicates: true });
        if (fErr) console.warn("Upsert fornitore fallito:", fErr.message);
      }

      // Upload allegati (non bloccare la richiesta se un file fallisce)
      let failed = 0;
      for (const f of files) {
        const ts = Date.now();
        const safe = sanitizeFileName(f.name);
        const path = `${richiestaId}/${ts}_${safe}`;
        const up = await supabase.storage.from(BUCKET).upload(path, f, {
          contentType: f.type || undefined,
          upsert: false,
        });
        if (up.error) { failed++; console.error("Upload fallito:", f.name, up.error.message); continue; }
        const { error: aErr } = await supabase.from("richieste_interne_allegati").insert({
          request_id: richiestaId,
          nome_file: f.name,
          dimensione_bytes: f.size,
          mime_type: f.type || null,
          storage_path: path,
          caricato_da: user.id,
        });
        if (aErr) { failed++; console.error("Insert allegato fallita:", aErr.message); }
      }

      // Strato 5: notifica agli approvatori Liv.1 (non blocca in caso di errore)
      try {
        const res = await notifyRichiestaEvento({
          data: {
            event: "new_request",
            richiestaId,
            actor: { id: user.id, nome: requesterName, email: user.email ?? null },
          },
        });
        if (!res.ok) {
          toast.warning(`Notifica non inviata: ${res.err ?? "errore sconosciuto"}`);
        } else if (res.sent === 0) {
          toast.info(res.debug?.motivoZero ?? "Nessun destinatario da notificare");
        } else {
          toast.success(`Notifica inviata a ${res.sent} destinatari`);
        }
      } catch (e) {
        console.error("[email new_request] fallito:", e);
        toast.warning(`Notifica non inviata: ${e instanceof Error ? e.message : String(e)}`);
      }



      if (failed > 0) toast.warning(`Richiesta creata. ${failed} allegato/i non caricato/i.`);
      else toast.success("Richiesta creata");

      qc.invalidateQueries({ queryKey: ["richieste-interne"] });
      reset();
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore imprevisto";
      toast.error(`Salvataggio fallito: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button><Plus className="size-4 mr-1" />Nuova richiesta</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuova richiesta interna</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rq-title">Titolo <span className="text-destructive">*</span></Label>
            <Input id="rq-title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="es. Acquisto laptop per sviluppo backend" maxLength={200} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as Tipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPI.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rq-importo">Importo (€)</Label>
              <Input id="rq-importo" inputMode="decimal" value={importo}
                onChange={(e) => setImporto(e.target.value)} placeholder="0,00" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Fornitore</Label>
              <Popover open={fornitoreOpen} onOpenChange={setFornitoreOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className={fornitore ? "" : "text-muted-foreground"}>
                      {fornitore || "Scrivi il nome del fornitore..."}
                    </span>
                    <ChevronsUpDown className="size-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Cerca o scrivi un nuovo fornitore..."
                      value={fornitore} onValueChange={setFornitore} />
                    <CommandList>
                      <CommandEmpty>
                        {fornitore.trim() ? (
                          <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                            onClick={() => setFornitoreOpen(false)}>
                            Usa "<strong>{fornitore.trim()}</strong>" (nuovo)
                          </button>
                        ) : "Nessun fornitore"}
                      </CommandEmpty>
                      <CommandGroup>
                        {fornitoriFiltered.slice(0, 50).map((f) => (
                          <CommandItem key={f.id} value={f.nome}
                            onSelect={() => { setFornitore(f.nome); setFornitoreOpen(false); }}>
                            {f.nome}
                          </CommandItem>
                        ))}
                        {fornitore.trim() && !fornitoreExactMatch && (
                          <CommandItem value={`__new__${fornitore}`}
                            onSelect={() => setFornitoreOpen(false)}>
                            Usa "<strong className="mx-1">{fornitore.trim()}</strong>" (nuovo)
                          </CommandItem>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Select value={sedeId || "_none"} onValueChange={(v) => setSedeId(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Seleziona sede" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Nessuna —</SelectItem>
                  {(sedi ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}{s.codice ? ` (${s.codice})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rq-desc">Descrizione</Label>
            <Textarea id="rq-desc" value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Descrizione..." rows={4} maxLength={5000} />
          </div>

          <div className="space-y-1.5">
            <Label>Allegati</Label>
            <div className="flex items-center gap-2">
              <Input id="rq-files" type="file" multiple
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  setFiles((prev) => [...prev, ...list]);
                  e.currentTarget.value = "";
                }} />
            </div>
            {files.length > 0 && (
              <ul className="space-y-1 mt-2">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                    <span className="inline-flex items-center gap-2 truncate">
                      <Paperclip className="size-3 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-muted-foreground shrink-0">({fmtSize(f.size)})</span>
                    </span>
                    <button type="button" onClick={() => setFiles((prev) => prev.filter((_, k) => k !== i))}
                      className="text-muted-foreground hover:text-destructive" aria-label="Rimuovi">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button>
          <Button onClick={onSubmit} disabled={saving || !title.trim()}>
            {saving ? "Salvataggio…" : "Crea richiesta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
