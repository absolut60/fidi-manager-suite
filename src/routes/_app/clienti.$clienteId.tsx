import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Plus, Mail, Phone, Smartphone, Star, Trash2, FileCheck2, FileX2, Download, Pencil, Link as LinkIcon, Copy, EyeOff, AlertTriangle, MessageCircle, Send } from "lucide-react";
import { InviaSollecitoDialog } from "@/components/invia-sollecito-dialog";
import { SignaturePad, getCanvasDataURL } from "@/components/signature-pad";
import { PdfPrivacyButton } from "@/components/pdf-privacy-button";
import { generaPdfPrivacy } from "@/lib/privacy-pdf";
import { useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useConfig, isClienteAttivo } from "@/hooks/use-config";
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
import { ClienteInsolutiTab } from "@/components/cliente-insoluti-tab";
import { ClienteAttivitaRecuperoTab } from "@/components/cliente-attivita-recupero-tab";
import { AllegatiSection } from "@/components/allegati-section";
import { ClienteFatturato } from "@/components/cliente-fatturato";
import { formatEuro } from "@/lib/fidi";
import { classificaScadenza } from "@/lib/scadenze";
import { Ban, Calendar, Clock, Bell, CheckCircle2, Shield, ShieldOff, Scale, FileText, Activity } from "lucide-react";
import { NuovoContattoWizard } from "@/components/nuovo-contatto-wizard";
import { RuoloSelect } from "@/components/ruolo-select";
import { CondizionePagamentoSelect } from "@/components/condizione-pagamento-select";
import { CategoriaSelect } from "@/components/categoria-select";




const TAB_VALUES = ["riepilogo", "anagrafica", "contatti", "cantieri", "storico", "insoluti", "attivita", "allegati", "privacy"] as const;
const INSOLUTI_SUB_VALUES = ["riepilogo", "scadenziario", "solleciti", "legali", "assicurazioni"] as const;

export const Route = createFileRoute("/_app/clienti/$clienteId")({
  validateSearch: (s: Record<string, unknown>) => ({
    edit: s.edit === 1 || s.edit === "1" ? 1 : undefined,
    tab: typeof s.tab === "string" && (TAB_VALUES as readonly string[]).includes(s.tab) ? s.tab as typeof TAB_VALUES[number] : undefined,
    insolutiTab: typeof s.insolutiTab === "string" && (INSOLUTI_SUB_VALUES as readonly string[]).includes(s.insolutiTab) ? s.insolutiTab as typeof INSOLUTI_SUB_VALUES[number] : undefined,
    from: s.from === "approvazioni" ? ("approvazioni" as const) : undefined,
  }),
  component: ClienteDetail,
});

const contattoSchema = z.object({
  nome: z.string().trim().min(1, "Obbligatorio").max(100),
  cognome: z.string().trim().max(100).optional().or(z.literal("")),
  ruolo: z.string().trim().max(100).optional().or(z.literal("")),
  email: z.string().trim().email("Email non valida").max(255).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  cellulare: z.string().trim().max(30).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(30).optional().or(z.literal("")),
  luogo_nascita: z.string().trim().max(100).optional().or(z.literal("")),
  data_nascita: z.string().trim().max(20).optional().or(z.literal("")),
  codice_fiscale: z.string().trim().max(20).optional().or(z.literal("")),
  residenza: z.string().trim().max(200).optional().or(z.literal("")),
  principale: z.boolean().default(false),
});

type ContattoForm = z.infer<typeof contattoSchema>;

function emptyContattoForm(): ContattoForm {
  return {
    nome: "", cognome: "", ruolo: "",
    email: "", telefono: "", cellulare: "", whatsapp: "",
    luogo_nascita: "", data_nascita: "", codice_fiscale: "", residenza: "",
    principale: false,
  };
}

function ContattoFormFields({
  form, errors, set,
}: {
  form: ContattoForm;
  errors: Record<string, string>;
  set: <K extends keyof ContattoForm>(k: K, v: ContattoForm[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Dati anagrafici</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Cognome</Label>
            <Input value={form.cognome} onChange={(e) => set("cognome", e.target.value)} />
          </div>
        </div>
        <RuoloSelect value={form.ruolo ?? ""} onChange={(v) => set("ruolo", v)} />
        <div className="flex items-center gap-2">
          <Checkbox id="principale" checked={form.principale} onCheckedChange={(v) => set("principale", v === true)} />
          <Label htmlFor="principale" className="cursor-pointer text-sm font-normal">Contatto principale</Label>
        </div>
      </div>

      <div className="space-y-3 border-t pt-3">
        <h4 className="text-sm font-semibold">Recapiti</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Telefono</Label>
            <Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cellulare</Label>
            <Input value={form.cellulare} onChange={(e) => set("cellulare", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>WhatsApp</Label>
            <Input placeholder="+39 333 1234567" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t pt-3">
        <h4 className="text-sm font-semibold">Dati personali</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Luogo di nascita</Label>
            <Input value={form.luogo_nascita} onChange={(e) => set("luogo_nascita", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data di nascita</Label>
            <Input type="date" value={form.data_nascita} onChange={(e) => set("data_nascita", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Codice fiscale</Label>
            <Input value={form.codice_fiscale} onChange={(e) => set("codice_fiscale", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Residenza</Label>
            <Input value={form.residenza} onChange={(e) => set("residenza", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function contattoFormToPayload(parsed: ContattoForm) {
  return {
    nome: parsed.nome,
    cognome: parsed.cognome || null,
    ruolo: parsed.ruolo || null,
    email: parsed.email || null,
    telefono: parsed.telefono || null,
    cellulare: parsed.cellulare || null,
    whatsapp: parsed.whatsapp || null,
    luogo_nascita: parsed.luogo_nascita || null,
    data_nascita: parsed.data_nascita || null,
    codice_fiscale: parsed.codice_fiscale || null,
    residenza: parsed.residenza || null,
    principale: parsed.principale,
  };
}

function ConsensoBadge({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <Badge className="bg-success/15 text-success border-success/30">{label} ✓</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">{label} —</Badge>
  );
}

function ClienteDetail() {
  const { clienteId } = Route.useParams();
  const { edit, tab, insolutiTab, from } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "amministratore";
  const [openNew, setOpenNew] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDisattiva, setOpenDisattiva] = useState(false);
  const [openSollecito, setOpenSollecito] = useState(false);
  const [openElimina, setOpenElimina] = useState(false);

  useEffect(() => {
    if (edit === 1) setOpenEdit(true);
  }, [edit]);

  const disattivaMut = useMutation({
    mutationFn: async () => {
      const { error, data } = await supabase
        .from("clienti")
        .update({ attivo: false })
        .eq("id", clienteId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Non hai i permessi per disattivare questo cliente.");
    },
    onSuccess: () => {
      toast.success("Cliente disattivato");
      qc.invalidateQueries({ queryKey: ["clienti"] });
      qc.invalidateQueries({ queryKey: ["cliente", clienteId] });
      setOpenDisattiva(false);
      navigate({ to: "/clienti" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminaMut = useMutation({
    mutationFn: async () => {
      // Blocca se ci sono richieste fido collegate
      const { count, error: cErr } = await supabase
        .from("richieste_fido")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", clienteId);
      if (cErr) throw cErr;
      if ((count ?? 0) > 0) {
        throw new Error(`Impossibile eliminare: il cliente ha ${count} richieste fido collegate. Disattivalo invece.`);
      }
      const { error } = await supabase.from("clienti").delete().eq("id", clienteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente eliminato definitivamente");
      qc.invalidateQueries({ queryKey: ["clienti"] });
      setOpenElimina(false);
      navigate({ to: "/clienti" });
    },
    onError: (e: Error) => toast.error(e.message),
  });



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
          {from === "approvazioni"
            ? <Link to="/approvazioni"><ArrowLeft className="size-4" /> Torna alle Approvazioni</Link>
            : <Link to="/clienti"><ArrowLeft className="size-4" /> Clienti</Link>}
        </Button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{cliente.ragione_sociale}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {[
                (cliente as any).codice_gestionale ? `Cod. ${(cliente as any).codice_gestionale}` : null,
                cliente.partita_iva ? `P.IVA ${cliente.partita_iva}` : null,
                (cliente as any).stores?.nome ? String((cliente as any).stores.nome).toUpperCase() : null,
              ].filter(Boolean).join(" — ") || "Partita IVA non inserita"}
            </p>
            {((cliente as any).bloccato || (cliente as any).in_gestione_legale) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(cliente as any).bloccato && (
                  <Link
                    to="/clienti/$clienteId"
                    params={{ clienteId }}
                    search={{ tab: "storico" }}
                    className="inline-flex items-center gap-1 rounded-md bg-destructive/15 text-destructive border border-destructive/30 px-2 py-0.5 text-xs font-medium hover:bg-destructive/25 transition-colors cursor-pointer"
                  >
                    <AlertTriangle className="size-3" /> Cliente bloccato
                  </Link>
                )}
                {(cliente as any).in_gestione_legale && (
                  <Link
                    to="/legali"
                    search={{ cliente: clienteId } as never}
                    className="inline-flex items-center gap-1 rounded-md bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30 px-2 py-0.5 text-xs font-medium hover:bg-orange-500/25 transition-colors cursor-pointer"
                  >
                    <Scale className="size-3" /> In gestione legale
                  </Link>
                )}
              </div>
            )}
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
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpenSollecito(true)}>
              <Send className="size-4" /> Invia sollecito
            </Button>
            <InviaSollecitoDialog
              open={openSollecito}
              onOpenChange={setOpenSollecito}
              clienteId={clienteId}
            />
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

            {cliente.attivo && (
              <Dialog open={openDisattiva} onOpenChange={setOpenDisattiva}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <EyeOff className="size-4" /> Disattiva
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Disattivare il cliente?</DialogTitle>
                    <DialogDescription>
                      Il cliente non comparirà più nelle liste, ma i dati e lo storico restano nel sistema. Potrai riattivarlo in seguito.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenDisattiva(false)} disabled={disattivaMut.isPending}>Annulla</Button>
                    <Button onClick={() => disattivaMut.mutate()} disabled={disattivaMut.isPending}>
                      {disattivaMut.isPending ? "Disattivazione…" : "Disattiva cliente"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {isAdmin && (
              <Dialog open={openElimina} onOpenChange={(v) => { setOpenElimina(v); }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="destructive" className="gap-1.5">
                    <Trash2 className="size-4" /> Elimina
                  </Button>
                </DialogTrigger>
                <EliminaClienteDialog
                  clienteId={clienteId}
                  ragioneSociale={cliente.ragione_sociale}
                  onClose={() => setOpenElimina(false)}
                  onConfirm={() => eliminaMut.mutate()}
                  pending={eliminaMut.isPending}
                />
              </Dialog>
            )}
          </div>

        </div>
      </div>

      <Tabs key={tab ?? "riepilogo"} defaultValue={tab ?? "riepilogo"}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="riepilogo">Riepilogo</TabsTrigger>
          <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="contatti">Contatti ({contatti?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="cantieri">Cantieri</TabsTrigger>
          <TabsTrigger value="storico">Fido</TabsTrigger>
          <TabsTrigger value="insoluti">Dati Rischio</TabsTrigger>
          <TabsTrigger value="attivita">Attività recupero</TabsTrigger>
          <TabsTrigger value="allegati">Allegati</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="riepilogo" className="space-y-4">
          <RiepilogoTab cliente={cliente} clienteId={clienteId} />
        </TabsContent>

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
              <Field label="Telefono 2" value={(cliente as any).telefono_2} />
              <Field label="Email" value={cliente.email} />
              <Field label="PEC" value={(cliente as any).pec} />
              <Field label="Codice SDI" value={(cliente as any).codice_sdi} />
              <Field
                label="Macrocategoria"
                value={
                  (cliente as any).codice_macrocategoria || (cliente as any).macrocategoria
                    ? `${(cliente as any).codice_macrocategoria ?? ""}${(cliente as any).codice_macrocategoria && (cliente as any).macrocategoria ? " — " : ""}${(cliente as any).macrocategoria ?? ""}`
                    : null
                }
              />
              <Field
                label="Categoria"
                value={
                  (cliente as any).codice_categoria || (cliente as any).categoria
                    ? `${(cliente as any).codice_categoria ?? ""}${(cliente as any).codice_categoria && (cliente as any).categoria ? " — " : ""}${(cliente as any).categoria ?? ""}`
                    : null
                }
              />
              <Field label="Forma giuridica" value={(cliente as any).forma_giuridica} />
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

          <DatiRischioCard cliente={cliente} />
        </TabsContent>


        <TabsContent value="contatti" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={openNew} onOpenChange={setOpenNew}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="size-4" /> Nuovo contatto
                </Button>
              </DialogTrigger>
              {openNew && (
                <NuovoContattoWizard
                  cliente={{
                    id: clienteId,
                    ragione_sociale: cliente?.ragione_sociale ?? "",
                    partita_iva: (cliente as any)?.partita_iva,
                    codice_fiscale: (cliente as any)?.codice_fiscale,
                    indirizzo: (cliente as any)?.indirizzo,
                    citta: (cliente as any)?.citta,
                  }}
                  onClose={() => setOpenNew(false)}
                />
              )}
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
                <ContattoCard
                  key={c.id}
                  cliente={cliente}
                  clienteId={clienteId}
                  contatto={c}
                  onDelete={() => { if (confirm("Eliminare questo contatto?")) deleteContatto.mutate(c.id); }}
                />
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

        <TabsContent value="insoluti">
          <ClienteInsolutiTab cliente={{ id: clienteId, bloccato: (cliente as any).bloccato, in_gestione_legale: (cliente as any).in_gestione_legale, motivo_blocco: (cliente as any).motivo_blocco, data_blocco: (cliente as any).data_blocco }} defaultSubTab={insolutiTab} />
        </TabsContent>

        <TabsContent value="attivita">
          <ClienteAttivitaRecuperoTab clienteId={clienteId} />
        </TabsContent>

        <TabsContent value="allegati">
          <Card className="p-6">
            <AllegatiSection
              entitaTipo="cliente"
              entitaId={clienteId}
              clienteId={clienteId}
              canEdit
              title="Documenti del cliente"
            />
          </Card>
        </TabsContent>

        <TabsContent value="privacy">
          <PrivacyTab cliente={cliente} onUpdated={() => qc.invalidateQueries({ queryKey: ["cliente", clienteId] })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DatiRischioCard({ cliente }: { cliente: any }) {
  const config = useConfig();
  const clienteAttivo = isClienteAttivo((cliente as any).ultima_data_fatturazione, (cliente as any).doc_da_fatturare, config);
  const fidoGest = Number(cliente.fido_gestionale ?? 0);
  const totRischio = Number(cliente.totale_rischio ?? 0);
  const fidoResiduo = cliente.fido_residuo == null ? null : Number(cliente.fido_residuo);
  const scaduto = Number(cliente.scaduto ?? 0);

  let semaforo: { label: string; color: string; dot: string } = {
    label: "Verde", color: "bg-success/15 text-success border-success/30", dot: "bg-success",
  };
  if (fidoResiduo !== null && fidoResiduo < 0) {
    semaforo = { label: "Rosso", color: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive" };
  } else if (fidoResiduo !== null && fidoGest > 0 && fidoResiduo < fidoGest * 0.1) {
    semaforo = { label: "Arancione", color: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning" };
  } else if (scaduto > 0) {
    semaforo = { label: "Giallo", color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30", dot: "bg-yellow-500" };
  }

  const utilizzo = fidoGest > 0 ? Math.round((totRischio / fidoGest) * 1000) / 10 : null;
  const dilConc = cliente.dilazione_concordata as number | null;
  const dilEff = cliente.dilazione_effettiva as number | null;
  const dilSfora = dilConc != null && dilEff != null && dilEff > dilConc;

  const hasAnyData =
    cliente.fido_gestionale != null || cliente.fido != null ||
    cliente.totale_rischio != null || cliente.fido_residuo != null ||
    cliente.scaduto != null || cliente.a_scadere != null ||
    cliente.condizioni_pagamento || (cliente as any).condizione_pagamento_desc ||
    dilConc != null || dilEff != null;

  if (!hasAnyData) return null;

  const condPag = (cliente as any).condizione_pagamento_desc || cliente.condizioni_pagamento;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <AlertTriangle className="size-4" /> Dati rischio
        </h3>
        <div className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium ${semaforo.color}`}>
          <span className={`inline-block size-2.5 rounded-full ${semaforo.dot}`} />
          Semaforo: {semaforo.label}
          {utilizzo != null && <span className="text-xs opacity-80">· utilizzo fido {utilizzo}%</span>}
        </div>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
        <Field label="Fido gestionale" value={formatEuro(cliente.fido_gestionale ?? cliente.fido)} />
        <Field label="Totale rischio" value={formatEuro(cliente.totale_rischio)} />
        <Field label="Fido residuo" value={formatEuro(cliente.fido_residuo)} />
        <Field label="Scaduto" value={formatEuro(cliente.scaduto)} />
        <Field label="A scadere" value={formatEuro(cliente.a_scadere)} />
        <Field label="Condizione di pagamento" value={condPag} />
        <div>
          <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dilazione concordata</dt>
          <dd className="mt-0.5">{dilConc != null ? `${dilConc} gg` : <span className="text-muted-foreground">—</span>}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dilazione effettiva</dt>
          <dd className={`mt-0.5 ${dilSfora ? "text-destructive font-medium" : ""}`}>
            {dilEff != null ? `${dilEff} gg${dilSfora ? ` (+${dilEff - (dilConc ?? 0)})` : ""}` : <span className="text-muted-foreground">—</span>}
          </dd>
        </div>
        {(cliente as any).num_insoluti != null && (
          <Field label="Insoluti" value={String((cliente as any).num_insoluti)} />
        )}
        <div>
          <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ultima data fatturazione</dt>
          <dd className="mt-0.5 flex items-center gap-2">
            {(cliente as any).ultima_data_fatturazione
              ? new Date((cliente as any).ultima_data_fatturazione).toLocaleDateString("it-IT")
              : <span className="text-muted-foreground">—</span>}
            {clienteAttivo ? (
              <span className="text-xs rounded px-1.5 py-0.5 bg-success/15 text-success border border-success/30">Attivo</span>
            ) : (
              <span className="text-xs rounded px-1.5 py-0.5 bg-muted text-muted-foreground border">Non attivo</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stato blocco</dt>
          <dd className="mt-0.5">
            {(() => {
              const ib = (cliente as any).ind_blocco ?? 0;
              if (ib === 2) return <span className="text-destructive font-medium">Bloccato</span>;
              if (ib === 1) return <span className="text-yellow-700 dark:text-yellow-500 font-medium">Bloccato con possibilità di sblocco</span>;
              return <span className="text-muted-foreground">Non bloccato</span>;
            })()}
          </dd>
        </div>
      </dl>
      {(cliente as any).ultima_sincronizzazione && (
        <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">
          Ultima sincronizzazione: {new Date((cliente as any).ultima_sincronizzazione).toLocaleString("it-IT")}
        </p>
      )}
    </Card>
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

function fmtDateIt(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("it-IT"); } catch { return String(v); }
}

function RiepilogoTab({ cliente, clienteId }: { cliente: any; clienteId: string }) {
  const config = useConfig();
  const bloccato = !!cliente.bloccato;
  const indBlocco = Number(cliente.ind_blocco ?? 0);
  const ultimaFatt = cliente.ultima_data_fatturazione;
  const clienteAttivo = isClienteAttivo(cliente.ultima_data_fatturazione, cliente.doc_da_fatturare, config);
  const assicurato = !!cliente.assicurazione_attiva;

  const { data: polizzaAttiva } = useQuery({
    queryKey: ["polizza-attiva", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assicurazioni_credito" as never)
        .select("assicuratore, importo_massimale, data_scadenza, stato")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { assicuratore: string; importo_massimale: number | null; data_scadenza: string | null; stato: string } | null;
    },
    enabled: assicurato,
  });
  const polizzaScaduta = !!(polizzaAttiva?.data_scadenza && new Date(polizzaAttiva.data_scadenza) < new Date());


  const { data: ins } = useQuery({
    queryKey: ["riepilogo-tab-insoluti", clienteId],
    queryFn: async () => {
      const { data: scad, error } = await supabase
        .from("scadenze")
        .select("importo_scadenza, giorni_ritardo, stato_contabile, tempi_scadenza")
        .eq("cliente_id", clienteId);
      if (error) throw error;
      const rows = (scad ?? []) as Array<{ importo_scadenza: number | null; giorni_ritardo: number | null; stato_contabile: string | null; tempi_scadenza: string | null }>;
      const scadute = rows.filter((s) => classificaScadenza(s) === "scaduto");
      const aScadere = rows.filter((s) => classificaScadenza(s) === "a_scadere");
      const sum = (arr: typeof rows) => arr.reduce((a, r) => a + Number(r.importo_scadenza ?? 0), 0);
      const maxGg = [...scadute, ...aScadere].reduce((m, r) => Math.max(m, Number(r.giorni_ritardo ?? 0)), 0);
      const fascia = (min: number, max: number | null) =>
        sum(scadute.filter((s) => {
          const g = Number(s.giorni_ritardo ?? 0);
          return g >= min && (max == null || g <= max);
        }));
      const { data: ultSoll } = await supabase
        .from("solleciti")
        .select("data_sollecito")
        .eq("cliente_id", clienteId)
        .order("data_sollecito", { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        totale_scaduto: sum(scadute),
        totale_a_scadere: sum(aScadere),
        max_giorni_ritardo: maxGg,
        scaduto_0_30: fascia(1, 30),
        scaduto_30_60: fascia(31, 60),
        scaduto_oltre_60: fascia(61, null),
        ultimo_sollecito: (ultSoll as { data_sollecito: string | null } | null)?.data_sollecito ?? null,
      };
    },
  });

  const totScaduto = Number(ins?.totale_scaduto ?? 0);
  const totFasce = Number(ins?.scaduto_0_30 ?? 0) + Number(ins?.scaduto_30_60 ?? 0) + Number(ins?.scaduto_oltre_60 ?? 0);
  const pct = (v: number) => totFasce > 0 ? (v / totFasce) * 100 : 0;
  const maxGg = Number(ins?.max_giorni_ritardo ?? 0);
  const fasciaTone = maxGg > 60 ? "destructive" : maxGg > 30 ? "warning" : maxGg > 0 ? "yellow" : "default";

  // Dati rischio
  const fidoGest = Number(cliente.fido_gestionale ?? cliente.fido ?? 0);
  const totRischio = Number(cliente.totale_rischio ?? 0);
  const fidoResiduo = cliente.fido_residuo == null ? null : Number(cliente.fido_residuo);
  const scaduto = Number(cliente.scaduto ?? 0);
  let semaforo = { label: "Verde", dot: "bg-success", text: "text-success", bg: "bg-success/15 border-success/30" };
  if (fidoResiduo !== null && fidoResiduo < 0) {
    semaforo = { label: "Rosso", dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/15 border-destructive/30" };
  } else if (fidoResiduo !== null && fidoGest > 0 && fidoResiduo < fidoGest * 0.1) {
    semaforo = { label: "Arancione", dot: "bg-warning", text: "text-warning", bg: "bg-warning/15 border-warning/30" };
  } else if (scaduto > 0) {
    semaforo = { label: "Giallo", dot: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/30" };
  }
  const condPag = cliente.condizione_pagamento_desc || cliente.condizioni_pagamento;

  return (
    <div className="space-y-5">
      {/* Banner assicurazione (compatto) */}
      {assicurato && (
        <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 text-xs ${polizzaScaduta ? "border-destructive/40 bg-destructive/10" : "border-success/30 bg-success/10"}`}>
          <Shield className={`size-4 shrink-0 ${polizzaScaduta ? "text-destructive" : "text-success"}`} />
          <p className={`font-medium ${polizzaScaduta ? "text-destructive" : "text-success"}`}>
            Assicurato {polizzaAttiva?.assicuratore || "POUEY"}
            {polizzaAttiva?.importo_massimale != null ? ` — Massimale: ${formatEuro(polizzaAttiva.importo_massimale)}` : ""}
            {polizzaAttiva?.data_scadenza ? ` — Scade: ${fmtDateIt(polizzaAttiva.data_scadenza)}` : ""}
          </p>
          {polizzaScaduta && (
            <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive ml-auto text-[10px] py-0">Polizza scaduta</Badge>
          )}
        </div>
      )}

      {/* Sezione 1 — Dati rischio (card compatte) */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dati rischio</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <Card className={`px-3 py-2 border ${semaforo.bg}`}>
            <p className="text-[10px] font-medium text-muted-foreground uppercase truncate">Semaforo rischio</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`inline-block size-3 rounded-full ${semaforo.dot}`} />
              <span className={`text-base font-bold ${semaforo.text}`}>{semaforo.label}</span>
            </div>
          </Card>
          <MiniStat label="Fido gestionale" value={formatEuro(fidoGest)} />
          <MiniStat label="Totale rischio" value={formatEuro(totRischio)} />
          <MiniStat label="Fido residuo" value={formatEuro(fidoResiduo)} tone={fidoResiduo != null && fidoResiduo < 0 ? "destructive" : "default"} />
          {(() => {
            const pctUtil = fidoGest > 0 ? Math.round((totRischio / fidoGest) * 100) : null;
            const tone: "success" | "warning" | "destructive" | "muted" =
              pctUtil == null ? "muted" : pctUtil >= 100 ? "destructive" : pctUtil >= 70 ? "warning" : "success";
            return <MiniStat label="% fido utilizzato" value={pctUtil == null ? "—" : `${pctUtil}%`} tone={tone} />;
          })()}
          <MiniStat label="Scaduto" value={formatEuro(cliente.scaduto)} tone={scaduto > 0 ? "destructive" : "default"} />
          <MiniStat label="A scadere" value={formatEuro(cliente.a_scadere)} />
          <MiniStat label="Cond. pagamento" value={condPag || "—"} />
          <Card className="px-3 py-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase truncate">Assicurazione</p>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              {assicurato ? (
                <>
                  <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15 gap-1 text-[10px] py-0">
                    <Shield className="size-3" /> POUEY
                  </Badge>
                  {polizzaAttiva?.importo_massimale != null && (
                    <span className="text-xs font-semibold tabular-nums">{formatEuro(polizzaAttiva.importo_massimale)}</span>
                  )}
                </>
              ) : (
                <Badge variant="secondary" className="gap-1 text-[10px] py-0">
                  <ShieldOff className="size-3" /> Non assicurato
                </Badge>
              )}
            </div>
          </Card>
        </div>
      </section>

      {/* Sezione 1b — Composizione esposizione */}
      {(() => {
        const ddt = Number(cliente.doc_da_fatturare ?? 0);
        const eff = Number(cliente.effetti_a_rischio ?? 0);
        const ord = Number(cliente.doc_da_evadere ?? 0);
        if (!ddt && !eff && !ord) return null;
        return (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <FileText className="size-3.5" /> Composizione esposizione
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <MiniStat
                label="DDT da fatturare"
                value={formatEuro(ddt)}
                tone={ddt > 0 ? "info" : "muted"}
                title="Materiale consegnato non ancora fatturato — concorre al rischio"
              />
              <MiniStat
                label="Effetti a rischio (RB)"
                value={formatEuro(eff)}
                tone={eff > 0 ? "warning" : "muted"}
                title="Effetti presentati non ancora incassati"
              />
              <MiniStat
                label="Ordini da evadere"
                value={formatEuro(ord)}
                tone={ord > 0 ? "info" : "muted"}
                hint="non concorre al fido"
              />
            </div>
          </section>
        );
      })()}

      {/* Sezione 1c — Comportamento pagamento */}
      {(() => {
        const ni = cliente.num_insoluti;
        const dc = cliente.dilazione_concordata;
        const de = cliente.dilazione_effettiva;
        if (ni == null && dc == null && de == null) return null;
        const r = ritardoHelper(dc, de);
        return (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Clock className="size-3.5" /> Comportamento pagamento
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <MiniStat
                label="Insoluti storici"
                value={ni == null ? "—" : String(ni)}
                tone={ni != null && Number(ni) > 0 ? "destructive" : "muted"}
              />
              <MiniStat
                label="Dilazione concordata"
                value={dc != null ? `${dc} gg` : "—"}
                tone="muted"
              />
              <MiniStat
                label="Ritardo medio reale"
                value={r.text}
                tone={r.tone}
                title="Differenza tra dilazione effettiva e concordata"
              />
            </div>
          </section>
        );
      })()}



      {/* Sezione 2 — Riepilogo insoluti (spostata sopra al fatturato) */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Riepilogo insoluti</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <MiniStat label="Totale scaduto" value={formatEuro(totScaduto)} tone={fasciaTone === "destructive" ? "destructive" : fasciaTone === "warning" ? "warning" : "default"} icon={AlertTriangle} />
          <MiniStat label="A scadere" value={formatEuro(ins?.totale_a_scadere ?? 0)} icon={Calendar} />
          <MiniStat label="Max gg ritardo" value={`${maxGg} gg`} icon={Clock} />
          <MiniStat label="Ultimo sollecito" value={fmtDateIt(ins?.ultimo_sollecito)} icon={Bell} />
        </div>
        <Card className="px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">Fasce di scaduto</p>
          <div className="space-y-2">
            <FasciaRow label="0–30 giorni" value={Number(ins?.scaduto_0_30 ?? 0)} pct={pct(Number(ins?.scaduto_0_30 ?? 0))} color="bg-yellow-500" />
            <FasciaRow label="31–60 giorni" value={Number(ins?.scaduto_30_60 ?? 0)} pct={pct(Number(ins?.scaduto_30_60 ?? 0))} color="bg-orange-500" />
            <FasciaRow label="oltre 60 giorni" value={Number(ins?.scaduto_oltre_60 ?? 0)} pct={pct(Number(ins?.scaduto_oltre_60 ?? 0))} color="bg-destructive" />
          </div>
        </Card>
      </section>

      {/* Sezione 3 — Fatturato */}
      <ClienteFatturato clienteId={clienteId} />

      {/* Sezione 4 — Info cliente sintetica */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Info cliente</h3>
        <Card className="px-4 py-3">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Field label="Ragione sociale" value={cliente.ragione_sociale} />
            <Field label="Partita IVA" value={cliente.partita_iva} />
            <Field label="Punto vendita" value={cliente.stores?.nome} />
            <div>
              <dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Ultima data fatturazione</dt>
              <dd className="mt-0.5 flex items-center gap-2">
                <span>{ultimaFatt ? fmtDateIt(ultimaFatt) : <span className="text-muted-foreground">—</span>}</span>
                {clienteAttivo ? (
                  <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15 text-[10px] py-0">Attivo</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] py-0">Non attivo</Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Stato blocco</dt>
              <dd className="mt-0.5">
                {indBlocco === 2 || bloccato ? (
                  <span className="text-destructive font-medium">Bloccato</span>
                ) : indBlocco === 1 ? (
                  <span className="text-yellow-700 dark:text-yellow-500 font-medium">Bloccato con possibilità di sblocco</span>
                ) : (
                  <span className="text-muted-foreground">Non bloccato</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Assicurazione crediti</dt>
              <dd className="mt-0.5 flex items-center gap-2 flex-wrap">
                {assicurato ? (
                  <>
                    <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15 gap-1 text-[10px] py-0">
                      <Shield className="size-3" /> {polizzaAttiva?.assicuratore || "POUEY"} attiva
                    </Badge>
                    {polizzaAttiva?.importo_massimale != null && (
                      <span className="tabular-nums">{formatEuro(polizzaAttiva.importo_massimale)}</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">Non assicurato</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>
      </section>
    </div>
  );
}


function MiniStat({ label, value, tone = "default", icon: Icon, hint, title }: { label: string; value: string; tone?: "default" | "destructive" | "warning" | "info" | "success" | "muted"; icon?: typeof Calendar; hint?: string; title?: string }) {
  const valCls =
    tone === "destructive" ? "text-destructive"
    : tone === "warning" ? "text-orange-600"
    : tone === "info" ? "text-primary"
    : tone === "success" ? "text-success"
    : tone === "muted" ? "text-muted-foreground"
    : "";
  return (
    <Card className="px-3 py-2" title={title}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase truncate">{label}</p>
          <p className={`text-base font-bold mt-0.5 tabular-nums truncate ${valCls}`}>{value}</p>
          {hint && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
        </div>
        {Icon && <Icon className="size-3.5 text-muted-foreground shrink-0" />}
      </div>
    </Card>
  );
}

function ritardoHelper(dilConc: number | null | undefined, dilEff: number | null | undefined): { text: string; tone: "destructive" | "success" | "muted" } {
  if (dilConc == null || dilEff == null) return { text: "—", tone: "muted" };
  const diff = Number(dilEff) - Number(dilConc);
  if (diff > 0) return { text: `+${diff} gg`, tone: "destructive" };
  return { text: "In orario", tone: "success" };
}


function FasciaRow({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="font-medium tabular-nums">{formatEuro(value)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NewContattoDialog({ clienteId, onClose }: { clienteId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContattoForm>(emptyContattoForm());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (input: ContattoForm) => {
      const parsed = contattoSchema.parse(input);
      const payload = { cliente_id: clienteId, ...contattoFormToPayload(parsed) };
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
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Nuovo contatto</DialogTitle>
        <DialogDescription>Aggiungi un referente per questo cliente.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit}>
        <ContattoFormFields form={form} errors={errors} set={set} />
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : "Aggiungi"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditContattoDialog({ contatto, onClose }: { contatto: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContattoForm>({
    nome: contatto.nome ?? "",
    cognome: contatto.cognome ?? "",
    ruolo: contatto.ruolo ?? "",
    email: contatto.email ?? "",
    telefono: contatto.telefono ?? "",
    cellulare: contatto.cellulare ?? "",
    whatsapp: contatto.whatsapp ?? "",
    luogo_nascita: contatto.luogo_nascita ?? "",
    data_nascita: contatto.data_nascita ?? "",
    codice_fiscale: contatto.codice_fiscale ?? "",
    residenza: contatto.residenza ?? "",
    principale: !!contatto.principale,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (input: ContattoForm) => {
      const parsed = contattoSchema.parse(input);
      const { error } = await supabase
        .from("contatti")
        .update(contattoFormToPayload(parsed))
        .eq("id", contatto.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contatto aggiornato");
      qc.invalidateQueries({ queryKey: ["contatti", contatto.cliente_id] });
      qc.invalidateQueries({ queryKey: ["contatti-all"] });
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
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Modifica contatto</DialogTitle>
        <DialogDescription>Aggiorna i dati del referente.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit}>
        <ContattoFormFields form={form} errors={errors} set={set} />
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : "Salva modifiche"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ContattoCard({
  cliente, clienteId, contatto, onDelete,
}: {
  cliente: any; clienteId: string; contatto: any; onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [openEdit, setOpenEdit] = useState(false);
  const waNumber = (contatto.whatsapp ?? "").replace(/[^\d+]/g, "");
  const waHref = waNumber ? `https://wa.me/${waNumber.replace(/^\+/, "")}` : null;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{contatto.nome} {contatto.cognome}</p>
            {contatto.principale && (
              <Badge className="bg-accent/15 text-accent gap-1 shrink-0">
                <Star className="size-3 fill-current" /> Principale
              </Badge>
            )}
            {contatto.privacy_firmata ? (
              <Badge className="bg-success/15 text-success gap-1 shrink-0">
                <FileCheck2 className="size-3" /> Privacy firmata
              </Badge>
            ) : (
              <Badge className="bg-destructive/15 text-destructive gap-1 shrink-0">
                <FileX2 className="size-3" /> Non firmata
              </Badge>
            )}
          </div>
          {contatto.ruolo && <p className="text-xs text-muted-foreground mt-0.5">{contatto.ruolo}</p>}
        </div>
        <div className="flex">
          <Dialog open={openEdit} onOpenChange={setOpenEdit}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <Pencil className="size-4" />
              </Button>
            </DialogTrigger>
            {openEdit && <EditContattoDialog contatto={contatto} onClose={() => setOpenEdit(false)} />}
          </Dialog>
          <Button
            variant="ghost" size="icon"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-sm">
        {contatto.email && (
          <a href={`mailto:${contatto.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <Mail className="size-3.5" /> {contatto.email}
          </a>
        )}
        {contatto.cellulare && (
          <a href={`tel:${contatto.cellulare}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <Smartphone className="size-3.5" /> {contatto.cellulare}
          </a>
        )}
        {contatto.whatsapp && (
          <a
            href={waHref ?? "#"}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <MessageCircle className="size-3.5" /> {contatto.whatsapp}
          </a>
        )}
      </div>
      <div className="mt-3 pt-3 border-t">
        <p className="text-xs font-medium text-muted-foreground mb-2">Consensi privacy</p>
        <div className="flex flex-wrap gap-1.5">
          <ConsensoBadge ok={!!contatto.consenso_profilazione} label="Profilazione" />
          <ConsensoBadge ok={!!contatto.consenso_marketing_media} label="Marketing" />
          <ConsensoBadge ok={!!contatto.consenso_marketing_diretto} label="WhatsApp" />
        </div>
        {contatto.data_firma && (
          <p className="text-xs text-muted-foreground mt-2">
            Firmata il {new Date(contatto.data_firma).toLocaleString("it-IT")}
          </p>
        )}
      </div>
      <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
        {contatto.privacy_firmata && (contatto.pdf_privacy_path || contatto.pdf_privacy_url) && (
          <PdfPrivacyButton path={contatto.pdf_privacy_path} url={contatto.pdf_privacy_url}>
            Scarica PDF
          </PdfPrivacyButton>
        )}
        <FirmaContattoDialog
          cliente={cliente}
          contatto={contatto}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["contatti", clienteId] });
            qc.invalidateQueries({ queryKey: ["contatti-privacy", clienteId] });
          }}
        />
      </div>
    </Card>
  );
}


function PrivacyTab({ cliente }: { cliente: any; onUpdated?: () => void }) {
  const { data: contatti } = useQuery({
    queryKey: ["contatti-privacy", cliente.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("id, nome, cognome, principale, privacy_firmata, data_firma, firma_url, pdf_privacy_url, pdf_privacy_path")
        .eq("cliente_id", cliente.id)
        .order("principale", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const hasContatti = (contatti?.length ?? 0) > 0;
  const firmati = contatti?.filter((c) => c.privacy_firmata).length ?? 0;
  const totali = contatti?.length ?? 0;

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold mb-1">Consenso privacy (GDPR)</h3>
        <p className="text-sm text-muted-foreground">
          Stato delle firme privacy per i contatti di questo cliente. Per raccogliere una nuova firma, apri la tab <strong>Contatti</strong> e usa il pulsante sulla scheda del singolo contatto.
        </p>
      </div>

      {!hasContatti ? (
        <div className="text-sm text-muted-foreground">
          Aggiungi prima un contatto al cliente per poter raccogliere la firma privacy.
        </div>
      ) : (
        <>
          <div className="text-sm">
            <span className="font-medium">{firmati}</span> di <span className="font-medium">{totali}</span> contatti hanno firmato la privacy.
          </div>

          <LinkFirmaPrivacy clienteId={cliente.id} />

          <div className="pt-3 border-t space-y-2">
            <p className="text-sm font-medium">Riepilogo per contatto</p>
            <ul className="divide-y border rounded-md">
              {contatti!.map((c) => (
                <li key={c.id} className="p-3 flex items-center justify-between gap-3 flex-wrap text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {[c.nome, c.cognome].filter(Boolean).join(" ")}
                      {c.principale && <span className="text-xs text-muted-foreground ml-2">(principale)</span>}
                    </div>
                    {c.privacy_firmata && c.data_firma && (
                      <div className="text-xs text-muted-foreground">
                        Firmata il {new Date(c.data_firma).toLocaleString("it-IT")}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {c.privacy_firmata ? (
                      <Badge className="bg-success/15 text-success gap-1">
                        <FileCheck2 className="size-3" /> Firmata
                      </Badge>
                    ) : (
                      <Badge className="bg-destructive/15 text-destructive gap-1">
                        <FileX2 className="size-3" /> Non firmata
                      </Badge>
                    )}
                    {c.privacy_firmata && (c.pdf_privacy_path || c.pdf_privacy_url) && (
                      <>
                        <PdfPrivacyButton path={c.pdf_privacy_path} url={c.pdf_privacy_url} />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toast.info("Funzione in arrivo")}
                          title={`Invia PDF a ${[c.nome, c.cognome].filter(Boolean).join(" ")}`}
                        >
                          Invia PDF
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Card>
  );
}

function FirmaContattoDialog({
  cliente,
  contatto,
  onSaved,
}: {
  cliente: any;
  contatto: any;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const padRef = useRef<HTMLDivElement>(null);
  const [hasSig, setHasSig] = useState(false);
  const [saving, setSaving] = useState(false);

  async function salva() {
    if (!padRef.current) return;
    const dataUrl = getCanvasDataURL(padRef.current);
    if (!dataUrl) { toast.error("Inserisci la firma"); return; }
    setSaving(true);
    try {
      // 1. Verifica esistenza contatto + stato firma (SELECT, mai INSERT)
      const { data: existing, error: selErr } = await supabase
        .from("contatti")
        .select("id, privacy_firmata")
        .eq("id", contatto.id)
        .maybeSingle();
      if (selErr) throw new Error(`Errore lettura contatto: ${selErr.message}`);
      if (!existing) throw new Error("Contatto non trovato: impossibile salvare la firma.");
      if (existing.privacy_firmata) {
        toast.error("Firma già presente per questo contatto");
        setSaving(false);
        return;
      }

      const now = new Date();
      const pngBlob = await (await fetch(dataUrl)).blob();
      const firmaPath = `contatti/${contatto.id}/firma-${now.getTime()}.png`;
      const { error: e1 } = await supabase.storage.from("firme").upload(firmaPath, pngBlob, { upsert: true, contentType: "image/png" });
      if (e1) throw new Error(`Upload firma: ${e1.message}`);
      // Bucket "firme" privato: genera URL firmato a lunga scadenza (10 anni)
      const { data: firmaSigned, error: eFirmaSigned } = await supabase.storage
        .from("firme")
        .createSignedUrl(firmaPath, 60 * 60 * 24 * 365 * 10);
      if (eFirmaSigned || !firmaSigned?.signedUrl) throw new Error(`Signed URL firma: ${eFirmaSigned?.message ?? "vuoto"}`);

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
      const pdfPath = `contatti/${contatto.id}/privacy-${now.getTime()}.pdf`;
      const { error: e2 } = await supabase.storage.from("documenti-privacy").upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (e2) throw new Error(`Upload PDF: ${e2.message}`);
      // Bucket "documenti-privacy" privato: signed URL a lunga scadenza
      const { data: pdfSigned, error: ePdfSigned } = await supabase.storage
        .from("documenti-privacy")
        .createSignedUrl(pdfPath, 60 * 60 * 24 * 365 * 10);
      if (ePdfSigned || !pdfSigned?.signedUrl) throw new Error(`Signed URL PDF: ${ePdfSigned?.message ?? "vuoto"}`);

      // 2. UPDATE sul contatto esistente, mai INSERT
      const { data: updated, error: e3 } = await supabase
        .from("contatti")
        .update({
          privacy_firmata: true,
          data_firma: now.toISOString(),
          firma_url: firmaSigned.signedUrl,
          pdf_privacy_url: pdfSigned.signedUrl,
          pdf_privacy_path: pdfPath,
        })
        .eq("id", contatto.id)
        .select("id")
        .maybeSingle();
      if (e3) throw new Error(`Salvataggio firma: ${e3.message}`);
      if (!updated) throw new Error("Aggiornamento non riuscito: nessuna riga modificata (verifica i permessi).");

      toast.success("Privacy firmata e PDF generato");

      if (contatto.email && pdfSigned?.signedUrl) {
        import("@/lib/send-email").then(({ sendPrivacyPdf }) => {
          sendPrivacyPdf({
            toEmail: contatto.email!,
            toName: [contatto.nome, contatto.cognome].filter(Boolean).join(" "),
            ragioneSociale: cliente.ragione_sociale,
            dataFirma: new Date().toISOString(),
            pdfUrl: pdfSigned.signedUrl,
          }).then((ok) => {
            if (ok) toast.success("PDF privacy inviato per email");
          });
        });
      }

      onSaved();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  const nomeContatto = [contatto.nome, contatto.cognome].filter(Boolean).join(" ");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" disabled={contatto.privacy_firmata}>
          <Pencil className="size-4 mr-1" />
          {contatto.privacy_firmata ? "Firma già presente" : "Raccogli firma"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Firma privacy — {nomeContatto}</DialogTitle>
          <DialogDescription>
            Raccogli qui la firma del contatto. Verrà generato un PDF dell'informativa salvato nella scheda.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div ref={padRef}>
            <SignaturePad onChange={(empty) => setHasSig(!empty)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button>
          <Button onClick={salva} disabled={!hasSig || saving}>
            {saving ? "Salvataggio..." : "Salva firma e genera PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  condizione_pagamento_cod: z.string().trim().max(20).optional().or(z.literal("")),
  condizione_pagamento_desc: z.string().trim().max(200).optional().or(z.literal("")),
  telefono_2: z.string().trim().max(30).optional().or(z.literal("")),
  forma_giuridica: z.string().trim().max(100).optional().or(z.literal("")),
  codice_macrocategoria: z.string().trim().max(10).optional().or(z.literal("")),
  macrocategoria: z.string().trim().max(100).optional().or(z.literal("")),
  codice_categoria: z.string().trim().max(10).optional().or(z.literal("")),
  categoria: z.string().trim().max(100).optional().or(z.literal("")),
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
    condizione_pagamento_cod: cliente.condizione_pagamento_cod ?? "",
    condizione_pagamento_desc: cliente.condizione_pagamento_desc ?? "",
    telefono_2: (cliente as any).telefono_2 ?? "",
    forma_giuridica: (cliente as any).forma_giuridica ?? "",
    codice_macrocategoria: (cliente as any).codice_macrocategoria ?? "",
    macrocategoria: (cliente as any).macrocategoria ?? "",
    codice_categoria: (cliente as any).codice_categoria ?? "",
    categoria: (cliente as any).categoria ?? "",
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
              <Label>Telefono 2</Label>
              <Input value={form.telefono_2} onChange={(e) => set("telefono_2", e.target.value)} />
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
              <CondizionePagamentoSelect
                cod={form.condizione_pagamento_cod ?? ""}
                desc={form.condizione_pagamento_desc ?? ""}
                onChange={(cod, desc) => {
                  set("condizione_pagamento_cod", cod);
                  set("condizione_pagamento_desc", desc);
                  set("condizioni_pagamento", desc);
                }}
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-3 space-y-3">
          <h4 className="text-sm font-semibold">Classificazione</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CategoriaSelect
              type="macrocategoria"
              codice={form.codice_macrocategoria ?? ""}
              label_value={form.macrocategoria ?? ""}
              onChange={(cod, lbl) => {
                set("codice_macrocategoria", cod);
                set("macrocategoria", lbl);
              }}
            />
            <CategoriaSelect
              type="categoria"
              codice={form.codice_categoria ?? ""}
              label_value={form.categoria ?? ""}
              onChange={(cod, lbl) => {
                set("codice_categoria", cod);
                set("categoria", lbl);
              }}
            />
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Forma giuridica</Label>
              <Input
                value={form.forma_giuridica}
                onChange={(e) => set("forma_giuridica", e.target.value)}
                placeholder="Es. S.r.l., S.p.A., Ditta individuale..."
              />
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

function EliminaClienteDialog({
  clienteId: _clienteId,
  ragioneSociale,
  onClose,
  onConfirm,
  pending,
}: {
  clienteId: string;
  ragioneSociale: string;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const [conferma, setConferma] = useState("");
  const ok = conferma.trim().toUpperCase() === "ELIMINA";
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-5" /> Elimina definitivamente
        </DialogTitle>
        <DialogDescription>
          Stai per eliminare in modo permanente <strong>{ragioneSociale}</strong> e tutti i suoi dati (contatti, cantieri, storico).
          Questa operazione è irreversibile. Se il cliente ha richieste fido collegate l'operazione verrà bloccata.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="conferma-elimina" className="text-sm">
          Per confermare digita <code className="font-mono font-bold">ELIMINA</code>:
        </Label>
        <Input
          id="conferma-elimina"
          value={conferma}
          onChange={(e) => setConferma(e.target.value)}
          placeholder="ELIMINA"
          autoComplete="off"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>Annulla</Button>
        <Button variant="destructive" onClick={onConfirm} disabled={!ok || pending}>
          {pending ? "Eliminazione…" : "Elimina definitivamente"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

