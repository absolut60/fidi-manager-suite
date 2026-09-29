/**
 * Modulo richiesta fido (nuova / modifica / ri-invio) — fonte unica.
 * Usato dalla lista /richieste (nuova richiesta) e dalla pagina della richiesta
 * (modifica, ri-invio). Contiene anche la conferma di modifica e l'annullamento.
 */
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Trash2, AlertCircle, ChevronsUpDown, Paperclip } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty, CommandGroup } from "@/components/ui/command";
import { toast } from "sonner";
import { uploadAllegatoFile, validateAllegatoFile, fmtAllegatoBytes } from "@/components/allegati-section";
import { supabase } from "@/integrations/supabase/client";
import { useConfig } from "@/hooks/use-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATO_LABEL, calcolaLivello, formatEuro, isRichiestaAttiva, determinaTipoRichiesta, importoRichiestaValido, etichettaTipoRichiesta } from "@/lib/fidi";
import { getFidoAttuale } from "@/lib/fido-cliente";
import { PannelloRischioCliente } from "@/components/pannello-rischio-cliente";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATI_IN_APPROVAZIONE_FORM = ["in_approvazione", "in_attesa_liv1", "in_attesa_liv2", "in_attesa_liv3", "integrazioni_richieste"];

/* ============================ FORM (new/edit/riinvia) ============================ */
const formSchema = z.object({
  cliente_id: z.string().uuid("Seleziona un cliente"),
  tipo: z.enum(["nuovo", "nuovo_fido", "aumento", "diminuzione", "rinnovo"]),
  importo_richiesto: z.union([z.literal(""), z.coerce.number().max(99999999)]),
  durata_mesi: z.coerce.number().int().min(1).max(120).default(12),
  motivazione: z.string().trim().max(2000),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
  condizione_pagamento_cod: z.string().trim().max(20).optional().or(z.literal("")),
}).superRefine((v, ctx) => {
  if (v.importo_richiesto === "") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["importo_richiesto"],
      message: "Inserisci l'importo richiesto",
    });
  } else if (!importoRichiestaValido(v.tipo, v.importo_richiesto)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["importo_richiesto"],
      message: "Importo 0 ammesso solo per diminuzione (azzeramento) o rinnovo",
    });
  }
});
type FormVals = z.infer<typeof formSchema>;

export function RichiestaFormDialog({
  richiesta, cloneFrom, onClose, onSaved,
}: { richiesta?: any; cloneFrom?: any; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const seed = richiesta ?? cloneFrom;
  const [form, setForm] = useState<FormVals>({
    cliente_id: seed?.cliente_id ?? "",
    tipo: (seed?.tipo as any) ?? "nuovo",
    importo_richiesto: seed ? Number(seed.importo_richiesto) : "",
    durata_mesi: seed?.durata_mesi ?? 12,
    motivazione: seed?.motivazione ?? "",
    note: seed?.note ?? "",
    condizione_pagamento_cod: seed?.condizione_pagamento_cod ?? "",
  });
  const [openCondPag, setOpenCondPag] = useState(false);
  const [searchCondPag, setSearchCondPag] = useState("");
  const [condPagTouched, setCondPagTouched] = useState<boolean>(!!seed);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [openCliente, setOpenCliente] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; descrizione: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Se editing/clone, il tipo proviene dal record esistente: rispetta la scelta dell'utente.
  // In creazione nuova, il tipo viene calcolato automaticamente finche' l'utente non lo tocca.
  const [tipoTouched, setTipoTouched] = useState<boolean>(!!seed);

  const isEdit = !!richiesta;

  // Debounce search input (~300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const LIMIT = 50;
  // Server-side search across the WHOLE clienti table.
  // Query:
  //   select id, ragione_sociale, codice_gestionale, ... from clienti
  //   where attivo = true
  //     and (ragione_sociale ILIKE %term% OR codice_gestionale ILIKE %term%)
  //   order by ragione_sociale
  //   limit 51   (51 to detect "ci sono altri risultati")
  const { data: clientiSearch, isFetching: isSearching } = useQuery({
    queryKey: ["clienti", "search-richiesta", debouncedSearch],
    enabled: !isEdit && openCliente && debouncedSearch.length >= 2,
    queryFn: async () => {
      const term = debouncedSearch.replace(/[%_,]/g, (m) => `\\${m}`);
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, codice_gestionale, store_id, fido_aziendale_concesso, fido_gestionale, bloccato, in_gestione_legale, scaduto, totale_rischio, fido_residuo, a_scadere, condizioni_pagamento, condizione_pagamento_cod, dilazione_concordata, dilazione_effettiva, num_insoluti, motivo_blocco, cliente_attivo, ultima_data_fatturazione, ultima_sincronizzazione")
        .eq("attivo", true)
        .or(`ragione_sociale.ilike.%${term}%,codice_gestionale.ilike.%${term}%`)
        .order("ragione_sociale")
        .limit(LIMIT + 1);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch selected cliente by id (covers both create and edit) so the preview/summary works.
  const { data: clienteEdit } = useQuery({
    queryKey: ["cliente", "form-richiesta", form.cliente_id],
    enabled: !!form.cliente_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, codice_gestionale, store_id, fido_aziendale_concesso, fido_gestionale, bloccato, in_gestione_legale, scaduto, totale_rischio, fido_residuo, a_scadere, condizioni_pagamento, condizione_pagamento_cod, dilazione_concordata, dilazione_effettiva, num_insoluti, motivo_blocco, cliente_attivo, ultima_data_fatturazione, ultima_sincronizzazione")
        .eq("id", form.cliente_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const clienteSel: any = clienteEdit ?? clientiSearch?.find((c) => c.id === form.cliente_id);
  const fidoAttuale = getFidoAttuale(clienteSel);

  const { data: altreRichiesteAttive } = useQuery({
    queryKey: ["richieste-attive-cliente", form.cliente_id, richiesta?.id],
    enabled: !!form.cliente_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_fido")
        .select("id, tipo, stato, stato_export, importo_richiesto, created_at")
        .eq("cliente_id", form.cliente_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((r) => r.id !== richiesta?.id && isRichiestaAttiva(r));
    },
  });

  // Auto-calcolo TIPO in base al confronto Importo richiesto vs Fido attuale.
  // Regola condivisa: determinaTipoRichiesta di src/lib/fidi.ts (0 -> 0 = rinnovo).
  // Se l'utente ha gia' modificato il campo a mano (tipoTouched), NON sovrascriviamo.
  useEffect(() => {
    if (tipoTouched) return;
    if (!form.cliente_id || form.importo_richiesto === "") return;
    const tipoAuto = determinaTipoRichiesta(fidoAttuale, Number(form.importo_richiesto));
    if (form.tipo !== tipoAuto) setForm((f) => ({ ...f, tipo: tipoAuto }));
  }, [fidoAttuale, form.importo_richiesto, form.cliente_id, tipoTouched, form.tipo]);

  // Lista codici di pagamento (fonte autoritativa = tabella DB).
  const { data: codiciPagamento } = useQuery({
    queryKey: ["codici-pagamento", "all"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("codici_pagamento")
        .select("cod, descrizione")
        .order("cod", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { cod: string; descrizione: string | null }[];
    },
  });
  const codiciSet = new Set((codiciPagamento ?? []).map((c) => c.cod));

  // Default condizione: alla selezione cliente precompila con la sua condizione
  // (se presente in tabella). Se l'utente l'ha gia' toccata, non sovrascrivere.
  useEffect(() => {
    if (condPagTouched) return;
    if (!clienteSel) return;
    const cod = (clienteSel as any).condizione_pagamento_cod as string | null;
    const next = cod && codiciSet.has(cod) ? cod : "";
    if ((form.condizione_pagamento_cod ?? "") !== next) {
      setForm((f) => ({ ...f, condizione_pagamento_cod: next }));
    }
  }, [clienteSel, codiciPagamento, condPagTouched]);

  const condPagFiltered = (codiciPagamento ?? []).filter((c) => {
    const q = searchCondPag.trim().toLowerCase();
    if (!q) return true;
    return c.cod.toLowerCase().includes(q) || (c.descrizione ?? "").toLowerCase().includes(q);
  });
  const condPagSel = (codiciPagamento ?? []).find((c) => c.cod === form.condizione_pagamento_cod) ?? null;



  // Ultimo fido approvato in FidiManager (informativo, per verifica allineamento col gestionale)
  const { data: ultimoApprovato } = useQuery({
    queryKey: ["ultimo-fido-approvato", form.cliente_id],
    enabled: !!form.cliente_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_fido")
        .select("importo_approvato, data_chiusura")
        .eq("cliente_id", form.cliente_id)
        .eq("stato", "approvata")
        .not("importo_approvato", "is", null)
        .order("data_chiusura", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const ultimoApprovatoImp = ultimoApprovato?.importo_approvato != null
    ? Number(ultimoApprovato.importo_approvato) : null;
  const disallineato = ultimoApprovatoImp != null
    && Math.abs(ultimoApprovatoImp - fidoAttuale) > 0.01;

  const importoNum = form.importo_richiesto === "" ? null : Number(form.importo_richiesto);
  const importoValido = importoNum != null && Number.isFinite(importoNum);
  const variazione = fidoAttuale > 0 && importoValido
    ? ((importoNum - fidoAttuale) / fidoAttuale) * 100
    : null;
  const config = useConfig();
  const soglie = { liv1: config.soglia_livello_1, liv2: config.soglia_livello_2 };
  const livelloPreview = importoValido ? calcolaLivello(importoNum, soglie) : null;
  const allResults = clientiSearch ?? [];
  const hasMore = allResults.length > LIMIT;
  const filteredClienti = allResults.slice(0, LIMIT);


  const mut = useMutation({
    mutationFn: async (input: { invia: boolean }) => {
      const parsed = formSchema.parse(form);
      const { data: { user } } = await supabase.auth.getUser();
      const cliente = clienteSel ?? clientiSearch?.find((c) => c.id === parsed.cliente_id);
      const payload = {
        cliente_id: parsed.cliente_id,
        tipo: parsed.tipo,
        store_id: cliente?.store_id ?? null,
        importo_richiesto: parsed.importo_richiesto,
        durata_mesi: parsed.durata_mesi,
        motivazione: parsed.motivazione,
        note: parsed.note || null,
        stato: input.invia ? "in_approvazione" : "bozza",
        data_invio: input.invia ? new Date().toISOString() : null,
        condizione_pagamento_cod: parsed.condizione_pagamento_cod
          ? parsed.condizione_pagamento_cod
          : null,
      } as any;
      let richiestaId: string | null = null;
      if (richiesta?.id) {
        const { error } = await supabase.from("richieste_fido").update(payload).eq("id", richiesta.id);
        if (error) throw error;
        richiestaId = richiesta.id;
      } else {
        const { data: inserted, error } = await supabase
          .from("richieste_fido")
          .insert({ ...payload, created_by: user?.id })
          .select("id")
          .single();
        if (error) throw error;
        richiestaId = inserted?.id ?? null;
      }

      // Upload allegati pending (dopo che la richiesta esiste) — best-effort.
      const allegatiFalliti: string[] = [];
      if (pendingFiles.length && richiestaId) {
        for (const item of pendingFiles) {
          const res = await uploadAllegatoFile({
            file: item.file,
            descrizione: item.descrizione,
            entitaTipo: "richiesta_fido",
            entitaId: richiestaId,
            clienteId: parsed.cliente_id,
            userId: user?.id ?? null,
          });
          if (!res.ok) allegatiFalliti.push(`${item.file.name}: ${res.error}`);
        }
      }
      return { invia: input.invia, allegatiFalliti, richiestaId };
    },
    onSuccess: (res) => {
      if (res.allegatiFalliti.length) {
        toast.warning(
          `Richiesta salvata, ma alcuni allegati non sono stati caricati: ${res.allegatiFalliti.join("; ")}. Riprova dal dettaglio.`,
        );
      } else {
        toast.success(res.invia ? "Richiesta inviata" : "Bozza salvata");
      }
      if (res.richiestaId) {
        qc.invalidateQueries({ queryKey: ["allegati", "richiesta_fido", res.richiestaId] });
      }
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(invia: boolean) {
    const res = formSchema.safeParse(form);
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    mut.mutate({ invia });
  }


  return (
    <DialogContent className="max-w-xl max-h-[90vh] max-h-[90dvh] flex flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>{richiesta ? "Modifica richiesta" : cloneFrom ? "Ri-invia richiesta" : "Nuova richiesta fido"}</DialogTitle>
        <DialogDescription>Compila i dettagli della richiesta.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
        <div className="space-y-1.5">
          <Label>Cliente *</Label>
          {isEdit ? (
            <Input value={clienteSel?.ragione_sociale ?? richiesta?.clienti?.ragione_sociale ?? "Caricamento…"} readOnly disabled />
          ) : (
            <>
              <Popover open={openCliente} onOpenChange={setOpenCliente}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCliente}
                    className="w-full justify-between font-normal"
                  >
                    <span className={clienteSel ? "truncate" : "text-muted-foreground"}>
                      {clienteSel
                        ? `${clienteSel.ragione_sociale}${(clienteSel as any).codice_gestionale ? ` — cod. ${(clienteSel as any).codice_gestionale}` : ""}`
                        : "Seleziona cliente..."}
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Cerca per ragione sociale o codice..."
                      value={search}
                      onValueChange={setSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {debouncedSearch.length < 2
                          ? "Digita almeno 2 caratteri…"
                          : isSearching
                          ? "Ricerca in corso…"
                          : "Nessun cliente trovato"}
                      </CommandEmpty>
                      <CommandGroup>
                        {filteredClienti.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => {
                              setForm({ ...form, cliente_id: c.id });
                              setOpenCliente(false);
                              setSearch("");
                            }}
                            className="flex items-baseline gap-2"
                          >
                            <span className="text-sm truncate flex-1">{c.ragione_sociale}</span>
                            {(c as any).codice_gestionale && (
                              <span className="font-mono text-xs text-muted-foreground shrink-0">
                                cod. {(c as any).codice_gestionale}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                        {hasMore && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            Mostrati primi {LIMIT} risultati. Affina la ricerca…
                          </div>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {errors.cliente_id && <p className="text-xs text-destructive">{errors.cliente_id}</p>}
            </>
          )}
        </div>

        {clienteSel && (
          <PannelloRischioCliente cliente={clienteSel} ultimoApprovatoImp={ultimoApprovatoImp} />
        )}

        {!!altreRichiesteAttive?.length && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs space-y-1.5">
            <p className="font-medium flex items-center gap-1.5">
              <AlertCircle className="size-3.5" /> {altreRichiesteAttive.length} altra{altreRichiesteAttive.length > 1 ? "e" : ""} richiesta{altreRichiesteAttive.length > 1 ? "e" : ""} attiva{altreRichiesteAttive.length > 1 ? "e" : ""} per questo cliente
            </p>
            {altreRichiesteAttive.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2">
                <span>{etichettaTipoRichiesta(r.tipo, Number(r.importo_richiesto))} · {STATO_LABEL[r.stato as keyof typeof STATO_LABEL]} · {formatEuro(Number(r.importo_richiesto))}</span>
                <Link to="/richieste/$richiestaId" params={{ richiestaId: r.id }} target="_blank" rel="noopener" className="text-primary underline shrink-0">Apri ↗</Link>
              </div>
            ))}
          </div>
        )}



        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={(v) => { setTipoTouched(true); setForm({ ...form, tipo: v as any }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nuovo_fido">Nuovo fido</SelectItem>
                <SelectItem value="aumento">Aumento fido</SelectItem>
                <SelectItem value="diminuzione">Diminuzione fido</SelectItem>
                <SelectItem value="rinnovo">Rinnovo fido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Durata (mesi)</Label>
            <Input type="number" min="1" max="120" value={form.durata_mesi}
              onChange={(e) => setForm({ ...form, durata_mesi: Number(e.target.value) })} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Importo richiesto (€) *</Label>
            <Input type="number" step="0.01" min="0" value={form.importo_richiesto}
              onChange={(e) => setForm({ ...form, importo_richiesto: e.target.value === "" ? "" : Number(e.target.value) })} />
            {errors.importo_richiesto && <p className="text-xs text-destructive">{errors.importo_richiesto}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Fido attuale</Label>
            <Input value={formatEuro(fidoAttuale)} disabled />
          </div>
        </div>

        {variazione !== null && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs flex justify-between">
            <span>Variazione</span>
            <span className={`font-medium tabular-nums ${variazione >= 0 ? "text-success" : "text-warning"}`}>
              {variazione >= 0 ? "+" : ""}{variazione.toFixed(1)}%
            </span>
          </div>
        )}
        {livelloPreview && (
          <div className="rounded-md bg-info/5 border border-info/20 px-3 py-2 text-xs">
            Livello approvazione richiesto: <strong>Liv. {livelloPreview}</strong>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Condizione di pagamento</Label>
          <Popover open={openCondPag} onOpenChange={setOpenCondPag}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={openCondPag}
                className="w-full justify-between font-normal"
              >
                <span className={condPagSel ? "truncate" : "text-muted-foreground"}>
                  {condPagSel
                    ? `${condPagSel.cod} — ${condPagSel.descrizione ?? ""}`
                    : "Seleziona condizione di pagamento…"}
                </span>
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Cerca per codice o descrizione…"
                  value={searchCondPag}
                  onValueChange={setSearchCondPag}
                />
                <CommandList>
                  <CommandEmpty>Nessun codice trovato</CommandEmpty>
                  <CommandGroup>
                    {form.condizione_pagamento_cod && (
                      <CommandItem
                        value="__clear__"
                        onSelect={() => {
                          setCondPagTouched(true);
                          setForm((f) => ({ ...f, condizione_pagamento_cod: "" }));
                          setOpenCondPag(false);
                          setSearchCondPag("");
                        }}
                        className="text-muted-foreground italic"
                      >
                        — Nessuna —
                      </CommandItem>
                    )}
                    {condPagFiltered.map((c) => (
                      <CommandItem
                        key={c.cod}
                        value={c.cod}
                        onSelect={() => {
                          setCondPagTouched(true);
                          setForm((f) => ({ ...f, condizione_pagamento_cod: c.cod }));
                          setOpenCondPag(false);
                          setSearchCondPag("");
                        }}
                        className="flex items-baseline gap-2"
                      >
                        <span className="font-mono text-xs shrink-0">{c.cod}</span>
                        <span className="text-sm truncate text-muted-foreground">— {c.descrizione ?? ""}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {clienteSel && (clienteSel as any).condizione_pagamento_cod && (
            <p className="text-[11px] text-muted-foreground">
              Cliente attuale: <span className="font-mono">{(clienteSel as any).condizione_pagamento_cod}</span>
              {" "}— modificabile solo per questa richiesta.
            </p>
          )}
        </div>



        <div className="space-y-1.5">
          <Label>Motivazione</Label>
          <Textarea rows={3} value={form.motivazione}
            onChange={(e) => setForm({ ...form, motivazione: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label>Note interne</Label>
          <Textarea rows={2} value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>

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
              disabled={mut.isPending}
            >
              <Plus className="size-4" /> Allega documento
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
                  if (err) { toast.error(`${f.name}: ${err}`); continue; }
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
                    disabled={mut.isPending}
                    title="Rimuovi"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nessun allegato selezionato. Verranno caricati al salvataggio della richiesta.
            </p>
          )}
        </div>
      </div>

      <DialogFooter className="shrink-0">
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button variant="secondary" disabled={mut.isPending} onClick={() => submit(false)}>Salva bozza</Button>
        <Button disabled={mut.isPending} onClick={() => submit(true)}>
          {mut.isPending ? "..." : "Invia subito"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}



/**
 * Modifica richiesta con la stessa regola della lista storica:
 * bozza (o utente senza diritti estesi) -> apre subito il modulo;
 * altrimenti chiede conferma (richiesta approvata o in approvazione).
 */
export function ModificaRichiestaFidoDialog({
  richiesta, open, onOpenChange, onSaved, riinvia = false,
}: {
  richiesta: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  /** true = "Ri-invia": nuovo modulo precompilato dalla richiesta. */
  riinvia?: boolean;
}) {
  const { user, roles } = useAuth();
  const isOwn = !!user?.id && richiesta?.created_by === user.id;
  const canEditOrDelete = roles.includes("amministratore") || roles.includes("amministrazione") || isOwn;
  const serveConferma = !riinvia && richiesta?.stato !== "bozza" && canEditOrDelete;
  const [confermato, setConfermato] = useState(false);
  useEffect(() => { if (!open) setConfermato(false); }, [open]);

  if (open && serveConferma && !confermato) {
    return (
      <AlertDialog open onOpenChange={(v) => !v && onOpenChange(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {richiesta?.stato === "approvata"
                ? "⚠️ Modificare una richiesta GIÀ APPROVATA?"
                : STATI_IN_APPROVAZIONE_FORM.includes(richiesta?.stato)
                ? "Modificare una richiesta IN APPROVAZIONE?"
                : "Modificare la richiesta?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {richiesta?.stato === "approvata"
                ? "Questa richiesta è già stata approvata e potrebbe essere già stata esportata nel gestionale. Modificarla può creare disallineamenti con il fido già concesso. Procedere?"
                : STATI_IN_APPROVAZIONE_FORM.includes(richiesta?.stato)
                ? "Questa richiesta è in approvazione: modificandola l'iter potrebbe essere interrotto o ripartire da capo. Procedere?"
                : "Procedere con la modifica?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); setConfermato(true); }}>
              Procedi con la modifica
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <RichiestaFormDialog
          richiesta={riinvia ? undefined : richiesta}
          cloneFrom={riinvia ? richiesta : undefined}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

/** Annullamento richiesta (stato -> annullata). Unico punto. */
export function useAnnullaRichiestaFido(onDone: () => void) {
  return useMutation({
    mutationFn: async (r: { id: string }) => {
      const { error } = await supabase.from("richieste_fido").update({ stato: "annullata" }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Richiesta annullata"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
}
