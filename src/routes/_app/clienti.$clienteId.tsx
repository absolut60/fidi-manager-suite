import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Plus, Mail, Phone, Smartphone, Star, Trash2, FileCheck2, FileX2, Download, Pencil, Link as LinkIcon, Copy } from "lucide-react";
import { SignaturePad, getCanvasDataURL } from "@/components/signature-pad";
import { generaPdfPrivacy } from "@/lib/privacy-pdf";
import { useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClienteCantieriTab } from "@/components/cliente-cantieri-tab";
import { ClienteStoricoFidoTab } from "@/components/cliente-storico-fido-tab";

export const Route = createFileRoute("/_app/clienti/$clienteId")({
  validateSearch: (s: Record<string, unknown>) => ({ edit: s.edit === 1 || s.edit === "1" ? 1 : undefined }),
  component: ClienteDetail,
});

const contattoSchema = z.object({
  nome: z.string().trim().min(1, "Obbligatorio").max(100),
  cognome: z.string().trim().max(100).optional().or(z.literal("")),
  ruolo: z.string().trim().max(100).optional().or(z.literal("")),
  email: z.string().trim().email("Email non valida").max(255).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  cellulare: z.string().trim().max(30).optional().or(z.literal("")),
  principale: z.boolean().default(false),
});

type ContattoForm = z.infer<typeof contattoSchema>;

function ClienteDetail() {
  const { clienteId } = Route.useParams();
  const { edit } = Route.useSearch();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  useEffect(() => {
    if (edit === 1) setOpenEdit(true);
  }, [edit]);


  const { data: cliente, isLoading } = useQuery({
    queryKey: ["cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("*, stores(nome, codice)")
        .eq("id", clienteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: contatti, isLoading: loadingContatti } = useQuery({
    queryKey: ["contatti", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("principale", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const deleteContatto = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contatti").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contatto eliminato");
      qc.invalidateQueries({ queryKey: ["contatti", clienteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Cliente non trovato</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/clienti">Torna ai clienti</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/clienti"><ArrowLeft className="size-4" /> Clienti</Link>
        </Button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{cliente.ragione_sociale}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {cliente.partita_iva ? `P.IVA ${cliente.partita_iva}` : "Partita IVA non inserita"}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {cliente.privacy_firmata ? (
              <Badge className="bg-success/15 text-success gap-1">
                <FileCheck2 className="size-3" /> Privacy firmata
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <FileX2 className="size-3" /> Privacy da firmare
              </Badge>
            )}
            <Dialog open={openEdit} onOpenChange={setOpenEdit}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Pencil className="size-4" /> Modifica
                </Button>
              </DialogTrigger>
              <EditClienteDialog
                key={cliente.id}
                cliente={cliente}
                onClose={() => setOpenEdit(false)}
                onSaved={() => qc.invalidateQueries({ queryKey: ["cliente", clienteId] })}
              />
            </Dialog>
          </div>
        </div>
      </div>

      <Tabs defaultValue="anagrafica">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="contatti">Contatti ({contatti?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="cantieri">Cantieri</TabsTrigger>
          <TabsTrigger value="storico">Storico fido</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="anagrafica" className="space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Dati anagrafici</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Ragione sociale" value={cliente.ragione_sociale} />
              <Field label="Codice gestionale" value={(cliente as any).codice_gestionale} />
              <Field label="Tipo soggetto" value={(cliente as any).tipo_soggetto === "persona_fisica" ? "Persona fisica" : (cliente as any).tipo_soggetto === "azienda" ? "Azienda" : null} />
              <Field label="Partita IVA" value={cliente.partita_iva} />
              <Field label="Codice fiscale" value={cliente.codice_fiscale} />
              <Field label="Punto vendita" value={(cliente as any).stores?.nome} />
              <Field label="Indirizzo" value={cliente.indirizzo} />
              <Field label="Città" value={cliente.citta && `${cliente.citta}${cliente.provincia ? ` (${cliente.provincia})` : ""}${cliente.cap ? ` — ${cliente.cap}` : ""}`} />
              <Field label="Telefono" value={cliente.telefono} />
              <Field label="Email" value={cliente.email} />
              <Field label="PEC" value={(cliente as any).pec} />
              <Field label="Codice SDI" value={(cliente as any).codice_sdi} />
              <Field label="Banca" value={(cliente as any).banca} />
              <Field label="Agenzia" value={(cliente as any).agenzia} />
              <Field label="ABI" value={(cliente as any).abi} />
              <Field label="CAB" value={(cliente as any).cab} />
            </dl>
            {(cliente as any).scheda_pdf_url && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2">SCHEDA INSERIMENTO FIRMATA</p>
                <Button variant="outline" size="sm" asChild>
                  <a href={(cliente as any).scheda_pdf_url} target="_blank" rel="noreferrer">
                    <Download className="size-4 mr-1" /> Scarica scheda PDF
                  </a>
                </Button>
              </div>
            )}
            {cliente.note && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-1">NOTE</p>
                <p className="text-sm whitespace-pre-wrap">{cliente.note}</p>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="contatti" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={openNew} onOpenChange={setOpenNew}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="size-4" /> Nuovo contatto
                </Button>
              </DialogTrigger>
              <NewContattoDialog clienteId={clienteId} onClose={() => setOpenNew(false)} />
            </Dialog>
          </div>

          {loadingContatti ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : contatti?.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="font-medium text-sm">Nessun contatto</p>
              <p className="text-xs text-muted-foreground mt-1">Aggiungi un referente per questo cliente.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {contatti?.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{c.nome} {c.cognome}</p>
                        {c.principale && (
                          <Badge className="bg-accent/15 text-accent gap-1 shrink-0">
                            <Star className="size-3 fill-current" /> Principale
                          </Badge>
                        )}
                      </div>
                      {c.ruolo && <p className="text-xs text-muted-foreground mt-0.5">{c.ruolo}</p>}
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => { if (confirm("Eliminare questo contatto?")) deleteContatto.mutate(c.id); }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                        <Mail className="size-3.5" /> {c.email}
                      </a>
                    )}
                    {c.telefono && (
                      <a href={`tel:${c.telefono}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                        <Phone className="size-3.5" /> {c.telefono}
                      </a>
                    )}
                    {c.cellulare && (
                      <a href={`tel:${c.cellulare}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                        <Smartphone className="size-3.5" /> {c.cellulare}
                      </a>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cantieri">
          <ClienteCantieriTab clienteId={clienteId} />
        </TabsContent>

        <TabsContent value="storico">
          <ClienteStoricoFidoTab clienteId={clienteId} />
        </TabsContent>

        <TabsContent value="privacy">
          <PrivacyTab cliente={cliente} onUpdated={() => qc.invalidateQueries({ queryKey: ["cliente", clienteId] })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function NewContattoDialog({ clienteId, onClose }: { clienteId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContattoForm>({
    nome: "", cognome: "", ruolo: "", email: "", telefono: "", cellulare: "", principale: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (input: ContattoForm) => {
      const parsed = contattoSchema.parse(input);
      const payload = {
        cliente_id: clienteId,
        nome: parsed.nome,
        cognome: parsed.cognome || null,
        ruolo: parsed.ruolo || null,
        email: parsed.email || null,
        telefono: parsed.telefono || null,
        cellulare: parsed.cellulare || null,
        principale: parsed.principale,
      };
      const { error } = await supabase.from("contatti").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contatto aggiunto");
      qc.invalidateQueries({ queryKey: ["contatti", clienteId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = contattoSchema.safeParse(form);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    mutation.mutate(form);
  }

  function set<K extends keyof ContattoForm>(k: K, v: ContattoForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nuovo contatto</DialogTitle>
        <DialogDescription>Aggiungi un referente per questo cliente.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cognome">Cognome</Label>
            <Input id="cognome" value={form.cognome} onChange={(e) => set("cognome", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ruolo">Ruolo</Label>
          <Input id="ruolo" placeholder="es. Responsabile acquisti" value={form.ruolo} onChange={(e) => set("ruolo", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="telefono">Telefono</Label>
            <Input id="telefono" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cellulare">Cellulare</Label>
            <Input id="cellulare" value={form.cellulare} onChange={(e) => set("cellulare", e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Checkbox id="principale" checked={form.principale} onCheckedChange={(v) => set("principale", v === true)} />
          <Label htmlFor="principale" className="cursor-pointer text-sm font-normal">Contatto principale</Label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : "Aggiungi"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function PrivacyTab({ cliente, onUpdated }: { cliente: any; onUpdated: () => void }) {
  const padRef = useRef<HTMLDivElement>(null);
  const [hasSig, setHasSig] = useState(false);
  const [saving, setSaving] = useState(false);

  async function salva() {
    if (!padRef.current) return;
    const dataUrl = getCanvasDataURL(padRef.current);
    if (!dataUrl) { toast.error("Inserisci la firma"); return; }
    setSaving(true);
    try {
      const now = new Date();
      // Upload firma PNG
      const pngBlob = await (await fetch(dataUrl)).blob();
      const firmaPath = `${cliente.id}/firma-${now.getTime()}.png`;
      const { error: e1 } = await supabase.storage.from("firme").upload(firmaPath, pngBlob, { upsert: true, contentType: "image/png" });
      if (e1) throw e1;
      const { data: firmaUrl } = supabase.storage.from("firme").getPublicUrl(firmaPath);

      // Genera PDF
      const pdfBytes = await generaPdfPrivacy({
        ragioneSociale: cliente.ragione_sociale,
        partitaIva: cliente.partita_iva,
        codiceFiscale: cliente.codice_fiscale,
        indirizzo: cliente.indirizzo,
        citta: cliente.citta,
        email: cliente.email,
        firmaPngDataUrl: dataUrl,
        dataFirma: now,
      });
      const pdfPath = `${cliente.id}/privacy-${now.getTime()}.pdf`;
      const { error: e2 } = await supabase.storage.from("privacy-pdf").upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (e2) throw e2;
      const { data: pdfUrl } = supabase.storage.from("privacy-pdf").getPublicUrl(pdfPath);

      const { error: e3 } = await supabase.from("clienti").update({
        privacy_firmata: true,
        data_firma: now.toISOString(),
        firma_url: firmaUrl.publicUrl,
        privacy_pdf_url: pdfUrl.publicUrl,
      }).eq("id", cliente.id);
      if (e3) throw e3;

      toast.success("Privacy firmata e PDF generato");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold mb-1">Consenso privacy (GDPR)</h3>
        <p className="text-sm text-muted-foreground">Raccogli la firma del cliente per generare il PDF dell'informativa.</p>
      </div>

      {cliente.privacy_firmata ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-success">
            <FileCheck2 className="size-4" />
            Firmata il {cliente.data_firma ? new Date(cliente.data_firma).toLocaleString("it-IT") : "—"}
          </div>
          {cliente.privacy_pdf_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={cliente.privacy_pdf_url} target="_blank" rel="noreferrer">
                <Download className="size-4 mr-1" /> Scarica PDF
              </a>
            </Button>
          )}
          {cliente.firma_url && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Firma:</div>
              <img src={cliente.firma_url} alt="Firma cliente" className="border rounded bg-white max-h-32" />
            </div>
          )}
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Rifirma se necessario:</p>
            <div ref={padRef}>
              <SignaturePad onChange={(empty) => setHasSig(!empty)} />
            </div>
            <Button onClick={salva} disabled={!hasSig || saving} size="sm" className="mt-2">
              {saving ? "Salvataggio..." : "Aggiorna firma"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileX2 className="size-4" /> Non ancora firmata
          </div>

          <LinkFirmaPrivacy clienteId={cliente.id} />

          <div className="pt-3 border-t">
            <p className="text-sm font-medium mb-2">Oppure raccogli la firma adesso:</p>
            <div ref={padRef}>
              <SignaturePad onChange={(empty) => setHasSig(!empty)} />
            </div>
            <Button onClick={salva} disabled={!hasSig || saving} className="mt-2">
              {saving ? "Salvataggio..." : "Salva firma e genera PDF"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function LinkFirmaPrivacy({ clienteId }: { clienteId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Carica i contatti del cliente per selezionare il firmatario
  const { data: contatti } = useQuery({
    queryKey: ["contatti", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("id, nome, cognome, principale, privacy_firmata")
        .eq("cliente_id", clienteId)
        .order("principale", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [contattoId, setContattoId] = useState<string | null>(null);
  const selezionato = contattoId ?? contatti?.find((c) => !c.privacy_firmata)?.id ?? null;

  async function genera() {
    if (!selezionato) {
      toast.error("Seleziona un contatto");
      return;
    }
    setLoading(true);
    try {
      const { generaTokenFirmaPrivacy } = await import("@/lib/firma-privacy.functions");
      const res = await generaTokenFirmaPrivacy({ data: { contattoId: selezionato, giorniValidita: 30 } });
      const url = `${window.location.origin}/firma-privacy/${res.token}`;
      setLink(url);
      setExpires(res.expires_at);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  async function copia() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiato negli appunti");
  }

  const noContatti = (contatti?.length ?? 0) === 0;

  return (
    <Card className="p-4 bg-muted/40 border-dashed">
      <p className="text-sm font-medium mb-1 flex items-center gap-1.5">
        <LinkIcon className="size-4" /> Link di firma a distanza (per contatto)
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        Genera un link da inviare al contatto del cliente: potrà firmare la privacy dal suo dispositivo.
      </p>

      {noContatti ? (
        <p className="text-sm text-destructive">Aggiungi prima un contatto al cliente nella tab Contatti.</p>
      ) : (
        <>
          <div className="space-y-2 mb-3">
            <Label className="text-xs">Firmatario</Label>
            <select
              className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
              value={selezionato ?? ""}
              onChange={(e) => { setContattoId(e.target.value); setLink(null); }}
            >
              {contatti?.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.nome, c.cognome].filter(Boolean).join(" ")} {c.principale ? "(principale)" : ""} {c.privacy_firmata ? "— già firmata" : ""}
                </option>
              ))}
            </select>
          </div>

          {!link ? (
            <Button size="sm" variant="outline" onClick={genera} disabled={loading || !selezionato}>
              {loading ? "Generazione..." : "Genera link"}
            </Button>
          ) : (
            <div className="space-y-2">
              <Input readOnly value={link} className="text-xs font-mono bg-background" onClick={(e) => (e.target as HTMLInputElement).select()} />
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={copia}>
                  <Copy className="size-3.5 mr-1" /> Copia
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={link} target="_blank" rel="noreferrer">Apri</a>
                </Button>
                <Button size="sm" variant="ghost" onClick={genera} disabled={loading}>
                  Rigenera
                </Button>
              </div>
              {expires && (
                <p className="text-xs text-muted-foreground">
                  Valido fino al {new Date(expires).toLocaleDateString("it-IT")}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const editSchema = z.object({
  ragione_sociale: z.string().trim().min(1, "Obbligatoria").max(200),
  tipo_soggetto: z.enum(["persona_fisica", "azienda"]).nullable().optional(),
  codice_gestionale: z.string().trim().max(50).optional().or(z.literal("")),
  partita_iva: z.string().trim().max(20).optional().or(z.literal("")),
  codice_fiscale: z.string().trim().max(20).optional().or(z.literal("")),
  store_id: z.string().uuid().nullable().optional(),
  indirizzo: z.string().trim().max(200).optional().or(z.literal("")),
  citta: z.string().trim().max(100).optional().or(z.literal("")),
  cap: z.string().trim().max(10).optional().or(z.literal("")),
  provincia: z.string().trim().max(5).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("Email non valida").max(255).optional().or(z.literal("")),
  pec: z.string().trim().email("PEC non valida").max(255).optional().or(z.literal("")),
  codice_sdi: z.string().trim().max(10).optional().or(z.literal("")),
  banca: z.string().trim().max(100).optional().or(z.literal("")),
  agenzia: z.string().trim().max(100).optional().or(z.literal("")),
  abi: z.string().trim().max(10).optional().or(z.literal("")),
  cab: z.string().trim().max(10).optional().or(z.literal("")),
  condizioni_pagamento: z.string().trim().max(500).optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

type EditForm = z.infer<typeof editSchema>;

function EditClienteDialog({ cliente, onClose, onSaved }: { cliente: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<EditForm>({
    ragione_sociale: cliente.ragione_sociale ?? "",
    tipo_soggetto: cliente.tipo_soggetto ?? null,
    codice_gestionale: cliente.codice_gestionale ?? "",
    partita_iva: cliente.partita_iva ?? "",
    codice_fiscale: cliente.codice_fiscale ?? "",
    store_id: cliente.store_id ?? null,
    indirizzo: cliente.indirizzo ?? "",
    citta: cliente.citta ?? "",
    cap: cliente.cap ?? "",
    provincia: cliente.provincia ?? "",
    telefono: cliente.telefono ?? "",
    email: cliente.email ?? "",
    pec: cliente.pec ?? "",
    codice_sdi: cliente.codice_sdi ?? "",
    banca: cliente.banca ?? "",
    agenzia: cliente.agenzia ?? "",
    abi: cliente.abi ?? "",
    cab: cliente.cab ?? "",
    condizioni_pagamento: cliente.condizioni_pagamento ?? "",
    note: cliente.note ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: stores } = useQuery({
    queryKey: ["stores-attivi"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome, codice").eq("attivo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: EditForm) => {
      const parsed = editSchema.parse(input);
      const payload: Record<string, any> = {};
      (Object.keys(parsed) as (keyof EditForm)[]).forEach((k) => {
        const v = parsed[k];
        payload[k] = v === "" ? null : v;
      });
      const { data, error } = await supabase
        .from("clienti")
        .update(payload as any)
        .eq("id", cliente.id)
        .select("id");
      if (error) {
        if ((error as any).code === "23505" || error.message.includes("clienti_codice_gestionale_unique")) {
          throw new Error("Codice gestionale già utilizzato da un altro cliente.");
        }
        throw error;
      }
      if (!data || data.length === 0) {
        throw new Error("Non hai i permessi per modificare questo cliente (è di un altro punto vendita).");
      }
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente aggiornato");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function set<K extends keyof EditForm>(k: K, v: EditForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = editSchema.safeParse(form);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      toast.error("Controlla i campi evidenziati");
      return;
    }
    setErrors({});
    mutation.mutate(form);
  }

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Modifica cliente</DialogTitle>
        <DialogDescription>Aggiorna i dati anagrafici, fiscali e bancari.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Ragione sociale *</Label>
            <Input value={form.ragione_sociale} onChange={(e) => set("ragione_sociale", e.target.value)} />
            {errors.ragione_sociale && <p className="text-xs text-destructive">{errors.ragione_sociale}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Tipo soggetto</Label>
            <select
              value={form.tipo_soggetto ?? "none"}
              onChange={(e) => set("tipo_soggetto", e.target.value === "none" ? null : (e.target.value as "persona_fisica" | "azienda"))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="none">—</option>
              <option value="persona_fisica">Persona fisica</option>
              <option value="azienda">Azienda</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Codice gestionale</Label>
            <Input value={form.codice_gestionale} onChange={(e) => set("codice_gestionale", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Partita IVA</Label>
            <Input value={form.partita_iva} onChange={(e) => set("partita_iva", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Codice fiscale</Label>
            <Input value={form.codice_fiscale} onChange={(e) => set("codice_fiscale", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Punto vendita</Label>
            <select
              value={form.store_id ?? "none"}
              onChange={(e) => set("store_id", e.target.value === "none" ? null : e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="none">—</option>
              {stores?.map((s) => (
                <option key={s.id} value={s.id}>{s.nome} ({s.codice})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t pt-3 space-y-3">
          <h4 className="text-sm font-semibold">Sede</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Indirizzo</Label>
              <Input value={form.indirizzo} onChange={(e) => set("indirizzo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Città</Label>
              <Input value={form.citta} onChange={(e) => set("citta", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>CAP</Label>
                <Input value={form.cap} onChange={(e) => set("cap", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prov.</Label>
                <Input value={form.provincia} onChange={(e) => set("provincia", e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t pt-3 space-y-3">
          <h4 className="text-sm font-semibold">Contatti</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telefono</Label>
              <Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>PEC</Label>
              <Input type="email" value={form.pec} onChange={(e) => set("pec", e.target.value)} />
              {errors.pec && <p className="text-xs text-destructive">{errors.pec}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Codice SDI</Label>
              <Input value={form.codice_sdi} onChange={(e) => set("codice_sdi", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="border-t pt-3 space-y-3">
          <h4 className="text-sm font-semibold">Coordinate bancarie</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Banca</Label>
              <Input value={form.banca} onChange={(e) => set("banca", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Agenzia</Label>
              <Input value={form.agenzia} onChange={(e) => set("agenzia", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ABI</Label>
              <Input value={form.abi} onChange={(e) => set("abi", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>CAB</Label>
              <Input value={form.cab} onChange={(e) => set("cab", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Condizioni di pagamento</Label>
              <Input value={form.condizioni_pagamento} onChange={(e) => set("condizioni_pagamento", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="border-t pt-3 space-y-1.5">
          <Label>Note</Label>
          <Textarea rows={3} value={form.note} onChange={(e) => set("note", e.target.value)} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : "Salva modifiche"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
