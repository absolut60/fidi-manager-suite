import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Paperclip, X, ChevronsUpDown, Check, Truck, Euro, Banknote, Calendar, AlertTriangle, CheckCircle2, Bell, Receipt } from "lucide-react";
import { STILE_TIPO, STILE_ACCONTO, STILE_ALLEGATI } from "@/components/richieste-interne/stili";
import { notifyRichiestaEvento } from "@/lib/richieste-email.functions";
import { RICHIESTE_ALLEGATI_BUCKET as BUCKET, sanitizeFileName } from "@/components/richieste-interne/utils";


type Tipo = "preventivo" | "attivita" | "acquisto";

const TIPI: Array<{ value: Tipo; breve: string }> = [
  { value: "preventivo", breve: "Preventivo" },
  { value: "attivita", breve: "Attività" },
  { value: "acquisto", breve: "Acquisto" },
];
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
function formatImporto(n: number | null | undefined): string {
  if (n == null) return "";
  return String(n).replace(".", ",");
}

export type RichiestaEditInitial = {
  id: string;
  title: string;
  type: Tipo;
  amount: number | null;
  fornitore: string | null;
  sede_id: string | null;
  description: string | null;
  acconto_richiesto?: boolean;
  acconto_importo?: number | null;
  acconto_data_prevista?: string | null;
};

function oggiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NuovaRichiestaDialog({
  trigger,
  mode = "create",
  initial,
  open: openProp,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  mode?: "create" | "edit";
  initial?: RichiestaEditInitial;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const isEdit = mode === "edit";
  const { user, profilo } = useAuth();
  const qc = useQueryClient();

  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setOpenInternal(v);
  };
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [tipo, setTipo] = useState<Tipo>("acquisto");
  const [importo, setImporto] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [sedeId, setSedeId] = useState<string>("");
  const [fornitore, setFornitore] = useState("");
  const [fornitoreOpen, setFornitoreOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [acconto, setAcconto] = useState(false);
  const [accontoImporto, setAccontoImporto] = useState("");
  const [accontoData, setAccontoData] = useState("");

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

  // Prefill / reset when dialog opens
  useEffect(() => {
    if (!open) return;
    if (isEdit && initial) {
      setTitle(initial.title ?? "");
      setTipo((initial.type as Tipo) ?? "acquisto");
      setImporto(formatImporto(initial.amount));
      setDescrizione(initial.description ?? "");
      setSedeId(initial.sede_id ?? "");
      setFornitore(initial.fornitore ?? "");
      setFiles([]);
      setAcconto(!!initial.acconto_richiesto);
      setAccontoImporto(initial.acconto_importo != null
        ? initial.acconto_importo.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "");
      setAccontoData(initial.acconto_data_prevista ?? "");
    } else if (!isEdit) {
      if (!sedeId && sedeCorrenteId) setSedeId(sedeCorrenteId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, initial?.id]);

  function reset() {
    setTitle(""); setTipo("acquisto"); setImporto(""); setDescrizione("");
    setSedeId(""); setFornitore(""); setFiles([]);
    setAcconto(false); setAccontoImporto(""); setAccontoData("");
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

    // Bonifico di acconto (FM48): coerente con il CHECK richieste_interne_acconto_coerenza.
    let accontoPatch: {
      acconto_richiesto: boolean;
      acconto_importo: number | null;
      acconto_data_prevista: string | null;
      acconto_stato: "da_eseguire" | null;
    } = { acconto_richiesto: false, acconto_importo: null, acconto_data_prevista: null, acconto_stato: null };
    if (acconto) {
      const imp = parseImporto(accontoImporto);
      if (imp == null || imp <= 0) { toast.error("Importo acconto non valido: deve essere maggiore di zero"); return; }
      const impArr = Math.round(imp * 100) / 100;
      if (accontoData && accontoData < oggiIso()) { toast.error("La data prevista del bonifico non può essere nel passato"); return; }
      accontoPatch = {
        acconto_richiesto: true,
        acconto_importo: impArr,
        acconto_data_prevista: accontoData || null,
        acconto_stato: "da_eseguire",
      };
    }

    setSaving(true);
    try {
      const sedeName = sedi?.find((s) => s.id === sedeId)?.nome ?? null;
      const amount = parseImporto(importo);
      const fornitoreTrim = fornitore.trim();

      if (isEdit && initial) {
        const { error: updErr } = await supabase
          .from("richieste_interne")
          .update({
            title: title.trim(),
            type: tipo,
            description: descrizione.trim() || null,
            amount,
            fornitore: fornitoreTrim || null,
            sede_id: sedeId || null,
            sede_name: sedeName,
            ...accontoPatch,
            updated_at: new Date().toISOString(),
          })
          .eq("id", initial.id);
        if (updErr) throw updErr;

        if (fornitoreTrim.length > 1) {
          const { error: fErr } = await supabase
            .from("fornitori")
            .upsert({ nome: fornitoreTrim }, { onConflict: "nome", ignoreDuplicates: true });
          if (fErr) console.warn("Upsert fornitore fallito:", fErr.message);
        }

        toast.success("Richiesta aggiornata");
        qc.invalidateQueries({ queryKey: ["richieste-interne"] });
        qc.invalidateQueries({ queryKey: ["richiesta-interna", initial.id] });
        setOpen(false);
        return;
      }

      const requesterName =
        [profilo?.nome, profilo?.cognome].filter(Boolean).join(" ").trim() ||
        profilo?.email || user.email || "Utente";

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
          ...accontoPatch,
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw insErr ?? new Error("Insert fallita");
      const richiestaId = inserted.id;

      if (fornitoreTrim.length > 1) {
        const { error: fErr } = await supabase
          .from("fornitori")
          .upsert({ nome: fornitoreTrim }, { onConflict: "nome", ignoreDuplicates: true });
        if (fErr) console.warn("Upsert fornitore fallito:", fErr.message);
      }

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

      try {
        const res = await notifyRichiestaEvento({
          data: {
            event: "new_request",
            richiestaId,
            actor: { id: user.id, nome: requesterName, email: user.email ?? null },
          },
        });
        if (!res.ok) {
          console.warn("[notifica new_request] enqueue fallito:", res.err);
        }
      } catch (e) {
        console.error("[email new_request] fallito:", e);
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

  const stileT = STILE_TIPO[tipo] ?? STILE_TIPO.acquisto;
  const IconaTipo = stileT.icona;
  const stileAcc = STILE_ACCONTO.da_eseguire;
  const stileAvviso = STILE_ACCONTO.in_ritardo;
  const importoNum = parseImporto(importo);
  const accontoNum = parseImporto(accontoImporto);
  const accontoSupera = acconto && importoNum != null && accontoNum != null && accontoNum > importoNum;
  const fmtIt = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function onTipoKey(e: React.KeyboardEvent, idx: number) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % TIPI.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + TIPI.length) % TIPI.length;
    if (next < 0) return;
    e.preventDefault();
    setTipo(TIPI[next].value);
    const el = document.getElementById(`rq-tipo-${TIPI[next].value}`);
    el?.focus();
  }

  const Sezione = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v && !isEdit) reset(); }}>
      {!isEdit && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button><Plus className="size-4 mr-1" />Nuova richiesta</Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className={`max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-0 gap-0 border-t-4 ${stileT.bordoAlto} max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none flex flex-col`}>
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 text-left">
          <div className="flex items-start gap-3 pr-8">
            <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full ${stileT.tinta}`}>
              <IconaTipo className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="break-words">{isEdit ? "Modifica richiesta" : "Nuova richiesta interna"}</DialogTitle>
              <DialogDescription className="mt-1">
                Compila i dati: verrà inviata al Responsabile per l'approvazione
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-6 px-4 sm:px-6 pb-4 min-w-0">
          <div className="space-y-2">
            <Label id="rq-tipo-label">Tipo</Label>
            <div role="radiogroup" aria-labelledby="rq-tipo-label" className="grid grid-cols-3 gap-2">
              {TIPI.map((t, idx) => {
                const st = STILE_TIPO[t.value];
                const Ic = st.icona;
                const sel = tipo === t.value;
                return (
                  <button key={t.value} id={`rq-tipo-${t.value}`} type="button" role="radio"
                    aria-checked={sel} aria-label={st.label} tabIndex={sel ? 0 : -1}
                    onClick={() => setTipo(t.value)} onKeyDown={(e) => onTipoKey(e, idx)}
                    className={`relative flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sel ? st.fascia : "border-border bg-background hover:bg-muted/50"}`}>
                    {sel && <Check className="absolute right-1.5 top-1.5 size-4" aria-hidden />}
                    <span className={`inline-flex size-8 items-center justify-center rounded-full ${st.tinta}`}>
                      <Ic className="size-4" />
                    </span>
                    <span className="text-xs sm:text-sm font-medium leading-tight break-words">{t.breve}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{stileT.label}</p>
          </div>

          <section className="space-y-3">
            <Sezione>Cosa e da chi</Sezione>
            <div className="space-y-1.5">
              <Label htmlFor="rq-title">Titolo <span className="text-destructive">*</span></Label>
              <Input id="rq-title" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="es. Acquisto laptop per sviluppo backend" maxLength={200} className="h-10" />
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border p-3 ${stileT.fascia}`}>
              <div className="space-y-1.5 min-w-0">
                <Label className="inline-flex items-center gap-1.5"><Truck className="size-4" />Fornitore</Label>
                <Popover open={fornitoreOpen} onOpenChange={setFornitoreOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="h-12 w-full justify-between font-normal text-base sm:text-lg bg-background text-foreground">
                      <span className={`min-w-0 truncate ${fornitore ? "" : "text-muted-foreground text-sm sm:text-base"}`}>
                        {fornitore || "Scrivi il nome del fornitore..."}
                      </span>
                      <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
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

              <div className="space-y-1.5 min-w-0">
                <Label htmlFor="rq-importo" className="inline-flex items-center gap-1.5"><Euro className="size-4" />Importo (€)</Label>
                <Input id="rq-importo" inputMode="decimal" value={importo}
                  className="h-12 text-lg text-right bg-background text-foreground"
                  onChange={(e) => setImporto(e.target.value)}
                  onBlur={() => { const n = parseImporto(importo); if (n != null) setImporto(fmtIt(n)); }}
                  placeholder="0,00" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <Sezione>Dove</Sezione>
            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Select value={sedeId || "_none"} onValueChange={(v) => setSedeId(v === "_none" ? "" : v)}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Seleziona sede" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Nessuna —</SelectItem>
                  {(sedi ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-3">
            <Sezione>Dettagli</Sezione>
            <div className="space-y-1.5">
              <Label htmlFor="rq-desc">Descrizione</Label>
              <Textarea id="rq-desc" value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                placeholder="Descrivi cosa serve e perché…" rows={4} maxLength={5000} />
            </div>
          </section>

          <div className={`space-y-3 rounded-lg border p-3 ${acconto ? `border-l-4 ${stileAcc.bordo} ${stileAcc.fascia}` : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="rq-acconto" className="cursor-pointer inline-flex items-center gap-2 min-w-0">
                <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ${stileAcc.tinta}`}>
                  <Banknote className="size-4" />
                </span>
                <span className="break-words">Richiesta bonifico di acconto</span>
              </Label>
              <Switch id="rq-acconto" checked={acconto} onCheckedChange={setAcconto} className="shrink-0" />
            </div>
            {acconto && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <Label htmlFor="rq-acc-imp" className="inline-flex items-center gap-1.5"><Banknote className="size-4" />Importo acconto (€) <span className="text-destructive">*</span></Label>
                    <Input id="rq-acc-imp" inputMode="decimal" value={accontoImporto} className="h-10 text-right bg-background text-foreground"
                      onChange={(e) => setAccontoImporto(e.target.value)}
                      onBlur={() => {
                        const n = parseImporto(accontoImporto);
                        if (n != null && n > 0) setAccontoImporto(fmtIt(n));
                      }}
                      placeholder="0,00" />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <Label htmlFor="rq-acc-data" className="inline-flex items-center gap-1.5"><Calendar className="size-4" />Data prevista del bonifico</Label>
                    <Input id="rq-acc-data" type="date" min={oggiIso()} value={accontoData} className="h-10 bg-background text-foreground"
                      onChange={(e) => setAccontoData(e.target.value)} />
                  </div>
                </div>

                {accontoSupera && (
                  <div role="status" className={`flex items-start gap-2 rounded-md border p-2 text-sm ${stileAvviso.fascia}`}>
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span className="min-w-0 break-words">L'acconto è maggiore dell'importo della richiesta: verifica</span>
                  </div>
                )}

                <div className="rounded-md border bg-background p-3 text-foreground">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cosa succede</p>
                  <ol className="space-y-2.5 text-sm">
                    {[
                      { Ic: CheckCircle2, t: "La richiesta viene approvata dal Responsabile (o dalla Direzione, se inoltrata)." },
                      { Ic: Bell, t: "La tesoreria riceve un'email e una notifica per eseguire il bonifico. Se il bonifico non è ancora fatto, alla data prevista riceve un promemoria." },
                      { Ic: Receipt, t: "Quando il bonifico è eseguito ricevi un'email e una notifica \"Bonifico di acconto eseguito\", con la ricevuta CRO nella richiesta." },
                    ].map(({ Ic, t }, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${stileAcc.tinta}`}>{i + 1}</span>
                        <Ic className="size-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 break-words">{t}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="rq-files">Allegati</Label>
              <label htmlFor="rq-files"
                className="flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center text-sm text-muted-foreground hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring">
                <Paperclip className="size-5" />
                <span className="break-words">Aggiungi allegati (preventivi, offerte, foto)</span>
                <input id="rq-files" type="file" multiple className="sr-only"
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    setFiles((prev) => [...prev, ...list]);
                    e.currentTarget.value = "";
                  }} />
              </label>
              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ${STILE_ALLEGATI.tinta}`}>
                        <Paperclip className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-all line-clamp-2">{f.name}</span>
                        <span className="block text-xs text-muted-foreground">{fmtSize(f.size)}</span>
                      </span>
                      <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setFiles((prev) => prev.filter((_, k) => k !== i))} aria-label={`Rimuovi ${f.name}`}>
                        <X className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {isEdit && (
            <p className="text-xs text-muted-foreground">
              Gli allegati si gestiscono dalla sezione "Allegati" della richiesta.
            </p>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 z-10 mt-auto flex-col-reverse gap-2 border-t bg-background px-4 sm:px-6 py-3 sm:flex-row sm:space-x-0">
          <Button variant="outline" className="h-10 w-full sm:w-auto" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button>
          <Button className="h-10 w-full sm:w-auto" onClick={onSubmit} disabled={saving || !title.trim() || (acconto && !(parseImporto(accontoImporto) ?? 0))}>
            {saving ? "Salvataggio…" : isEdit ? "Salva modifiche" : "Crea richiesta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
