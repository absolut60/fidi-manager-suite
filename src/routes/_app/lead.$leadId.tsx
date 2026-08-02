import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2, Loader2, ScrollText, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { LeadContattiTab, LeadCantieriTab } from "@/components/lead/lead-relazioni-tabs";
import { LeadAzioniStato } from "@/components/lead/lead-azioni-stato";
import { LinkFirmaPrivacy } from "@/components/link-firma-privacy";

import {
  LEAD_STATO_LABEL, LEAD_STATO_CLASS, LEAD_TIPI, LEAD_TIPO_LABEL,
  LEAD_FONTI, LEAD_FONTE_LABEL, LEAD_PRIORITA, LEAD_PRIORITA_LABEL, LEAD_PRIORITA_CLASS,
  LEAD_RICHIESTA_STATO_LABEL, LEAD_RICHIESTA_TIPO_LABEL,
  nomeLead, formatData, puoAccedereLead,
  type LeadTipo, type LeadFonte, type LeadPriorita,
  type LeadRichiestaStato, type LeadRichiestaTipo,
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
      const { data, error } = await supabase.from("lead").select("*").eq("id", leadId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["stores", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, nome").eq("attivo", true).order("nome");
      return data ?? [];
    },
  });
  const { data: agenti } = useQuery({
    queryKey: ["agenti-list"],
    queryFn: async () => {
      const { data } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
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
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => (p ? { ...p, [k]: v } : p));

  useEffect(() => {
    if (!lead) return;
    setF({
      tipo_soggetto: lead.tipo_soggetto ?? "azienda",
      ragione_sociale: lead.ragione_sociale ?? "",
      nome: lead.nome ?? "",
      cognome: lead.cognome ?? "",
      partita_iva: lead.partita_iva ?? "",
      codice_fiscale: lead.codice_fiscale ?? "",
      email: lead.email ?? "",
      telefono: lead.telefono ?? "",
      cellulare: lead.cellulare ?? "",
      indirizzo: lead.indirizzo ?? "",
      citta: lead.citta ?? "",
      cap: lead.cap ?? "",
      provincia: lead.provincia ?? "",
      fonte: lead.fonte,
      fonte_dettaglio: lead.fonte_dettaglio ?? "",
      tipo_lead: lead.tipo_lead,
      priorita: lead.priorita,
      store_id: lead.store_id ?? "",
      agente_codice: lead.agente_codice ?? "",
      prossima_azione_il: lead.prossima_azione_il ?? "",
      prossima_azione_tipo: lead.prossima_azione_tipo ?? "",
      prossima_azione_nota: lead.prossima_azione_nota ?? "",
      note: lead.note ?? "",
    });
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
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-storico", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-lista"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lead").delete().eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead eliminato");
      qc.invalidateQueries({ queryKey: ["lead-lista"] });
      navigate({ to: "/lead" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: richieste } = useQuery({
    queryKey: ["lead-richieste", leadId],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_richieste")
        .select("id, tipo, oggetto, descrizione, stato, importo_stimato, esito, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string; tipo: LeadRichiestaTipo; oggetto: string | null; descrizione: string | null;
        stato: LeadRichiestaStato; importo_stimato: number | null; esito: string | null; created_at: string;
      }[];
    },
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

  if (authLoading) return <Skeleton className="h-40 w-full" />;

  if (!canSee) {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Accesso riservato</p>
        <p className="text-sm text-muted-foreground mt-1">
          Questa sezione è riservata ai ruoli Marketing, Amministrazione, Direzione e Amministratore.
        </p>
      </Card>
    );
  }

  if (isLoading || !f) return <Skeleton className="h-64 w-full" />;

  if (!lead) {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Lead non trovato</p>
        <Link to="/lead" className="text-sm underline mt-2 inline-block">Torna all'elenco</Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <Link to="/lead" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="size-4" /> Lead
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 truncate">{nomeLead(lead)}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge className={LEAD_STATO_CLASS[lead.stato]}>{LEAD_STATO_LABEL[lead.stato]}</Badge>
            <Badge className={LEAD_PRIORITA_CLASS[lead.priorita]}>{LEAD_PRIORITA_LABEL[lead.priorita]}</Badge>
            <span className="text-xs text-muted-foreground">
              {LEAD_TIPO_LABEL[lead.tipo_lead]} · fonte {LEAD_FONTE_LABEL[lead.fonte]} · creato {formatData(lead.created_at)}
            </span>
            {lead.cliente_id && (
              <Link to="/clienti/$clienteId" params={{ clienteId: lead.cliente_id }} className="text-xs underline">
                Cliente collegato
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-1.5 text-destructive"
            onClick={() => { if (confirm("Eliminare definitivamente questo lead?")) delMut.mutate(); }}
          >
            <Trash2 className="size-4" /> Elimina
          </Button>
          <Button className="gap-1.5" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salva
          </Button>
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


      <Tabs defaultValue="anagrafica">
        <TabsList>
          <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="contatti">Contatti</TabsTrigger>
          <TabsTrigger value="cantieri">Cantieri</TabsTrigger>
          <TabsTrigger value="richieste">Richieste</TabsTrigger>
          <TabsTrigger value="storico">Storico</TabsTrigger>
        </TabsList>

        <TabsContent value="anagrafica" className="mt-4">
          <Card className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Tipo soggetto</Label>
                <Select value={f.tipo_soggetto || "azienda"} onValueChange={(v) => set("tipo_soggetto", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="azienda">Azienda</SelectItem>
                    <SelectItem value="persona_fisica">Persona fisica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Ragione sociale</Label>
                <Input value={f.ragione_sociale} maxLength={200} onChange={(e) => set("ragione_sociale", e.target.value)} />
              </div>
              <div><Label className="text-xs">Nome</Label><Input value={f.nome} maxLength={100} onChange={(e) => set("nome", e.target.value)} /></div>
              <div><Label className="text-xs">Cognome</Label><Input value={f.cognome} maxLength={100} onChange={(e) => set("cognome", e.target.value)} /></div>
              <div><Label className="text-xs">Partita IVA</Label><Input value={f.partita_iva} maxLength={20} onChange={(e) => set("partita_iva", e.target.value)} /></div>
              <div><Label className="text-xs">Codice fiscale</Label><Input value={f.codice_fiscale} maxLength={20} onChange={(e) => set("codice_fiscale", e.target.value)} /></div>
              <div><Label className="text-xs">Email</Label><Input type="email" value={f.email} maxLength={255} onChange={(e) => set("email", e.target.value)} /></div>
              <div><Label className="text-xs">Telefono</Label><Input value={f.telefono} maxLength={30} onChange={(e) => set("telefono", e.target.value)} /></div>
              <div><Label className="text-xs">Cellulare</Label><Input value={f.cellulare} maxLength={30} onChange={(e) => set("cellulare", e.target.value)} /></div>
              <div><Label className="text-xs">Indirizzo</Label><Input value={f.indirizzo} maxLength={200} onChange={(e) => set("indirizzo", e.target.value)} /></div>
              <div><Label className="text-xs">Città</Label><Input value={f.citta} maxLength={100} onChange={(e) => set("citta", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">CAP</Label><Input value={f.cap} maxLength={10} onChange={(e) => set("cap", e.target.value)} /></div>
                <div><Label className="text-xs">Prov.</Label><Input value={f.provincia} maxLength={5} onChange={(e) => set("provincia", e.target.value)} /></div>
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
                <Select value={f.tipo_lead} onValueChange={(v) => set("tipo_lead", v as LeadTipo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_TIPI.map((s) => <SelectItem key={s} value={s}>{LEAD_TIPO_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Priorità</Label>
                <Select value={f.priorita} onValueChange={(v) => set("priorita", v as LeadPriorita)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_PRIORITA.map((s) => <SelectItem key={s} value={s}>{LEAD_PRIORITA_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Fonte</Label>
                <Select value={f.fonte} onValueChange={(v) => set("fonte", v as LeadFonte)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_FONTI.map((s) => <SelectItem key={s} value={s}>{LEAD_FONTE_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Dettaglio fonte</Label>
                <Input value={f.fonte_dettaglio} maxLength={200} onChange={(e) => set("fonte_dettaglio", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Sede</Label>
                <Select value={f.store_id || NESSUNO} onValueChange={(v) => set("store_id", v === NESSUNO ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NESSUNO}>Nessuna</SelectItem>
                    {(stores ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Agente</Label>
                <Select value={f.agente_codice || NESSUNO} onValueChange={(v) => set("agente_codice", v === NESSUNO ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NESSUNO}>Nessuno</SelectItem>
                    {(agenti ?? []).map((a) => (
                      <SelectItem key={a.codice} value={a.codice}>{a.descrizione || a.codice}</SelectItem>
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
                <Input type="date" value={f.prossima_azione_il} onChange={(e) => set("prossima_azione_il", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Tipo prossima azione</Label>
                <Input value={f.prossima_azione_tipo} maxLength={100} onChange={(e) => set("prossima_azione_tipo", e.target.value)} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Label className="text-xs">Nota prossima azione</Label>
                <Textarea rows={2} value={f.prossima_azione_nota} maxLength={1000} onChange={(e) => set("prossima_azione_nota", e.target.value)} />
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
                <Textarea rows={3} value={f.note} maxLength={2000} onChange={(e) => set("note", e.target.value)} />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="contatti" className="mt-4 space-y-4">
          <LeadContattiTab leadId={leadId} clienteId={lead.cliente_id} />
          <LinkFirmaPrivacy leadId={leadId} />
        </TabsContent>


        <TabsContent value="cantieri" className="mt-4">
          <LeadCantieriTab leadId={leadId} clienteId={lead.cliente_id} />
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
                      <TableCell className="text-xs">{new Date(s.created_at).toLocaleString("it-IT")}</TableCell>
                      <TableCell className="text-xs">{s.stato_da ?? "—"}</TableCell>
                      <TableCell className="text-xs">{s.stato_a ?? "—"}</TableCell>
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
