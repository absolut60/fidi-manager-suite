import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
  ScrollText,
  Info,
  UserPlus,
  Undo2,
  Pencil,
  X,
  User,
  Phone,
  MapPin,
  Target,
  Calendar,
  StickyNote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { OpportunitaSoggettoLista } from "@/components/opportunita-soggetto-lista";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LeadContattiTab,
  LeadCantieriTab,
  useLeadContatti,
} from "@/components/lead/lead-relazioni-tabs";
import { LeadAzioniStato } from "@/components/lead/lead-azioni-stato";
import { LeadRichiesteTab } from "@/components/lead/lead-richieste-tab";

import {
  LEAD_STATO_LABEL,
  LEAD_STATO_CLASS,
  LEAD_TIPI,
  LEAD_TIPO_LABEL,
  LEAD_FONTI,
  LEAD_FONTE_LABEL,
  LEAD_PRIORITA,
  LEAD_PRIORITA_LABEL,
  LEAD_PRIORITA_CLASS,
  nomeLead,
  formatData,
  puoAccedereLead,
  type LeadTipo,
  type LeadFonte,
  type LeadPriorita,
} from "@/lib/lead-costanti";

export const Route = createFileRoute("/_app/lead/$leadId")({
  component: LeadDettaglioPage,
});

const NESSUNO = "__none__";

type Form = {
  tipo_soggetto: string;
  ragione_sociale: string;
  nome: string;
  cognome: string;
  partita_iva: string;
  codice_fiscale: string;
  email: string;
  telefono: string;
  cellulare: string;
  indirizzo: string;
  citta: string;
  cap: string;
  provincia: string;
  fonte: LeadFonte;
  fonte_dettaglio: string;
  tipo_lead: LeadTipo;
  priorita: LeadPriorita;
  store_id: string;
  agente_codice: string;
  prossima_azione_il: string;
  prossima_azione_tipo: string;
  prossima_azione_nota: string;
  note: string;
};

function LeadDettaglioPage() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles, loading: authLoading, user } = useAuth();
  const canSee = useMemo(() => puoAccedereLead(roles as string[]), [roles]);

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead")
        .select("*")
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["stores", "all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, nome")
        .eq("attivo", true)
        .order("nome");
      return data ?? [];
    },
  });
  const { data: agenti } = useQuery({
    queryKey: ["agenti-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agenti")
        .select("codice, descrizione")
        .order("descrizione");
      return (data ?? []) as { codice: string; descrizione: string }[];
    },
    staleTime: 5 * 60_000,
  });
  const { data: profili } = useQuery({
    queryKey: ["utenti-assegnabili"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_utenti_assegnabili");
      return (data ?? []) as { id: string; nome: string | null; cognome: string | null }[];
    },
    staleTime: 5 * 60_000,
  });

  const nomeProfilo = (id: string | null) => {
    if (!id) return "—";
    const p = profili?.find((x) => x.id === id);
    return p ? `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || "—" : "—";
  };

  const [f, setF] = useState<Form | null>(null);
  const [editMode, setEditMode] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => (p ? { ...p, [k]: v } : p));

  const buildForm = (l: NonNullable<typeof lead>): Form => ({
    tipo_soggetto: l.tipo_soggetto ?? "azienda",
    ragione_sociale: l.ragione_sociale ?? "",
    nome: l.nome ?? "",
    cognome: l.cognome ?? "",
    partita_iva: l.partita_iva ?? "",
    codice_fiscale: l.codice_fiscale ?? "",
    email: l.email ?? "",
    telefono: l.telefono ?? "",
    cellulare: l.cellulare ?? "",
    indirizzo: l.indirizzo ?? "",
    citta: l.citta ?? "",
    cap: l.cap ?? "",
    provincia: l.provincia ?? "",
    fonte: l.fonte,
    fonte_dettaglio: l.fonte_dettaglio ?? "",
    tipo_lead: l.tipo_lead,
    priorita: l.priorita,
    store_id: l.store_id ?? "",
    agente_codice: l.agente_codice ?? "",
    prossima_azione_il: l.prossima_azione_il ?? "",
    prossima_azione_tipo: l.prossima_azione_tipo ?? "",
    prossima_azione_nota: l.prossima_azione_nota ?? "",
    note: l.note ?? "",
  });

  useEffect(() => {
    if (!lead) return;
    setF(buildForm(lead));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!f || !lead) return;
      const payload = {
        tipo_soggetto: f.tipo_soggetto || null,
        ragione_sociale: f.ragione_sociale.trim() || null,
        nome: f.nome.trim() || null,
        cognome: f.cognome.trim() || null,
        partita_iva: f.partita_iva.trim() || null,
        codice_fiscale: f.codice_fiscale.trim() || null,
        email: f.email.trim() || null,
        telefono: f.telefono.trim() || null,
        cellulare: f.cellulare.trim() || null,
        indirizzo: f.indirizzo.trim() || null,
        citta: f.citta.trim() || null,
        cap: f.cap.trim() || null,
        provincia: f.provincia.trim() || null,
        fonte: f.fonte,
        fonte_dettaglio: f.fonte_dettaglio.trim() || null,
        tipo_lead: f.tipo_lead,
        priorita: f.priorita,
        store_id: f.store_id || null,
        agente_codice: f.agente_codice || null,
        prossima_azione_il: f.prossima_azione_il || null,
        prossima_azione_tipo: f.prossima_azione_tipo.trim() || null,
        prossima_azione_nota: f.prossima_azione_nota.trim() || null,
        note: f.note.trim() || null,
      };
      const { error } = await supabase.from("lead").update(payload).eq("id", leadId);
      if (error) throw error;
    },

    onSuccess: () => {
      toast.success("Lead aggiornato");
      setEditMode(false);
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-storico", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-lista"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("elimina_lead", { _lead_id: leadId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead eliminato");
      qc.invalidateQueries({ queryKey: ["lead-lista"] });
      navigate({ to: "/lead" });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 10000 }),
  });

  const isAdmin = (roles as string[])?.includes("amministratore");
  type Duplicato = {
    id: string;
    ragione_sociale: string | null;
    partita_iva: string | null;
    codice_fiscale: string | null;
  };
  const [duplicati, setDuplicati] = useState<Duplicato[] | null>(null);

  const convertiMut = useMutation({
    mutationFn: async (forza: boolean) => {
      const { data, error } = await supabase.rpc("converti_lead_in_cliente", {
        _lead_id: leadId,
        _forza_duplicato: forza,
      });
      if (error) throw error;
      return (data ?? [])[0] as { cliente_id: string | null; duplicati: unknown } | undefined;
    },
    onSuccess: (res) => {
      if (res?.duplicati && !res.cliente_id) {
        setDuplicati(res.duplicati as Duplicato[]);
        return;
      }
      setDuplicati(null);
      toast.success("Lead convertito in cliente");
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-storico", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-lista"] });
      if (res?.cliente_id)
        navigate({ to: "/clienti/$clienteId", params: { clienteId: res.cliente_id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const annullaMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("annulla_conversione_lead", { _lead_id: leadId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conversione annullata");
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-storico", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-lista"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 10000 }),
  });

  const { data: storico } = useQuery({
    queryKey: ["lead-storico", leadId],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_storico")
        .select("id, stato_da, stato_a, operatore_id, nota, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contattiLead } = useLeadContatti(leadId, canSee);
  const haContatti = (contattiLead?.length ?? 0) > 0;

  if (authLoading) return <Skeleton className="h-40 w-full" />;

  if (!canSee) {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Accesso riservato</p>
        <p className="text-sm text-muted-foreground mt-1">
          Questa sezione è riservata ai ruoli Marketing, Amministrazione, Direzione e
          Amministratore.
        </p>
      </Card>
    );
  }

  if (isLoading || !f) return <Skeleton className="h-64 w-full" />;

  if (!lead) {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Lead non trovato</p>
        <Link to="/lead" className="text-sm underline mt-2 inline-block">
          Torna all'elenco
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/lead"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-4" /> Lead
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 truncate">
            {nomeLead(lead)}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge className={LEAD_STATO_CLASS[lead.stato]}>{LEAD_STATO_LABEL[lead.stato]}</Badge>
            <Badge className={LEAD_PRIORITA_CLASS[lead.priorita]}>
              {LEAD_PRIORITA_LABEL[lead.priorita]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {LEAD_TIPO_LABEL[lead.tipo_lead]} · fonte {LEAD_FONTE_LABEL[lead.fonte]} · creato{" "}
              {formatData(lead.created_at)}
            </span>
            {lead.cliente_id && (
              <Link
                to="/clienti/$clienteId"
                params={{ clienteId: lead.cliente_id }}
                className="text-xs underline"
              >
                Cliente collegato
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && lead.stato !== "convertito" && (
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={convertiMut.isPending}
              onClick={() => convertiMut.mutate(false)}
            >
              {convertiMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Converti in cliente
            </Button>
          )}
          {isAdmin && lead.stato === "convertito" && (
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={annullaMut.isPending}
              onClick={() => {
                if (confirm("Annullare la conversione ed eliminare il cliente creato?"))
                  annullaMut.mutate();
              }}
            >
              {annullaMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Undo2 className="size-4" />
              )}
              Annulla conversione
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-1.5 text-destructive"
            onClick={() => {
              if (
                confirm(
                  "Eliminare definitivamente questo lead? Verranno eliminati anche i contatti e i cantieri collegati solo a questo lead.",
                )
              )
                delMut.mutate();
            }}
          >
            <Trash2 className="size-4" /> Elimina
          </Button>
          {editMode ? (
            <>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  setF(buildForm(lead));
                  setEditMode(false);
                }}
              >
                <X className="size-4" /> Annulla
              </Button>
              <Button
                className="gap-1.5"
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                {saveMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}{" "}
                Salva
              </Button>
            </>
          ) : (
            <Button className="gap-1.5" onClick={() => setEditMode(true)}>
              <Pencil className="size-4" /> Modifica
            </Button>
          )}
        </div>
      </div>

      <Card className="p-3">
        <LeadAzioniStato
          leadId={leadId}
          stato={lead.stato}
          assegnatoA={lead.assegnato_a}
          profili={profili ?? []}
          operatoreId={user?.id ?? null}
        />
      </Card>

      <Dialog
        open={!!duplicati}
        onOpenChange={(o) => {
          if (!o) setDuplicati(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Possibili clienti esistenti</DialogTitle>
            <DialogDescription>
              Esistono già clienti con la stessa P.IVA o codice fiscale. Verifica prima di
              procedere.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-auto">
            {(duplicati ?? []).map((d) => (
              <div key={d.id} className="rounded-md border p-2 text-sm">
                <p className="font-medium">{d.ragione_sociale || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  P.IVA {d.partita_iva || "—"} · C.F. {d.codice_fiscale || "—"}
                </p>
                <Link
                  to="/clienti/$clienteId"
                  params={{ clienteId: d.id }}
                  className="text-xs underline"
                >
                  Apri scheda cliente
                </Link>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicati(null)}>
              Annulla
            </Button>
            <Button disabled={convertiMut.isPending} onClick={() => convertiMut.mutate(true)}>
              {convertiMut.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
              Converti comunque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="anagrafica">
        <TabsList className="w-full justify-start overflow-x-auto md:w-auto">
          <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="contatti">Contatti</TabsTrigger>
          <TabsTrigger value="cantieri">Cantieri</TabsTrigger>
          <TabsTrigger value="commerciale">Commerciale</TabsTrigger>
          <TabsTrigger value="richieste">Richieste</TabsTrigger>
          <TabsTrigger value="storico">Storico</TabsTrigger>
        </TabsList>

        <TabsContent value="anagrafica" className="mt-4">
          {!editMode ? (
            <div className="grid grid-cols-1 gap-3">
              <LeadSection title="Identità" icon={User} variant="blue">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                  <LeadField
                    label="Tipo soggetto"
                    value={lead.tipo_soggetto === "persona_fisica" ? "Persona fisica" : "Azienda"}
                  />
                  <LeadField label="Ragione sociale" value={lead.ragione_sociale} highlight />
                  <LeadField label="Nome" value={lead.nome} />
                  <LeadField label="Cognome" value={lead.cognome} />
                  <LeadField label="Partita IVA" value={lead.partita_iva} />
                  <LeadField label="Codice fiscale" value={lead.codice_fiscale} />
                </div>
              </LeadSection>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <LeadSection title="Contatti" icon={Phone} variant="violet">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    <LeadField label="Email" value={lead.email} />
                    <LeadField label="Telefono" value={lead.telefono} />
                    <LeadField label="Cellulare" value={lead.cellulare} />
                  </div>
                </LeadSection>

                <LeadSection title="Sede" icon={MapPin} variant="green">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    <LeadField label="Indirizzo" value={lead.indirizzo} />
                    <LeadField label="Città" value={lead.citta} />
                    <LeadField label="CAP" value={lead.cap} />
                    <LeadField label="Provincia" value={lead.provincia} />
                    <LeadField
                      label="Sede"
                      value={(stores ?? []).find((s) => s.id === lead.store_id)?.nome || "Nessuna"}
                    />
                    <LeadField
                      label="Agente"
                      value={
                        (agenti ?? []).find((a) => a.codice === lead.agente_codice)?.descrizione ||
                        lead.agente_codice ||
                        "Nessuno"
                      }
                    />
                  </div>
                </LeadSection>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <LeadSection title="Qualificazione lead" icon={Target} variant="amber">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    <LeadField label="Tipo lead" value={LEAD_TIPO_LABEL[lead.tipo_lead]} />
                    <LeadField label="Priorità" value={LEAD_PRIORITA_LABEL[lead.priorita]} />
                    <LeadField label="Fonte" value={LEAD_FONTE_LABEL[lead.fonte]} />
                    <LeadField label="Dettaglio fonte" value={lead.fonte_dettaglio} />
                  </div>
                  <div className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    <LeadField
                      label="Stato"
                      value={LEAD_STATO_LABEL[lead.stato]}
                      hint="(dalla barra azioni)"
                    />
                    <LeadField
                      label="Assegnato a"
                      value={nomeProfilo(lead.assegnato_a)}
                      hint="(dalla barra azioni)"
                    />
                    {lead.stato === "perso" && (
                      <LeadField
                        label="Motivo perdita"
                        value={lead.motivo_perdita}
                        hint="(dalla barra azioni)"
                      />
                    )}
                  </div>
                </LeadSection>

                <LeadSection title="Prossima azione" icon={Calendar} variant="gray">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    <LeadField
                      label="Prossima azione il"
                      value={
                        lead.prossima_azione_il
                          ? new Date(lead.prossima_azione_il).toLocaleDateString("it-IT")
                          : null
                      }
                    />
                    <LeadField label="Tipo prossima azione" value={lead.prossima_azione_tipo} />
                    <div className="sm:col-span-2">
                      <LeadField label="Nota prossima azione" value={lead.prossima_azione_nota} />
                    </div>
                  </div>
                </LeadSection>
              </div>

              {lead.note && (
                <LeadSection title="Note" icon={StickyNote} variant="muted">
                  <p className="text-sm whitespace-pre-wrap">{lead.note}</p>
                </LeadSection>
              )}
            </div>
          ) : (
            <Card className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Tipo soggetto</Label>
                  <Select
                    value={f.tipo_soggetto || "azienda"}
                    onValueChange={(v) => set("tipo_soggetto", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="azienda">Azienda</SelectItem>
                      <SelectItem value="persona_fisica">Persona fisica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Ragione sociale</Label>
                  <Input
                    value={f.ragione_sociale}
                    maxLength={200}
                    onChange={(e) => set("ragione_sociale", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Nome</Label>
                  <Input
                    value={f.nome}
                    maxLength={100}
                    onChange={(e) => set("nome", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Cognome</Label>
                  <Input
                    value={f.cognome}
                    maxLength={100}
                    onChange={(e) => set("cognome", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Partita IVA</Label>
                  <Input
                    value={f.partita_iva}
                    maxLength={20}
                    onChange={(e) => set("partita_iva", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Codice fiscale</Label>
                  <Input
                    value={f.codice_fiscale}
                    maxLength={20}
                    onChange={(e) => set("codice_fiscale", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={f.email}
                    maxLength={255}
                    onChange={(e) => set("email", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Telefono</Label>
                  <Input
                    value={f.telefono}
                    maxLength={30}
                    onChange={(e) => set("telefono", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Cellulare</Label>
                  <Input
                    value={f.cellulare}
                    maxLength={30}
                    onChange={(e) => set("cellulare", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Indirizzo</Label>
                  <Input
                    value={f.indirizzo}
                    maxLength={200}
                    onChange={(e) => set("indirizzo", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Città</Label>
                  <Input
                    value={f.citta}
                    maxLength={100}
                    onChange={(e) => set("citta", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">CAP</Label>
                    <Input
                      value={f.cap}
                      maxLength={10}
                      onChange={(e) => set("cap", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Prov.</Label>
                    <Input
                      value={f.provincia}
                      maxLength={5}
                      onChange={(e) => set("provincia", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Stato</Label>
                  <p className="text-sm mt-1 rounded-md border bg-muted/40 px-3 py-2">
                    {LEAD_STATO_LABEL[lead.stato]}
                    <span className="text-xs text-muted-foreground ml-2">(dalla barra azioni)</span>
                  </p>
                </div>

                <div>
                  <Label className="text-xs">Tipo lead</Label>
                  <Select
                    value={f.tipo_lead}
                    onValueChange={(v) => set("tipo_lead", v as LeadTipo)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_TIPI.map((s) => (
                        <SelectItem key={s} value={s}>
                          {LEAD_TIPO_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Priorità</Label>
                  <Select
                    value={f.priorita}
                    onValueChange={(v) => set("priorita", v as LeadPriorita)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_PRIORITA.map((s) => (
                        <SelectItem key={s} value={s}>
                          {LEAD_PRIORITA_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Fonte</Label>
                  <Select value={f.fonte} onValueChange={(v) => set("fonte", v as LeadFonte)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_FONTI.map((s) => (
                        <SelectItem key={s} value={s}>
                          {LEAD_FONTE_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Dettaglio fonte</Label>
                  <Input
                    value={f.fonte_dettaglio}
                    maxLength={200}
                    onChange={(e) => set("fonte_dettaglio", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Sede</Label>
                  <Select
                    value={f.store_id || NESSUNO}
                    onValueChange={(v) => set("store_id", v === NESSUNO ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nessuna" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NESSUNO}>Nessuna</SelectItem>
                      {(stores ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Agente</Label>
                  <Select
                    value={f.agente_codice || NESSUNO}
                    onValueChange={(v) => set("agente_codice", v === NESSUNO ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nessuno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NESSUNO}>Nessuno</SelectItem>
                      {(agenti ?? []).map((a) => (
                        <SelectItem key={a.codice} value={a.codice}>
                          {a.descrizione || a.codice}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Assegnato a</Label>
                  <p className="text-sm mt-1 rounded-md border bg-muted/40 px-3 py-2">
                    {nomeProfilo(lead.assegnato_a)}
                    <span className="text-xs text-muted-foreground ml-2">(dalla barra azioni)</span>
                  </p>
                </div>

                <div>
                  <Label className="text-xs">Prossima azione il</Label>
                  <Input
                    type="date"
                    value={f.prossima_azione_il}
                    onChange={(e) => set("prossima_azione_il", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Tipo prossima azione</Label>
                  <Input
                    value={f.prossima_azione_tipo}
                    maxLength={100}
                    onChange={(e) => set("prossima_azione_tipo", e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs">Nota prossima azione</Label>
                  <Textarea
                    rows={2}
                    value={f.prossima_azione_nota}
                    maxLength={1000}
                    onChange={(e) => set("prossima_azione_nota", e.target.value)}
                  />
                </div>
                {lead.stato === "perso" && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Label className="text-xs">Motivo perdita</Label>
                    <p className="text-sm mt-1 rounded-md border bg-muted/40 px-3 py-2">
                      {lead.motivo_perdita || "—"}
                    </p>
                  </div>
                )}

                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs">Note</Label>
                  <Textarea
                    rows={3}
                    value={f.note}
                    maxLength={2000}
                    onChange={(e) => set("note", e.target.value)}
                  />
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="contatti" className="mt-4 space-y-4">
          <LeadContattiTab leadId={leadId} clienteId={lead.cliente_id} />

          {!haContatti && (
            <Alert>
              <Info className="size-4" />
              <AlertDescription>
                Aggiungi un contatto-persona per poter raccogliere la firma privacy e i consensi
                marketing (GDPR). La privacy si firma sulla persona fisica, non sull'azienda.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="cantieri" className="mt-4">
          <LeadCantieriTab leadId={leadId} clienteId={lead.cliente_id} etichetta={nomeLead(lead)} />
        </TabsContent>

        <TabsContent value="commerciale" className="mt-4">
          <OpportunitaSoggettoLista
            soggetto={{
              tipo: "lead",
              id: leadId,
              etichetta: nomeLead(lead),
              clienteIdAssociato: lead.cliente_id ?? null,
            }}
          />
        </TabsContent>

        <TabsContent value="richieste" className="mt-4">
          <LeadRichiesteTab leadId={leadId} />
        </TabsContent>

        <TabsContent value="storico" className="mt-4">
          {(storico ?? []).length === 0 ? (
            <Card className="p-12 text-center">
              <ScrollText className="size-8 mx-auto text-muted-foreground mb-2" />
              <p className="font-medium text-sm">Nessun evento registrato</p>
            </Card>
          ) : (
            <Card className="p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Da</TableHead>
                    <TableHead>A</TableHead>
                    <TableHead>Operatore</TableHead>
                    <TableHead>Nota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(storico ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">
                        {new Date(s.created_at).toLocaleString("it-IT")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {(s.stato_da &&
                          LEAD_STATO_LABEL[s.stato_da as keyof typeof LEAD_STATO_LABEL]) ||
                          "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {(s.stato_a &&
                          LEAD_STATO_LABEL[s.stato_a as keyof typeof LEAD_STATO_LABEL]) ||
                          "—"}
                      </TableCell>
                      <TableCell className="text-xs">{nomeProfilo(s.operatore_id)}</TableCell>
                      <TableCell className="text-xs">{s.nota ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LeadField({
  label,
  value,
  highlight,
  hint,
}: {
  label: string;
  value?: string | null;
  highlight?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
        {hint && <span className="ml-1.5 normal-case font-normal">{hint}</span>}
      </p>
      <p className={`mt-0.5 text-sm ${highlight ? "font-semibold" : ""}`}>
        {value || <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}

function LeadSection({
  title,
  icon: Icon,
  variant,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  variant: "blue" | "green" | "violet" | "gray" | "amber" | "muted";
  children: ReactNode;
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
      className={`p-4 rounded-l-none rounded-r-xl border-[0.5px] border-l-[3px] ${v.border} h-full`}
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
