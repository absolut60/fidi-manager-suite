import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  ArrowLeft,
  Plus,
  Mail,
  Phone,
  Smartphone,
  Star,
  Trash2,
  FileCheck2,
  FileX2,
  Download,
  Pencil,
  Link as LinkIcon,
  Copy,
  EyeOff,
  AlertTriangle,
  MessageCircle,
  Send,
  CreditCard,
  Building2,
  MapPin,
  Tags,
  Landmark,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { InviaSollecitoDialog } from "@/components/invia-sollecito-dialog";
import { useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ContattoPrivacyAzioni } from "@/components/contatto-privacy-azioni";
import { getFidoAttuale } from "@/lib/fido-cliente";
import { SemaforoAffidabilitaBadge } from "@/components/pannello-rischio-cliente";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { OpportunitaSoggettoLista } from "@/components/opportunita-soggetto-lista";
import { ClienteCantieriTab } from "@/components/cliente-cantieri-tab";
import { ClienteStoricoFidoTab } from "@/components/cliente-storico-fido-tab";
import { ClienteInsolutiTab } from "@/components/cliente-insoluti-tab";
import { ClienteAttivitaRecuperoTab } from "@/components/cliente-attivita-recupero-tab";
import { AllegatiSection } from "@/components/allegati-section";
import { ClienteFatturato } from "@/components/cliente-fatturato";
import { ClienteMarketingTab } from "@/components/cliente-marketing-tab";
import { formatEuro } from "@/lib/fidi";
import { CONSENSO_LABEL } from "@/lib/consensi-testi";
import { classificaScadenza, sommaScadutoCliente, contributoScaduto } from "@/lib/scadenze";
import {
  Ban,
  Calendar,
  Clock,
  Bell,
  CheckCircle2,
  Shield,
  ShieldOff,
  Scale,
  FileText,
  Activity,
} from "lucide-react";
import { NuovoContattoWizard } from "@/components/nuovo-contatto-wizard";
import { RuoloSelect } from "@/components/ruolo-select";
import { CondizionePagamentoSelect } from "@/components/condizione-pagamento-select";
import { CategoriaSelect } from "@/components/categoria-select";

const TAB_VALUES = [
  "riepilogo",
  "anagrafica",
  "contatti",
  "marketing",
  "cantieri",
  "commerciale",
  "storico",
  "scadenziario",
  "solleciti",
  "piani",
  "legali",
  "assicurazioni",
  "attivita",
  "allegati",
  "privacy",
  // legacy: vecchio contenitore "Dati Rischio" (retro-compatibilita' deep-link)
  "insoluti",
] as const;
const INSOLUTI_SUB_VALUES = [
  "riepilogo",
  "scadenziario",
  "solleciti",
  "piani",
  "legali",
  "assicurazioni",
] as const;

const clienteSearchSchema = z.object({
  edit: fallback(z.union([z.literal(1), z.literal("1")]).optional(), undefined),
  tab: fallback(z.enum(TAB_VALUES).optional(), undefined),
  insolutiTab: fallback(z.enum(INSOLUTI_SUB_VALUES).optional(), undefined),
  from: fallback(z.literal("approvazioni").optional(), undefined),
});

export const Route = createFileRoute("/_app/clienti/$clienteId")({
  validateSearch: zodValidator(clienteSearchSchema),
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
    nome: "",
    cognome: "",
    ruolo: "",
    email: "",
    telefono: "",
    cellulare: "",
    whatsapp: "",
    luogo_nascita: "",
    data_nascita: "",
    codice_fiscale: "",
    residenza: "",
    principale: false,
  };
}

function ContattoFormFields({
  form,
  errors,
  set,
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
          <Checkbox
            id="principale"
            checked={form.principale}
            onCheckedChange={(v) => set("principale", v === true)}
          />
          <Label htmlFor="principale" className="cursor-pointer text-sm font-normal">
            Contatto principale
          </Label>
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
            <Input
              placeholder="+39 333 1234567"
              value={form.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t pt-3">
        <h4 className="text-sm font-semibold">Dati personali</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Luogo di nascita</Label>
            <Input
              value={form.luogo_nascita}
              onChange={(e) => set("luogo_nascita", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data di nascita</Label>
            <Input
              type="date"
              value={form.data_nascita}
              onChange={(e) => set("data_nascita", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Codice fiscale</Label>
            <Input
              value={form.codice_fiscale}
              onChange={(e) => set("codice_fiscale", e.target.value)}
            />
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
    <Badge variant="outline" className="text-muted-foreground">
      {label} —
    </Badge>
  );
}

function ClienteDetail() {
  const { clienteId } = Route.useParams();
  const { edit, tab, insolutiTab, from } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role, hasRole } = useAuth();
  const isAdmin = role === "amministratore";
  const isStoreManager = role === "store_manager";
  // Retro-compatibilita': i vecchi link ?tab=insoluti&insolutiTab=x puntano ora al tab promosso
  const effTab =
    tab === "insoluti"
      ? insolutiTab && insolutiTab !== "riepilogo"
        ? insolutiTab
        : "scadenziario"
      : (tab ?? "riepilogo");
  const isAgente = hasRole("agente");

  const [openNew, setOpenNew] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDisattiva, setOpenDisattiva] = useState(false);
  const [openSollecito, setOpenSollecito] = useState(false);
  const [openElimina, setOpenElimina] = useState(false);

  useEffect(() => {
    if (edit === 1 || edit === "1") setOpenEdit(true);
  }, [edit]);

  const disattivaMut = useMutation({
    mutationFn: async () => {
      const { error, data } = await supabase
        .from("clienti")
        .update({ attivo: false })
        .eq("id", clienteId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error("Non hai i permessi per disattivare questo cliente.");
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
        throw new Error(
          `Impossibile eliminare: il cliente ha ${count} richieste fido collegate. Disattivalo invece.`,
        );
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
          {from === "approvazioni" ? (
            <Link to="/approvazioni">
              <ArrowLeft className="size-4" /> Torna alle Approvazioni
            </Link>
          ) : (
            <Link to="/clienti">
              <ArrowLeft className="size-4" /> Clienti
            </Link>
          )}
        </Button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {cliente.ragione_sociale}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {[
                (cliente as any).codice_gestionale
                  ? `Cod. ${(cliente as any).codice_gestionale}`
                  : null,
                cliente.partita_iva ? `P.IVA ${cliente.partita_iva}` : null,
                (cliente as any).stores?.nome
                  ? String((cliente as any).stores.nome).toUpperCase()
                  : null,
                (cliente as any).agente ? `Agente: ${(cliente as any).agente}` : null,
              ]
                .filter(Boolean)
                .join(" — ") || "Partita IVA non inserita"}
            </p>
            {((cliente as any).bloccato || (cliente as any).in_gestione_legale) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(cliente as any).bloccato && (
                  <Link
                    from="/clienti/$clienteId"
                    to="."
                    search={(prev: Record<string, unknown>) => ({
                      ...prev,
                      tab: "storico" as const,
                    })}
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

          <div className="flex flex-wrap gap-2 items-center">
            {cliente.privacy_firmata ? (
              <Badge className="bg-success/15 text-success gap-1">
                <FileCheck2 className="size-3" /> Privacy firmata
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <FileX2 className="size-3" /> Privacy da firmare
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setOpenSollecito(true)}
            >
              <Send className="size-4" /> Invia sollecito
            </Button>
            <InviaSollecitoDialog
              open={openSollecito}
              onOpenChange={setOpenSollecito}
              clienteId={clienteId}
            />
            {!isAgente && (
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
            )}

            {!isAgente && cliente.attivo && (
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
                      Il cliente non comparirà più nelle liste, ma i dati e lo storico restano nel
                      sistema. Potrai riattivarlo in seguito.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setOpenDisattiva(false)}
                      disabled={disattivaMut.isPending}
                    >
                      Annulla
                    </Button>
                    <Button onClick={() => disattivaMut.mutate()} disabled={disattivaMut.isPending}>
                      {disattivaMut.isPending ? "Disattivazione…" : "Disattiva cliente"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {isAdmin && (
              <Dialog
                open={openElimina}
                onOpenChange={(v) => {
                  setOpenElimina(v);
                }}
              >
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

      <Tabs key={effTab} defaultValue={effTab}>
        <TabsList className="md:flex-wrap">
          <TabsTrigger value="riepilogo">Riepilogo</TabsTrigger>
          <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="contatti">Contatti ({contatti?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
          <TabsTrigger value="cantieri">Cantieri</TabsTrigger>
          <TabsTrigger value="commerciale">Commerciale</TabsTrigger>
          <TabsTrigger value="storico">Fido</TabsTrigger>
          <TabsTrigger value="scadenziario">Scadenziario</TabsTrigger>
          <TabsTrigger value="solleciti">Solleciti</TabsTrigger>
          <TabsTrigger value="piani">Piani di rientro</TabsTrigger>
          {!isStoreManager && <TabsTrigger value="legali">Pratiche legali</TabsTrigger>}
          {!isStoreManager && <TabsTrigger value="assicurazioni">Assicurazione</TabsTrigger>}
          <TabsTrigger value="attivita">Attività recupero</TabsTrigger>
          <TabsTrigger value="allegati">Allegati</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="riepilogo" className="space-y-4">
          <SectionErrorBoundary nome="Riepilogo">
          <RiepilogoTab cliente={cliente} clienteId={clienteId} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="anagrafica" className="space-y-3">
          <SectionErrorBoundary nome="Anagrafica">
          <div className="grid grid-cols-1 gap-3">
            <SectionCard title="Identità" icon={Building2} variant="blue">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                <Field label="Ragione sociale" value={cliente.ragione_sociale} highlight />
                <Field
                  label="Codice gestionale"
                  value={(cliente as any).codice_gestionale}
                  highlight
                />
                <Field
                  label="Tipo soggetto"
                  value={
                    (cliente as any).tipo_soggetto === "persona_fisica"
                      ? "Persona fisica"
                      : (cliente as any).tipo_soggetto === "azienda"
                        ? "Azienda"
                        : null
                  }
                />
                <Field label="Partita IVA" value={cliente.partita_iva} />
                <Field label="Codice fiscale" value={cliente.codice_fiscale} />
                <Field label="Forma giuridica" value={(cliente as any).forma_giuridica} />
              </div>
            </SectionCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <SectionCard title="Sede" icon={MapPin} variant="green">
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Indirizzo" value={cliente.indirizzo} />
                  <Field
                    label="Città"
                    value={
                      cliente.citta &&
                      `${cliente.citta}${cliente.provincia ? ` (${cliente.provincia})` : ""}${cliente.cap ? ` — ${cliente.cap}` : ""}`
                    }
                  />
                  <Field label="Punto vendita" value={(cliente as any).stores?.nome} />
                </div>
              </SectionCard>

              <SectionCard title="Contatti" icon={Phone} variant="violet">
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Telefono" value={cliente.telefono} />
                  <Field label="Telefono 2" value={(cliente as any).telefono_2} />
                  <Field label="Email" value={cliente.email} />
                  <Field label="PEC" value={(cliente as any).pec} />
                </div>
              </SectionCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <SectionCard title="Fatturazione" icon={FileText} variant="gray">
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Codice SDI" value={(cliente as any).codice_sdi} />
                  <Field
                    label="Condizione di pagamento"
                    value={
                      (cliente as any).condizione_pagamento_desc ||
                      (cliente as any).condizioni_pagamento ||
                      null
                    }
                  />
                </div>
              </SectionCard>

              <SectionCard title="Classificazione" icon={Tags} variant="amber">
                <div className="grid grid-cols-1 gap-3">
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
                  <Field
                    label="Agente"
                    value={
                      (cliente as any).codice_agente || (cliente as any).agente
                        ? `${(cliente as any).codice_agente ?? ""}${(cliente as any).codice_agente && (cliente as any).agente ? " — " : ""}${(cliente as any).agente ?? ""}`
                        : null
                    }
                  />
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Coordinate bancarie" icon={Landmark} variant="muted">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Field label="Banca" value={(cliente as any).banca} />
                <Field label="Agenzia" value={(cliente as any).agenzia} />
                <Field label="ABI" value={(cliente as any).abi} />
                <Field label="CAB" value={(cliente as any).cab} />
              </div>
            </SectionCard>
          </div>

          {((cliente as any).scheda_pdf_url || cliente.note) && (
            <Card className="p-4 rounded-xl border-[0.5px]">
              {(cliente as any).scheda_pdf_url && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    SCHEDA INSERIMENTO FIRMATA
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a href={(cliente as any).scheda_pdf_url} target="_blank" rel="noreferrer">
                      <Download className="size-4 mr-1" /> Scarica scheda PDF
                    </a>
                  </Button>
                </div>
              )}
              {cliente.note && (
                <div className={`${(cliente as any).scheda_pdf_url ? "mt-4 pt-4 border-t" : ""}`}>
                  <p className="text-xs font-medium text-muted-foreground mb-1">NOTE</p>
                  <p className="text-sm whitespace-pre-wrap">{cliente.note}</p>
                </div>
              )}
            </Card>
          )}
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="contatti" className="space-y-4">
          <SectionErrorBoundary nome="Contatti">
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
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : contatti?.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="font-medium text-sm">Nessun contatto</p>
              <p className="text-xs text-muted-foreground mt-1">
                Aggiungi un referente per questo cliente.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {contatti?.map((c) => (
                <ContattoCard
                  key={c.id}
                  cliente={cliente}
                  clienteId={clienteId}
                  contatto={c}
                  onDelete={() => {
                    if (confirm("Eliminare questo contatto?")) deleteContatto.mutate(c.id);
                  }}
                />
              ))}
            </div>
          )}
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="marketing" className="space-y-4">
          <SectionErrorBoundary nome="Marketing">
          <ClienteMarketingTab clienteId={clienteId} cliente={cliente as any} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="cantieri">
          <SectionErrorBoundary nome="Cantieri">
          <ClienteCantieriTab clienteId={clienteId} ragioneSociale={cliente.ragione_sociale} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="commerciale">
          <SectionErrorBoundary nome="Commerciale">
          <OpportunitaSoggettoLista
            soggetto={{ tipo: "cliente", id: clienteId, etichetta: cliente.ragione_sociale }}
          />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="storico">
          <SectionErrorBoundary nome="Fido">
          <ClienteStoricoFidoTab clienteId={clienteId} />
          </SectionErrorBoundary>
        </TabsContent>

        {(["scadenziario", "solleciti", "piani", "legali", "assicurazioni"] as const).map((s) =>
          (s === "legali" || s === "assicurazioni") && isStoreManager ? null : (
            <TabsContent key={s} value={s}>
              <SectionErrorBoundary nome={s}>
              <ClienteInsolutiTab
                cliente={{
                  id: clienteId,
                  bloccato: (cliente as any).bloccato,
                  in_gestione_legale: (cliente as any).in_gestione_legale,
                  motivo_blocco: (cliente as any).motivo_blocco,
                  data_blocco: (cliente as any).data_blocco,
                }}
                sezione={s}
              />
              </SectionErrorBoundary>
            </TabsContent>
          ),
        )}

        <TabsContent value="attivita">
          <SectionErrorBoundary nome="Attività recupero">
          <ClienteAttivitaRecuperoTab clienteId={clienteId} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="allegati">
          <SectionErrorBoundary nome="Allegati">
          <Card className="p-6">
            <AllegatiSection
              entitaTipo="cliente"
              entitaId={clienteId}
              clienteId={clienteId}
              canEdit
              title="Documenti del cliente"
            />
          </Card>
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="privacy">
          <SectionErrorBoundary nome="Privacy">
          <PrivacyTab
            cliente={cliente}
            onUpdated={() => qc.invalidateQueries({ queryKey: ["cliente", clienteId] })}
          />
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string | null;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className={`mt-0.5 ${highlight ? "font-semibold" : ""}`}>
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  variant,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  variant: "blue" | "green" | "violet" | "gray" | "amber" | "muted";
  children: ReactNode;
  className?: string;
}) {
  const variants = {
    blue: { border: "border-l-blue-500", text: "text-blue-700 dark:text-blue-400" },
    green: { border: "border-l-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
    violet: { border: "border-l-violet-500", text: "text-violet-700 dark:text-violet-400" },
    gray: { border: "border-l-slate-400", text: "text-slate-700 dark:text-slate-400" },
    amber: { border: "border-l-amber-500", text: "text-amber-700 dark:text-amber-400" },
    muted: { border: "border-l-slate-300", text: "text-slate-600 dark:text-slate-400" },
  } as const;
  const v = variants[variant];
  return (
    <Card
      className={`p-4 rounded-l-none rounded-r-xl border-[0.5px] border-l-[3px] ${v.border} h-full ${className ?? ""}`}
    >
      <div
        className={`flex items-center gap-2 mb-3 text-sm font-semibold uppercase tracking-wide ${v.text}`}
      >
        {Icon && <Icon className="size-4" />}
        <span>{title}</span>
      </div>
      {children}
    </Card>
  );
}

function fmtDateIt(v: unknown): string {
  if (!v) return "—";
  try {
    return new Date(String(v)).toLocaleDateString("it-IT");
  } catch {
    return String(v);
  }
}

function RiepilogoTab({ cliente, clienteId }: { cliente: any; clienteId: string }) {
  const config = useConfig();
  const navigate = useNavigate();
  const vaiAlTab = (tab: string) =>
    navigate({
      to: "/clienti/$clienteId",
      params: { clienteId },
      search: (prev: any) => ({ ...prev, tab }),
    });
  const bloccato = !!cliente.bloccato;
  const indBlocco = Number(cliente.ind_blocco ?? 0);
  const ultimaFatt = cliente.ultima_data_fatturazione;
  const clienteAttivo = isClienteAttivo(
    cliente.ultima_data_fatturazione,
    cliente.doc_da_fatturare,
    config,
  );
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
      return data as {
        assicuratore: string;
        importo_massimale: number | null;
        data_scadenza: string | null;
        stato: string;
      } | null;
    },
    enabled: assicurato,
  });
  const polizzaScaduta = !!(
    polizzaAttiva?.data_scadenza && new Date(polizzaAttiva.data_scadenza) < new Date()
  );

  const { data: ins } = useQuery({
    queryKey: ["riepilogo-tab-insoluti", clienteId],
    queryFn: async () => {
      const { data: scad, error } = await supabase
        .from("scadenze")
        .select(
          "importo_scadenza, giorni_ritardo, stato_contabile, tempi_scadenza, data_scadenza, data_pagamento_effettiva, numero_documento",
        )
        .eq("cliente_id", clienteId);
      if (error) throw error;
      const rows = (scad ?? []) as Array<{
        importo_scadenza: number | null;
        giorni_ritardo: number | null;
        stato_contabile: string | null;
        tempi_scadenza: string | null;
        data_scadenza: string | null;
        data_pagamento_effettiva: string | null;
        numero_documento: string | null;
      }>;
      const scadute = rows.filter((s) => classificaScadenza(s) === "scaduto");
      const aScadere = rows.filter((s) => classificaScadenza(s) === "a_scadere");
      const sum = (arr: typeof rows) =>
        arr.reduce((a, r) => a + Number(r.importo_scadenza ?? 0), 0);
      // Fasce: contributo signed con anticipi sottratti (no clamp per-fascia).
      const sumContrib = (arr: typeof rows) =>
        arr.reduce((acc, r) => acc + contributoScaduto(r), 0);
      const maxGg = [...scadute, ...aScadere].reduce(
        (m, r) => Math.max(m, Number(r.giorni_ritardo ?? 0)),
        0,
      );
      const fascia = (min: number, max: number | null) =>
        sumContrib(
          scadute.filter((s) => {
            const g = Number(s.giorni_ritardo ?? 0);
            return g >= min && (max == null || g <= max);
          }),
        );
      const { data: ultSoll } = await supabase
        .from("solleciti")
        .select("data_sollecito")
        .eq("cliente_id", clienteId)
        .order("data_sollecito", { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        // Scaduto con anticipi sottratti + clamp >=0 (src/lib/scadenze.ts).
        totale_scaduto: sommaScadutoCliente(scadute),
        totale_a_scadere: sum(aScadere),
        max_giorni_ritardo: maxGg,
        scaduto_0_30: fascia(1, 30),
        scaduto_30_60: fascia(31, 60),
        scaduto_oltre_60: fascia(61, null),
        ultimo_sollecito:
          (ultSoll as { data_sollecito: string | null } | null)?.data_sollecito ?? null,
      };
    },
  });

  const totScaduto = Number(ins?.totale_scaduto ?? 0);
  const totFasce =
    Number(ins?.scaduto_0_30 ?? 0) +
    Number(ins?.scaduto_30_60 ?? 0) +
    Number(ins?.scaduto_oltre_60 ?? 0);
  const pct = (v: number) => (totFasce > 0 ? (v / totFasce) * 100 : 0);
  const maxGg = Number(ins?.max_giorni_ritardo ?? 0);

  // Dati rischio
  const fidoGest = Number(cliente.fido_gestionale ?? cliente.fido ?? 0);
  const totRischio = Number(cliente.totale_rischio ?? 0);
  const fidoResiduo = cliente.fido_residuo == null ? null : Number(cliente.fido_residuo);
  const scaduto = Number(cliente.scaduto ?? 0);
  const condPag = cliente.condizione_pagamento_desc || cliente.condizioni_pagamento;

  return (
    <div className="space-y-5">
      {/* Banner assicurazione (compatto) */}
      {assicurato && (
        <div
          className={`rounded-lg border px-3 py-2 flex items-center gap-2 text-xs ${polizzaScaduta ? "border-destructive/40 bg-destructive/10" : "border-success/30 bg-success/10"}`}
        >
          <Shield
            className={`size-4 shrink-0 ${polizzaScaduta ? "text-destructive" : "text-success"}`}
          />
          <p className={`font-medium ${polizzaScaduta ? "text-destructive" : "text-success"}`}>
            Assicurato {polizzaAttiva?.assicuratore || "POUEY"}
            {polizzaAttiva?.importo_massimale != null
              ? ` — Massimale: ${formatEuro(polizzaAttiva.importo_massimale)}`
              : ""}
            {polizzaAttiva?.data_scadenza
              ? ` — Scade: ${fmtDateIt(polizzaAttiva.data_scadenza)}`
              : ""}
          </p>
          {polizzaScaduta && (
            <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive ml-auto text-[10px] py-0">
              Polizza scaduta
            </Badge>
          )}
        </div>
      )}

      {/* Colpo d'occhio — griglia compatta a 4 colonne */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Colpo d'occhio
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Card className="p-3.5 rounded-xl border-[0.5px]">
            <p className="text-[11px] font-medium text-muted-foreground uppercase truncate">
              Semaforo affidabilità
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 text-sm">
              <SemaforoAffidabilitaBadge clienteId={cliente.id} />
            </div>
          </Card>

          <MiniStat
            label="Fido gestionale"
            value={formatEuro(fidoGest)}
            size="md"
            onClick={() => vaiAlTab("storico")}
          />
          <MiniStat
            label="Totale rischio"
            value={formatEuro(totRischio)}
            size="md"
            onClick={() => vaiAlTab("scadenziario")}
          />

          {(() => {
            const pctUtil = fidoGest > 0 ? Math.round((totRischio / fidoGest) * 100) : null;
            const hintTone =
              pctUtil == null
                ? "default"
                : pctUtil >= 100
                  ? "destructive"
                  : pctUtil >= 70
                    ? "warning"
                    : "default";
            return (
              <MiniStat
                label="Fido residuo"
                value={formatEuro(fidoResiduo)}
                tone={fidoResiduo != null && fidoResiduo < 0 ? "destructive" : "default"}
                hint={pctUtil == null ? undefined : `${pctUtil}% utilizzo`}
                hintTone={hintTone}
                size="md"
                onClick={() => vaiAlTab("storico")}
              />
            );
          })()}

          <MiniStat
            label="Scaduto"
            value={formatEuro(cliente.scaduto)}
            tone={scaduto > 0 ? "destructive" : "default"}
            size="md"
            onClick={() => vaiAlTab("scadenziario")}
          />
          <MiniStat
            label="A scadere"
            value={formatEuro(cliente.a_scadere)}
            size="md"
            onClick={() => vaiAlTab("scadenziario")}
          />
          <MiniStat
            label="Max gg ritardo"
            value={`${maxGg} gg`}
            tone={maxGg > 60 ? "destructive" : maxGg > 30 ? "warning" : "default"}
            size="md"
            icon={Clock}
            onClick={() => vaiAlTab("scadenziario")}
          />

          <Card className="p-3.5 rounded-xl border-[0.5px]">
            <p className="text-[11px] font-medium text-muted-foreground uppercase truncate">
              Metodo di pagamento
            </p>
            <div className="mt-1.5 flex items-start gap-2">
              <CreditCard className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[14px] font-medium leading-snug text-foreground">
                {condPag || "—"}
              </p>
            </div>
          </Card>

          {(() => {
            const isBloccato = bloccato || indBlocco >= 1;
            const statoTxt = isBloccato
              ? indBlocco === 1 && !bloccato
                ? "Bloccato (sbloccabile)"
                : "Bloccato"
              : cliente.in_gestione_legale
                ? "In gestione legale"
                : clienteAttivo
                  ? "Regolare"
                  : "Non attivo";
            const dest = isBloccato ? "storico" : cliente.in_gestione_legale ? "legali" : null;
            const tone = isBloccato
              ? "destructive"
              : cliente.in_gestione_legale
                ? "warning"
                : "default";
            return (
              <MiniStat
                label="Stato cliente"
                value={statoTxt}
                tone={tone}
                hint={ultimaFatt ? `ult. fatt. ${fmtDateIt(ultimaFatt)}` : undefined}
                size="md"
                onClick={dest ? () => vaiAlTab(dest) : undefined}
              />
            );
          })()}

          <Card className="p-3.5 rounded-xl border-[0.5px]">
            <p className="text-[11px] font-medium text-muted-foreground uppercase truncate">
              Assicurazione
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              {assicurato ? (
                <>
                  <Badge variant="outline" className="gap-1 text-[10px] py-0 text-muted-foreground">
                    <Shield className="size-3" /> POUEY
                  </Badge>
                  {polizzaAttiva?.importo_massimale != null && (
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatEuro(polizzaAttiva.importo_massimale)}
                    </span>
                  )}
                </>
              ) : (
                <Badge variant="outline" className="gap-1 text-[10px] py-0 text-muted-foreground">
                  <ShieldOff className="size-3" /> Non assicurato
                </Badge>
              )}
            </div>
          </Card>
        </div>
      </section>

      {/* Sezioni tematiche in due colonne */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Composizione esposizione */}
        {(() => {
          const ddt = Number(cliente.doc_da_fatturare ?? 0);
          const eff = Number(cliente.effetti_a_rischio ?? 0);
          const ord = Number(cliente.doc_da_evadere ?? 0);
          if (!ddt && !eff && !ord) return null;
          return (
            <Card className="p-4 rounded-xl border-l-[3px] border-l-blue-500">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-800 flex items-center gap-1.5 mb-3">
                <FileText className="size-3.5" /> Composizione esposizione
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <MiniStat
                  label="DDT da fatturare"
                  value={formatEuro(ddt)}
                  title="Materiale consegnato non ancora fatturato — concorre al rischio"
                />
                <MiniStat
                  label="Effetti a rischio (RB)"
                  value={formatEuro(eff)}
                  title="Effetti presentati non ancora incassati"
                />
                <MiniStat
                  label="Ordini da evadere"
                  value={formatEuro(ord)}
                  hint="non concorre al fido"
                />
              </div>
            </Card>
          );
        })()}

        {/* Comportamento pagamento */}
        {(() => {
          const ni = cliente.num_insoluti;
          const dc = cliente.dilazione_concordata;
          const de = cliente.dilazione_effettiva;
          if (ni == null && dc == null && de == null) return null;
          const r = ritardoHelper(dc, de);
          return (
            <Card className="p-4 rounded-xl border-l-[3px] border-l-slate-400">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700 flex items-center gap-1.5 mb-3">
                <Clock className="size-3.5" /> Comportamento pagamento
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <MiniStat
                  label="Insoluti storici"
                  value={ni == null ? "—" : String(ni)}
                  tone={ni != null && Number(ni) > 0 ? "destructive" : "default"}
                />
                <MiniStat label="Dilazione concordata" value={dc != null ? `${dc} gg` : "—"} />
                <MiniStat
                  label="Ritardo medio reale"
                  value={r.text}
                  tone={r.tone}
                  title="Differenza tra dilazione effettiva e concordata"
                />
              </div>
            </Card>
          );
        })()}

        {/* Riepilogo insoluti */}
        <Card className="p-4 rounded-xl border-l-[3px] border-l-amber-500">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800 flex items-center gap-1.5 mb-3">
            <AlertTriangle className="size-3.5" /> Riepilogo insoluti
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <MiniStat
              label="Totale scaduto"
              value={formatEuro(totScaduto)}
              tone={totScaduto > 0 ? "destructive" : "default"}
              icon={AlertTriangle}
            />
            <MiniStat
              label="A scadere"
              value={formatEuro(ins?.totale_a_scadere ?? 0)}
              icon={Calendar}
            />
            <MiniStat
              label="Max gg ritardo"
              value={`${maxGg} gg`}
              tone={maxGg > 60 ? "destructive" : maxGg > 30 ? "warning" : "default"}
              icon={Clock}
            />
            <MiniStat
              label="Ultimo sollecito"
              value={fmtDateIt(ins?.ultimo_sollecito)}
              icon={Bell}
            />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">
              Fasce di scaduto
            </p>
            <FasciaRow
              label="0–30 giorni"
              value={Number(ins?.scaduto_0_30 ?? 0)}
              pct={pct(Number(ins?.scaduto_0_30 ?? 0))}
              color="bg-yellow-500"
            />
            <FasciaRow
              label="31–60 giorni"
              value={Number(ins?.scaduto_30_60 ?? 0)}
              pct={pct(Number(ins?.scaduto_30_60 ?? 0))}
              color="bg-orange-500"
            />
            <FasciaRow
              label="oltre 60 giorni"
              value={Number(ins?.scaduto_oltre_60 ?? 0)}
              pct={pct(Number(ins?.scaduto_oltre_60 ?? 0))}
              color="bg-destructive"
            />
          </div>
        </Card>

        {/* Fatturato */}
        <Card className="p-4 rounded-xl border-l-[3px] border-l-green-600">
          <ClienteFatturato clienteId={clienteId} titleClassName="text-green-800 mb-3" />
        </Card>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
  icon: Icon,
  hint,
  hintTone,
  title,
  onClick,
  size = "sm",
}: {
  label: string;
  value: string;
  tone?: "default" | "destructive" | "warning" | "info" | "success" | "muted";
  icon?: typeof Calendar;
  hint?: string;
  hintTone?: "default" | "destructive" | "warning";
  title?: string;
  onClick?: () => void;
  size?: "sm" | "md";
}) {
  const valCls =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-orange-600"
        : tone === "info"
          ? "text-primary"
          : tone === "success"
            ? "text-success"
            : tone === "muted"
              ? "text-muted-foreground"
              : "";
  const hintCls =
    hintTone === "destructive"
      ? "text-destructive"
      : hintTone === "warning"
        ? "text-orange-600"
        : "text-muted-foreground";
  const body = (
    <Card
      className={`${size === "md" ? "p-3.5" : "px-3 py-2"} h-full rounded-xl border-[0.5px] ${onClick ? "transition-colors hover:bg-accent/50 hover:border-primary/40 cursor-pointer" : ""}`}
      title={title}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={`${size === "md" ? "text-[11px]" : "text-[10px]"} font-medium text-muted-foreground uppercase truncate`}
          >
            {label}
          </p>
          <p
            className={`${size === "md" ? "text-[17px] sm:text-[19px]" : "text-[13px] sm:text-[15px]"} font-bold mt-0.5 tabular-nums whitespace-nowrap leading-tight ${valCls}`}
          >
            {value}
          </p>
          {hint && (
            <p
              className={`${size === "md" ? "text-[11px]" : "text-[10px]"} mt-0.5 truncate ${hintCls}`}
            >
              {hint}
            </p>
          )}
        </div>
        {Icon && <Icon className="size-3.5 text-muted-foreground shrink-0" />}
      </div>
    </Card>
  );
  if (!onClick) return body;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </button>
  );
}

function ritardoHelper(
  dilConc: number | null | undefined,
  dilEff: number | null | undefined,
): { text: string; tone: "destructive" | "success" | "muted" } {
  if (dilConc == null || dilEff == null) return { text: "—", tone: "muted" };
  const diff = Number(dilEff) - Number(dilConc);
  if (diff > 0) return { text: `+${diff} gg`, tone: "destructive" };
  return { text: "In orario", tone: "success" };
}

function FasciaRow({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: number;
  pct: number;
  color: string;
}) {
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
      r.error.issues.forEach((i) => {
        errs[i.path[0] as string] = i.message;
      });
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
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
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
      r.error.issues.forEach((i) => {
        errs[i.path[0] as string] = i.message;
      });
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
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : "Salva modifiche"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ContattoCard({
  cliente,
  clienteId,
  contatto,
  onDelete,
}: {
  cliente: any;
  clienteId: string;
  contatto: any;
  onDelete: () => void;
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
            <p className="font-semibold truncate">
              {contatto.nome} {contatto.cognome}
            </p>
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
          {contatto.ruolo && (
            <p className="text-xs text-muted-foreground mt-0.5">{contatto.ruolo}</p>
          )}
        </div>
        <div className="flex">
          <Dialog open={openEdit} onOpenChange={setOpenEdit}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-4" />
              </Button>
            </DialogTrigger>
            {openEdit && (
              <EditContattoDialog contatto={contatto} onClose={() => setOpenEdit(false)} />
            )}
          </Dialog>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-sm">
        {contatto.email && (
          <a
            href={`mailto:${contatto.email}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <Mail className="size-3.5" /> {contatto.email}
          </a>
        )}
        {contatto.cellulare && (
          <a
            href={`tel:${contatto.cellulare}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <Smartphone className="size-3.5" /> {contatto.cellulare}
          </a>
        )}
        {contatto.whatsapp && (
          <a
            href={waHref ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <MessageCircle className="size-3.5" /> {contatto.whatsapp}
          </a>
        )}
      </div>
      <div className="mt-3 pt-3 border-t">
        <ContattoPrivacyAzioni
          contatto={contatto}
          onRefresh={() => {
            qc.invalidateQueries({ queryKey: ["contatti", clienteId] });
            qc.invalidateQueries({ queryKey: ["contatti-privacy", clienteId] });
          }}
        />
      </div>
    </Card>
  );
}

function PrivacyTab({ cliente }: { cliente: any; onUpdated?: () => void }) {
  const qcPrivacy = useQueryClient();
  const { data: contatti } = useQuery({
    queryKey: ["contatti-privacy", cliente.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select(
          "id, nome, cognome, email, principale, privacy_firmata, data_firma, firma_url, pdf_privacy_url, pdf_privacy_path, consenso_profilazione, consenso_marketing_media, consenso_marketing_diretto, richiesta_privacy_generata_il, richiesta_privacy_inviata_il, richiesta_privacy_aperta_il",
        )
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
          Stato delle firme privacy per i contatti di questo cliente. Per raccogliere una nuova
          firma, apri la tab <strong>Contatti</strong> e usa il pulsante sulla scheda del singolo
          contatto.
        </p>
      </div>

      {!hasContatti ? (
        <div className="text-sm text-muted-foreground">
          Aggiungi prima un contatto al cliente per poter raccogliere la firma privacy.
        </div>
      ) : (
        <>
          <div className="text-sm">
            <span className="font-medium">{firmati}</span> di{" "}
            <span className="font-medium">{totali}</span> contatti hanno firmato la privacy.
          </div>

          <div className="pt-3 border-t space-y-2">
            <p className="text-sm font-medium">Riepilogo per contatto</p>
            <ul className="divide-y border rounded-md">
              {contatti!.map((c) => (
                <li key={c.id} className="p-3 space-y-2 text-sm">
                  <div className="font-medium truncate">
                    {[c.nome, c.cognome].filter(Boolean).join(" ")}
                    {c.principale && (
                      <span className="text-xs text-muted-foreground ml-2">(principale)</span>
                    )}
                  </div>
                  <ContattoPrivacyAzioni
                    contatto={c as any}
                    onRefresh={() => {
                      qcPrivacy.invalidateQueries({ queryKey: ["contatti-privacy", cliente.id] });
                      qcPrivacy.invalidateQueries({ queryKey: ["contatti", cliente.id] });
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Card>
  );
}

// Il vecchio <FirmaContattoDialog> ("Raccogli firma": solo firma grafica, senza
// dati dichiarante né i 3 consensi) è stato rimosso: la raccolta privacy passa
// esclusivamente da <ContattoPrivacyAzioni> (Compila di persona / link a distanza).

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

function EditClienteDialog({
  cliente,
  onClose,
  onSaved,
}: {
  cliente: any;
  onClose: () => void;
  onSaved: () => void;
}) {
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
      const { data, error } = await supabase
        .from("stores")
        .select("id, nome, codice")
        .eq("attivo", true)
        .order("nome");
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
        if (
          (error as any).code === "23505" ||
          error.message.includes("clienti_codice_gestionale_unique")
        ) {
          throw new Error("Codice gestionale già utilizzato da un altro cliente.");
        }
        throw error;
      }
      if (!data || data.length === 0) {
        throw new Error(
          "Non hai i permessi per modificare questo cliente (è di un altro punto vendita).",
        );
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
      r.error.issues.forEach((i) => {
        errs[i.path[0] as string] = i.message;
      });
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
            <Input
              value={form.ragione_sociale}
              onChange={(e) => set("ragione_sociale", e.target.value)}
            />
            {errors.ragione_sociale && (
              <p className="text-xs text-destructive">{errors.ragione_sociale}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Tipo soggetto</Label>
            <select
              value={form.tipo_soggetto ?? "none"}
              onChange={(e) =>
                set(
                  "tipo_soggetto",
                  e.target.value === "none"
                    ? null
                    : (e.target.value as "persona_fisica" | "azienda"),
                )
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="none">—</option>
              <option value="persona_fisica">Persona fisica</option>
              <option value="azienda">Azienda</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Codice gestionale</Label>
            <Input
              value={form.codice_gestionale}
              onChange={(e) => set("codice_gestionale", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Partita IVA</Label>
            <Input value={form.partita_iva} onChange={(e) => set("partita_iva", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Codice fiscale</Label>
            <Input
              value={form.codice_fiscale}
              onChange={(e) => set("codice_fiscale", e.target.value)}
            />
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
                <option key={s.id} value={s.id}>
                  {s.nome} ({s.codice})
                </option>
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
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
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
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
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
          Stai per eliminare in modo permanente <strong>{ragioneSociale}</strong> e tutti i suoi
          dati (contatti, cantieri, storico). Questa operazione è irreversibile. Se il cliente ha
          richieste fido collegate l'operazione verrà bloccata.
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
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Annulla
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={!ok || pending}>
          {pending ? "Eliminazione…" : "Elimina definitivamente"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
