import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Star, Check, X, Plus } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SignaturePad, getCanvasDataURL } from "@/components/signature-pad";
import { generaPdfPrivacy } from "@/lib/privacy-pdf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/contatti")({
  component: ContattiPage,
});

const contattoSchema = z.object({
  cliente_id: z.string().uuid({ message: "Seleziona un cliente" }),
  nome: z.string().min(1, "Nome obbligatorio"),
  cognome: z.string().optional(),
  ruolo: z.string().optional(),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  telefono: z.string().optional(),
  cellulare: z.string().optional(),
  principale: z.boolean().default(false),
});

type ClienteInfo = {
  ragione_sociale: string;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  indirizzo?: string | null;
  citta?: string | null;
};

function CB({ ok }: { ok: boolean }) {
  return ok
    ? <Badge className="bg-success/15 text-success border-success/30"><Check className="size-3" /></Badge>
    : <Badge variant="outline" className="text-muted-foreground"><X className="size-3" /></Badge>;
}

function fmtDate(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("it-IT"); } catch { return String(v); }
}

function ContattiPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = useAuth();
  const isStoreManager = role === "store_manager";
  const [search, setSearch] = useState("");
  const [storeId, setStoreId] = useState("all");
  const [clienteId, setClienteId] = useState("all");
  const [statoConsenso, setStatoConsenso] = useState("tutti");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [nuovoContattoId, setNuovoContattoId] = useState<string | null>(null);
  const [nuovoClienteInfo, setNuovoClienteInfo] = useState<ClienteInfo | null>(null);
  const padRef = useRef<HTMLDivElement | null>(null);
  const [hasSig, setHasSig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cliente_id: "", nome: "", cognome: "", ruolo: "",
    email: "", telefono: "", cellulare: "", principale: false,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [clienteSearch, setClienteSearch] = useState("");
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const [clienteLabel, setClienteLabel] = useState("");

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clientiList } = useQuery({
    queryKey: ["clienti-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, codice_gestionale, partita_iva, codice_fiscale, indirizzo, citta")
        .order("ragione_sociale");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["contatti-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("*, clienti!inner(id, ragione_sociale, store_id, stores(nome))")
        .order("principale", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientiOptions = useMemo(() => {
    const m = new Map<string, string>();
    (data ?? []).forEach((c: any) => {
      if (c.clienti) m.set(c.clienti.id, c.clienti.ragione_sociale);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const filtered = useMemo(() => {
    return (data ?? []).filter((c: any) => {
      if (storeId !== "all" && c.clienti?.store_id !== storeId) return false;
      if (clienteId !== "all" && c.clienti?.id !== clienteId) return false;
      const n = (c.consenso_profilazione ? 1 : 0)
        + (c.consenso_marketing_media ? 1 : 0)
        + (c.consenso_marketing_diretto ? 1 : 0);
      if (statoConsenso === "almeno_uno" && n === 0) return false;
      if (statoConsenso === "nessuno" && n > 0) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${c.nome ?? ""} ${c.cognome ?? ""} ${c.email ?? ""} ${c.clienti?.ragione_sociale ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, storeId, clienteId, statoConsenso]);

  function resetDialog() {
    setStep(1);
    setNuovoContattoId(null);
    setNuovoClienteInfo(null);
    setForm({ cliente_id: "", nome: "", cognome: "", ruolo: "", email: "", telefono: "", cellulare: "", principale: false });
    setFormErrors({});
    setClienteLabel("");
    setClienteSearch("");
    setHasSig(false);
  }

  async function handleSalvaAnagrafica() {
    const result = contattoSchema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((e) => { if (e.path[0]) errs[String(e.path[0])] = e.message; });
      setFormErrors(errs);
      return;
    }
    try {
      const payload = {
        cliente_id: form.cliente_id,
        nome: form.nome,
        cognome: form.cognome || null,
        ruolo: form.ruolo || null,
        email: form.email || null,
        telefono: form.telefono || null,
        cellulare: form.cellulare || null,
        principale: form.principale,
      };
      const { data: inserted, error } = await supabase
        .from("contatti")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!inserted) throw new Error("Inserimento non riuscito");
      setNuovoContattoId(inserted.id);
      toast.success("Contatto creato");
      qc.invalidateQueries({ queryKey: ["contatti-all"] });
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    }
  }

  async function handleSalvaFirma() {
    if (!padRef.current || !nuovoContattoId || !nuovoClienteInfo) return;
    const dataUrl = getCanvasDataURL(padRef.current);
    if (!dataUrl) { toast.error("Inserisci la firma"); return; }
    setSaving(true);
    try {
      const now = new Date();
      const pngBlob = await (await fetch(dataUrl)).blob();
      const firmaPath = `contatti/${nuovoContattoId}/firma-${now.getTime()}.png`;
      const { error: e1 } = await supabase.storage.from("firme").upload(firmaPath, pngBlob, { upsert: true, contentType: "image/png" });
      if (e1) throw new Error(`Upload firma: ${e1.message}`);
      const { data: firmaSigned, error: eFirmaSigned } = await supabase.storage
        .from("firme")
        .createSignedUrl(firmaPath, 60 * 60 * 24 * 365 * 10);
      if (eFirmaSigned || !firmaSigned?.signedUrl) throw new Error("Errore URL firma");

      const pdfBytes = await generaPdfPrivacy({
        ragioneSociale: nuovoClienteInfo.ragione_sociale,
        partitaIva: nuovoClienteInfo.partita_iva,
        codiceFiscale: nuovoClienteInfo.codice_fiscale,
        indirizzo: nuovoClienteInfo.indirizzo,
        citta: nuovoClienteInfo.citta,
        email: form.email || undefined,
        firmaPngDataUrl: dataUrl,
        dataFirma: now,
      });
      const pdfPath = `contatti/${nuovoContattoId}/privacy-${now.getTime()}.pdf`;
      const { error: e2 } = await supabase.storage.from("documenti-privacy")
        .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (e2) throw new Error(`Upload PDF: ${e2.message}`);
      const { data: pdfSigned, error: ePdfSigned } = await supabase.storage
        .from("documenti-privacy")
        .createSignedUrl(pdfPath, 60 * 60 * 24 * 365 * 10);
      if (ePdfSigned || !pdfSigned?.signedUrl) throw new Error("Errore URL PDF");

      const { error: e3 } = await supabase.from("contatti").update({
        privacy_firmata: true,
        data_firma: now.toISOString(),
        firma_url: firmaSigned.signedUrl,
        pdf_privacy_url: pdfSigned.signedUrl,
        pdf_privacy_path: pdfPath,
      }).eq("id", nuovoContattoId);
      if (e3) throw new Error(`Salvataggio: ${e3.message}`);

      toast.success("Privacy firmata e PDF generato");
      qc.invalidateQueries({ queryKey: ["contatti-all"] });
      resetDialog();
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio firma");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="size-7 text-primary" /> Contatti
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Referenti collegati ai clienti con stato consensi privacy
          </p>
        </div>
        <Button onClick={() => { resetDialog(); setDialogOpen(true); }} className="gap-2">
          <Plus className="size-4" /> Nuovo contatto
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca nome, email o cliente..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-56">
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i clienti</SelectItem>
                {clientiOptions.map(([id, nome]) => (
                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isStoreManager && (
            <div className="w-56">
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Store" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli store</SelectItem>
                  {stores?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="w-56">
            <Select value={statoConsenso} onValueChange={setStatoConsenso}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i consensi</SelectItem>
                <SelectItem value="almeno_uno">Almeno uno firmato</SelectItem>
                <SelectItem value="nessuno">Nessuno firmato</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nessun contatto trovato</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cellulare</TableHead>
                <TableHead className="text-center">Profilaz.</TableHead>
                <TableHead className="text-center">Marketing</TableHead>
                <TableHead className="text-center">WhatsApp</TableHead>
                <TableHead>Data firma</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c: any) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate({
                    to: "/clienti/$clienteId",
                    params: { clienteId: c.clienti.id },
                    search: { tab: "contatti" },
                  })}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {c.principale && <Star className="size-3 fill-accent text-accent" />}
                      {c.nome} {c.cognome}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.clienti?.ragione_sociale}
                    <div className="text-xs text-muted-foreground">{c.clienti?.stores?.nome ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.ruolo ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.cellulare ?? "—"}</TableCell>
                  <TableCell className="text-center"><CB ok={!!c.consenso_profilazione} /></TableCell>
                  <TableCell className="text-center"><CB ok={!!c.consenso_marketing_media} /></TableCell>
                  <TableCell className="text-center"><CB ok={!!c.consenso_marketing_diretto} /></TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(c.data_firma)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetDialog(); setDialogOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{step === 1 ? "Nuovo contatto" : "Firma privacy"}</DialogTitle>
            <div className="flex items-center gap-2 text-xs mt-2">
              <span className={cn("px-2 py-1 rounded-full border", step === 1 ? "bg-primary/10 border-primary/30 text-primary font-medium" : "bg-muted text-muted-foreground")}>
                1 Anagrafica
              </span>
              <span className="text-muted-foreground">→</span>
              <span className={cn("px-2 py-1 rounded-full border", step === 2 ? "bg-primary/10 border-primary/30 text-primary font-medium" : "bg-muted text-muted-foreground")}>
                2 Privacy
              </span>
            </div>
          </DialogHeader>

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Cliente *</Label>
                <Popover open={clientePopoverOpen} onOpenChange={setClientePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" role="combobox" className={cn("w-full justify-between font-normal", !clienteLabel && "text-muted-foreground")}>
                      {clienteLabel || "Cerca cliente per nome o codice..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="Cerca cliente..." value={clienteSearch} onValueChange={setClienteSearch} />
                      <CommandList>
                        <CommandEmpty>Nessun cliente trovato</CommandEmpty>
                        <CommandGroup>
                          {(clientiList ?? [])
                            .filter((c) =>
                              c.ragione_sociale.toLowerCase().includes(clienteSearch.toLowerCase()) ||
                              String(c.codice_gestionale ?? "").toLowerCase().includes(clienteSearch.toLowerCase())
                            )
                            .slice(0, 50)
                            .map((c) => (
                              <CommandItem
                                key={c.id}
                                value={c.id}
                                onSelect={() => {
                                  setForm((f) => ({ ...f, cliente_id: c.id }));
                                  setClienteLabel(c.ragione_sociale);
                                  setNuovoClienteInfo({
                                    ragione_sociale: c.ragione_sociale,
                                    partita_iva: c.partita_iva,
                                    codice_fiscale: c.codice_fiscale,
                                    indirizzo: c.indirizzo,
                                    citta: c.citta,
                                  });
                                  setClientePopoverOpen(false);
                                  setClienteSearch("");
                                }}
                              >
                                <div className="flex flex-col">
                                  <span>{c.ragione_sociale}</span>
                                  {c.codice_gestionale && (
                                    <span className="text-xs text-muted-foreground">cod. {c.codice_gestionale}</span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {formErrors.cliente_id && <p className="text-xs text-destructive">{formErrors.cliente_id}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome *</Label>
                  <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
                  {formErrors.nome && <p className="text-xs text-destructive">{formErrors.nome}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Cognome</Label>
                  <Input value={form.cognome} onChange={(e) => setForm((f) => ({ ...f, cognome: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Ruolo</Label>
                <Input
                  value={form.ruolo}
                  onChange={(e) => setForm((f) => ({ ...f, ruolo: e.target.value }))}
                  placeholder="Es. Titolare, Amministratore..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                  {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Cellulare</Label>
                  <Input value={form.cellulare} onChange={(e) => setForm((f) => ({ ...f, cellulare: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Telefono</Label>
                <Input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="principale"
                  checked={form.principale}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, principale: v === true }))}
                />
                <Label htmlFor="principale" className="cursor-pointer text-sm font-normal">Contatto principale</Label>
              </div>
            </div>
          )}

          {step === 2 && nuovoClienteInfo && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                <p className="font-medium">{nuovoClienteInfo.ragione_sociale}</p>
                {nuovoClienteInfo.partita_iva && (
                  <p className="text-xs text-muted-foreground">P.IVA {nuovoClienteInfo.partita_iva}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Firmatario: {[form.nome, form.cognome].filter(Boolean).join(" ")}
                </p>
              </div>

              <p className="text-sm text-muted-foreground">
                Il contatto firmerà l'informativa privacy GDPR. Verrà generato un PDF salvato nella scheda cliente.
              </p>

              <div ref={padRef}>
                <SignaturePad onChange={(empty) => setHasSig(!empty)} height={180} />
              </div>
            </div>
          )}

          <DialogFooter>
            {step === 1 && (
              <>
                <Button variant="outline" onClick={() => { resetDialog(); setDialogOpen(false); }}>
                  Annulla
                </Button>
                <Button onClick={handleSalvaAnagrafica}>Avanti: firma privacy →</Button>
              </>
            )}
            {step === 2 && (
              <>
                <Button variant="outline" onClick={() => { resetDialog(); setDialogOpen(false); }}>
                  Salta e chiudi
                </Button>
                <Button onClick={handleSalvaFirma} disabled={!hasSig || saving}>
                  {saving ? "Salvataggio..." : "Salva firma e chiudi"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
