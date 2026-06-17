import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Check, X, ExternalLink, MessageSquare, Filter as FilterIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { formatEuro, formatDate, TIPO_LABEL, TIPO_TONE, type TipoRichiesta } from "@/lib/fidi";

export const Route = createFileRoute("/_app/approvazioni")({
  component: ApprovazioniPage,
});

function giorniDa(d: string | null | undefined): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function semaforoCliente(c: any): { dot: string; tone: string; label: "Verde" | "Giallo" | "Rosso" | "—" } {
  if (!c) return { dot: "bg-muted-foreground", tone: "bg-muted text-muted-foreground", label: "—" };
  if (c.bloccato || c.in_gestione_legale) return { dot: "bg-destructive", tone: "bg-destructive/15 text-destructive", label: "Rosso" };
  if (Number(c.scaduto ?? 0) > 0) return { dot: "bg-warning", tone: "bg-warning/15 text-warning", label: "Giallo" };
  return { dot: "bg-success", tone: "bg-success/15 text-success", label: "Verde" };
}

const CLIENTE_COLS =
  "ragione_sociale, partita_iva, fido_gestionale, totale_rischio, fido_residuo, scaduto, a_scadere, num_insoluti, doc_da_fatturare, doc_da_evadere, effetti_a_rischio, condizioni_pagamento, condizione_pagamento_desc, dilazione_concordata, dilazione_effettiva, bloccato, in_gestione_legale, cliente_attivo, ultima_data_fatturazione, ultima_sincronizzazione";

function ritardoHelper(dilConc: number | null | undefined, dilEff: number | null | undefined): { text: string; cls: string } {
  if (dilConc == null || dilEff == null) return { text: "—", cls: "text-muted-foreground" };
  const diff = Number(dilEff) - Number(dilConc);
  if (diff > 0) return { text: `+${diff} gg`, cls: "text-destructive font-medium" };
  return { text: "In orario", cls: "text-success font-medium" };
}

function ApprovazioniPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  // Visibilita': approvatori liv1/2/3, direzione, amministrazione e admin
  // vedono tutte le richieste in approvazione (RLS). Lo store manager vede
  // solo le proprie. Qui non filtriamo per livello in lettura: separiamo il
  // "vedo" dal "posso approvare" (vedi canApproveRow).
  const isAdmin = roles.includes("amministratore");
  // Livello massimo dell'utente (multi-ruolo): 3 batte 2 batte 1.
  const livello =
    roles.includes("approvatore_liv3") ? 3 :
    roles.includes("approvatore_liv2") ? 2 :
    roles.includes("approvatore_liv1") ? 1 : 0;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<"approva" | "rifiuta" | null>(null);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkMotivo, setBulkMotivo] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [singleAction, setSingleAction] = useState<"approva" | "rifiuta" | "integrazioni" | null>(null);
  const [singleNote, setSingleNote] = useState("");

  // Filtri
  const [fStore, setFStore] = useState("all");
  const [fTipo, setFTipo] = useState("all");
  const [fLivello, setFLivello] = useState("all");
  const [fMin, setFMin] = useState("");
  const [fMax, setFMax] = useState("");
  const [fSem, setFSem] = useState("all");
  const [fAttesa, setFAttesa] = useState("all");
  const [sort, setSort] = useState<"importo_desc" | "data_asc" | "attesa_desc">("importo_desc");

  const { data: stores } = useQuery({
    queryKey: ["stores-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id,nome,codice").eq("attivo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["approvazioni-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_fido")
        .select(`*, clienti(${CLIENTE_COLS}), stores(nome, codice), profilo:profili!richieste_fido_created_by_fkey(nome, cognome, email)`)
        .eq("stato", "in_approvazione")
        .order("data_invio", { ascending: true });
      if (error) {
        const { data: d2, error: e2 } = await supabase
          .from("richieste_fido")
          .select(`*, clienti(${CLIENTE_COLS}), stores(nome, codice)`)
          .eq("stato", "in_approvazione")
          .order("data_invio", { ascending: true });
        if (e2) throw e2;
        return d2;
      }
      return data;
    },
    enabled: true,
  });

  // Posso approvare/rifiutare questa richiesta?
  // mio_livello >= livello_richiesto (cascata) oppure admin.
  function canApproveRow(r: any): boolean {
    if (isAdmin) return true;
    return livello >= Number(r.livello_richiesto ?? 0);
  }

  const { data: msgNonLetti } = useQuery({
    queryKey: ["comunicazioni-non-lette", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("comunicazioni_richiesta")
        .select("richiesta_id")
        .eq("letto", false)
        .neq("autore_id", user?.id ?? "");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m: any) => {
        counts[m.richiesta_id] = (counts[m.richiesta_id] ?? 0) + 1;
      });
      return counts;
    },
    refetchInterval: 30000,
  });


  const richieste = useMemo(() => {
    const list = (data ?? []) as any[];
    const min = fMin ? Number(fMin) : null;
    const max = fMax ? Number(fMax) : null;
    let out = list.filter((r) => {
      if (fStore !== "all" && r.store_id !== fStore) return false;
      if (fTipo !== "all" && r.tipo !== fTipo) return false;
      if (fLivello !== "all" && String(r.livello_corrente) !== fLivello) return false;
      const imp = Number(r.importo_richiesto);
      if (min != null && imp < min) return false;
      if (max != null && imp > max) return false;
      if (fSem !== "all" && semaforoCliente(r.clienti).label.toLowerCase() !== fSem) return false;
      if (fAttesa !== "all") {
        const g = giorniDa(r.data_invio);
        if (fAttesa === "lt7" && g >= 7) return false;
        if (fAttesa === "7_14" && (g < 7 || g > 14)) return false;
        if (fAttesa === "gt14" && g <= 14) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      if (sort === "importo_desc") return Number(b.importo_richiesto) - Number(a.importo_richiesto);
      if (sort === "data_asc") return new Date(a.data_invio ?? 0).getTime() - new Date(b.data_invio ?? 0).getTime();
      return giorniDa(b.data_invio) - giorniDa(a.data_invio);
    });
    return out;
  }, [data, fStore, fTipo, fLivello, fMin, fMax, fSem, fAttesa, sort]);

  const allSelected = richieste.length > 0 && richieste.every((r) => selected.has(r.id));

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(richieste.map((r) => r.id)));
  }
  function clearFilters() {
    setFStore("all"); setFTipo("all"); setFLivello("all");
    setFMin(""); setFMax(""); setFSem("all"); setFAttesa("all");
  }
  const numFiltriAttivi =
    (fStore !== "all" ? 1 : 0) + (fTipo !== "all" ? 1 : 0) + (fLivello !== "all" ? 1 : 0) +
    (fMin ? 1 : 0) + (fMax ? 1 : 0) + (fSem !== "all" ? 1 : 0) + (fAttesa !== "all" ? 1 : 0);

  const selectedRichieste = useMemo(
    () => richieste.filter((r) => selected.has(r.id)),
    [richieste, selected]
  );
  const totaleSelezionato = selectedRichieste.reduce((s, r) => s + Number(r.importo_richiesto), 0);

  async function processaRichiesta(r: any, esito: "approvata" | "rifiutata", note: string | null) {
    if (!user) throw new Error("Utente non autenticato");
    if (!canApproveRow(r)) {
      throw new Error(`Richiede livello ${r.livello_richiesto}: il tuo livello non e' sufficiente.`);
    }
    // Singolo assenso via funzione server (SECURITY DEFINER) che valida il livello.
    const { error } = await (supabase as any).rpc("processa_richiesta_fido", {
      _richiesta_id: r.id,
      _esito: esito,
      _note: note || null,
      _importo_approvato: esito === "approvata" ? Number(r.importo_richiesto) : null,
    });
    if (error) throw error;
  }


  const bulk = useMutation({
    mutationFn: async (esito: "approvata" | "rifiutata") => {
      const note = esito === "approvata" ? bulkNote : bulkMotivo;
      for (const r of selectedRichieste) await processaRichiesta(r, esito, note);
    },
    onSuccess: (_d, esito) => {
      toast.success(`${selectedRichieste.length} richieste ${esito === "approvata" ? "approvate" : "rifiutate"}`);
      setSelected(new Set()); setAction(null); setBulkNote(""); setBulkMotivo("");
      qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
      qc.invalidateQueries({ queryKey: ["richieste"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const single = useMutation({
    mutationFn: async (esito: "approvata" | "rifiutata") => {
      if (!detail) throw new Error("Nessuna richiesta");
      await processaRichiesta(detail, esito, singleNote);
    },
    onSuccess: (_d, esito) => {
      toast.success(`Richiesta ${esito === "approvata" ? "approvata" : "rifiutata"}`);
      setDetail(null); setSingleAction(null); setSingleNote("");
      qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
      qc.invalidateQueries({ queryKey: ["richieste"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const integrazioni = useMutation({
    mutationFn: async () => {
      if (!detail || !user) throw new Error("Errore");
      if (!singleNote.trim()) throw new Error("Specifica le integrazioni richieste");
      const { error } = await supabase.from("richieste_fido")
        .update({ stato: "integrazioni_richieste", note: singleNote })
        .eq("id", detail.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Integrazioni richieste");
      setDetail(null); setSingleAction(null); setSingleNote("");
      qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
      qc.invalidateQueries({ queryKey: ["richieste"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Approvazioni</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tutte le richieste in approvazione · puoi approvare solo quelle che richiedono livello {isAdmin ? "1-3" : livello > 0 ? `≤ ${livello}` : "—"}
        </p>
      </div>

      {/* FILTRI */}
      <Card className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium">
          <FilterIcon className="size-4" /> Filtri
          {numFiltriAttivi > 0 && (
            <>
              <Badge variant="secondary">{numFiltriAttivi} attivi</Badge>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto h-7 text-xs">Reset</Button>
            </>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Store</Label>
            <Select value={fStore} onValueChange={setFStore}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {(stores ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo richiesta</Label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="nuovo">Nuovo fido</SelectItem>
                <SelectItem value="aumento">Aumento</SelectItem>
                <SelectItem value="diminuzione">Diminuzione</SelectItem>
                <SelectItem value="rinnovo">Rinnovo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Livello</Label>
            <Select value={fLivello} onValueChange={setFLivello}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="1">Liv. 1</SelectItem>
                <SelectItem value="2">Liv. 2</SelectItem>
                <SelectItem value="3">Liv. 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Semaforo rischio</Label>
            <Select value={fSem} onValueChange={setFSem}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="verde">Verde</SelectItem>
                <SelectItem value="giallo">Giallo</SelectItem>
                <SelectItem value="rosso">Rosso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Importo min</Label>
            <Input type="number" inputMode="numeric" placeholder="0" value={fMin} onChange={(e) => setFMin(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Importo max</Label>
            <Input type="number" inputMode="numeric" placeholder="—" value={fMax} onChange={(e) => setFMax(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Giorni in attesa</Label>
            <Select value={fAttesa} onValueChange={setFAttesa}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="lt7">Meno di 7gg</SelectItem>
                <SelectItem value="7_14">7-14 gg</SelectItem>
                <SelectItem value="gt14">Oltre 14gg</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ordinamento</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="importo_desc">Importo (decrescente)</SelectItem>
                <SelectItem value="data_asc">Data invio (più vecchie)</SelectItem>
                <SelectItem value="attesa_desc">Giorni in attesa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* TOOLBAR SELEZIONE */}
      {selected.size > 0 && (
        <Card className="p-3 sm:p-4 bg-info/5 border-info/30 sticky top-2 z-10">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              <p className="text-sm font-medium">
                {selected.size} selezionate · totale {formatEuro(totaleSelezionato)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Annulla</Button>
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30"
                onClick={() => setAction("rifiuta")}>
                <X className="size-4" /> Rifiuta selezionate
              </Button>
              <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90"
                onClick={() => setAction("approva")}>
                <Check className="size-4" /> Approva selezionate
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* LISTA */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : richieste.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="size-12 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-3">
            <CheckCheck className="size-5 text-success" />
          </div>
          <p className="font-medium">Nessuna richiesta in attesa</p>
          <p className="text-xs text-muted-foreground mt-1">
            {numFiltriAttivi > 0 ? "Prova a modificare i filtri" : "Tutte le richieste sono state processate"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-4 text-xs text-muted-foreground">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            <span>Seleziona tutto · {richieste.length} richieste</span>
          </div>
          {richieste.map((r) => {
            const isSel = selected.has(r.id);
            const c = r.clienti ?? {};
            const sem = semaforoCliente(c);
            const g = giorniDa(r.data_invio);
            const residuo = Number(c.fido_residuo ?? 0);
            const scaduto = Number(c.scaduto ?? 0);
            const unread = msgNonLetti?.[r.id] ?? 0;
            return (
              <Card key={r.id} className={`p-4 transition-shadow ${isSel ? "border-primary bg-primary/5" : "hover:shadow-md hover:border-primary/30"}`}>
                <div className="flex items-start gap-3">
                  <Checkbox checked={isSel} onCheckedChange={() => toggle(r.id)} className="mt-1" />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block size-2.5 rounded-full ${sem.dot}`} title={`Semaforo: ${sem.label}`} />
                          <Link
                            to="/clienti/$clienteId"
                            params={{ clienteId: r.cliente_id }}
                            search={{ from: "approvazioni" }}
                            target="_blank"
                            rel="noopener"
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold hover:underline truncate flex items-center gap-1"
                          >
                            {c.ragione_sociale ?? "—"}
                            <ExternalLink className="size-3 opacity-60" />
                          </Link>
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>
                            {TIPO_LABEL[r.tipo as TipoRichiesta]}
                          </span>
                          <Badge variant="outline">Liv. {r.livello_corrente}/{r.livello_richiesto}</Badge>
                          {(r as any).stores?.nome && (
                            <Badge variant="secondary" className="text-xs">{(r as any).stores.nome}</Badge>
                          )}
                          {unread > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium">
                              <MessageSquare className="size-3" />
                              {unread} non letti
                            </span>
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                          <Riga label="Fido gestionale" v={formatEuro(Number(c.fido_gestionale ?? 0))} />
                          <Riga label="Totale rischio" v={formatEuro(Number(c.totale_rischio ?? 0))} />
                          <Riga label="Fido residuo" v={formatEuro(residuo)} danger={residuo < 0} />
                          <Riga label="Scaduto" v={formatEuro(scaduto)} danger={scaduto > 0} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Inviata il {formatDate(r.data_invio)} · <span className={g > 14 ? "text-destructive font-medium" : g >= 7 ? "text-warning font-medium" : ""}>{g} gg in attesa</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">Importo richiesto</p>
                        <p className="font-bold text-lg tabular-nums">{formatEuro(Number(r.importo_richiesto))}</p>
                        <p className="text-xs text-muted-foreground">{r.durata_mesi} mesi</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* DETTAGLIO SHEET */}
      <Sheet open={detail !== null} onOpenChange={(o) => { if (!o) { setDetail(null); setSingleAction(null); setSingleNote(""); } }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {detail && (() => {
            const c = detail.clienti ?? {};
            const sem = semaforoCliente(c);
            const residuo = Number(c.fido_residuo ?? 0);
            const scaduto = Number(c.scaduto ?? 0);
            const creatore = (detail as any).profilo;
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <span className={`inline-block size-3 rounded-full ${sem.dot}`} />
                    {c.ragione_sociale ?? "—"}
                  </SheetTitle>
                  <SheetDescription>
                    <Link
                      to="/clienti/$clienteId"
                      params={{ clienteId: detail.cliente_id }}
                      search={{ from: "approvazioni" }}
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Apri scheda cliente completa <ExternalLink className="size-3" />
                    </Link>
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-5">
                  <section>
                    <h3 className="text-sm font-semibold mb-2">Dati richiesta</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <Field label="Tipo">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[detail.tipo as TipoRichiesta]}`}>
                          {TIPO_LABEL[detail.tipo as TipoRichiesta]}
                        </span>
                      </Field>
                      <Field label="Importo richiesto"><strong className="tabular-nums">{formatEuro(Number(detail.importo_richiesto))}</strong></Field>
                      <Field label="Durata">{detail.durata_mesi} mesi</Field>
                      <Field label="Livello">{detail.livello_corrente}/{detail.livello_richiesto}</Field>
                      <Field label="Store">{(detail as any).stores?.nome ?? "—"}</Field>
                      <Field label="Data creazione">{formatDate(detail.created_at)}</Field>
                      <Field label="Data invio">{formatDate(detail.data_invio)}</Field>
                      <Field label="Creata da">
                        {creatore ? `${creatore.nome ?? ""} ${creatore.cognome ?? ""}`.trim() || creatore.email : "—"}
                      </Field>
                    </div>
                    {detail.motivazione && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground">Motivazione</p>
                        <p className="text-sm whitespace-pre-wrap">{detail.motivazione}</p>
                      </div>
                    )}
                    {detail.note && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground">Note</p>
                        <p className="text-sm whitespace-pre-wrap">{detail.note}</p>
                      </div>
                    )}
                  </section>

                  <section className="border-t pt-4">
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      Dati rischio cliente
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${sem.tone}`}>{sem.label}</span>
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <Field label="Fido gestionale">{formatEuro(Number(c.fido_gestionale ?? 0))}</Field>
                      <Field label="Totale rischio">{formatEuro(Number(c.totale_rischio ?? 0))}</Field>
                      <Field label="Fido residuo"><span className={residuo < 0 ? "text-destructive font-medium" : ""}>{formatEuro(residuo)}</span></Field>
                      <Field label="Scaduto"><span className={scaduto > 0 ? "text-destructive font-medium" : ""}>{formatEuro(scaduto)}</span></Field>
                      <Field label="A scadere">{formatEuro(Number(c.a_scadere ?? 0))}</Field>
                      <Field label="DDT da fatturare">
                        <span className={Number(c.doc_da_fatturare ?? 0) > 0 ? "text-primary font-medium" : ""}>
                          {formatEuro(Number(c.doc_da_fatturare ?? 0))}
                        </span>
                      </Field>
                      <Field label="Effetti a rischio (RB)">
                        <span className={Number(c.effetti_a_rischio ?? 0) > 0 ? "text-warning font-medium" : ""}>
                          {formatEuro(Number(c.effetti_a_rischio ?? 0))}
                        </span>
                      </Field>
                      <Field label="Ordini da evadere">
                        <span>{formatEuro(Number(c.doc_da_evadere ?? 0))}</span>
                        <span className="text-xs text-muted-foreground ml-1">(non concorre al fido)</span>
                      </Field>
                      <Field label="Insoluti">
                        <span className={Number(c.num_insoluti ?? 0) > 0 ? "text-destructive font-medium" : ""}>
                          {c.num_insoluti ?? 0}
                        </span>
                      </Field>
                      <Field label="Condizione pagamento">{c.condizione_pagamento_desc ?? c.condizioni_pagamento ?? "—"}</Field>
                      <Field label="Dilazione concordata">{c.dilazione_concordata ?? "—"} gg</Field>
                      <Field label="Dilazione effettiva">{c.dilazione_effettiva ?? "—"} gg</Field>
                      {(() => {
                        const r = ritardoHelper(c.dilazione_concordata, c.dilazione_effettiva);
                        return (
                          <Field label="Ritardo medio reale">
                            <span className={r.cls} title="Differenza tra dilazione effettiva e concordata">{r.text}</span>
                          </Field>
                        );
                      })()}
                      <Field label="Stato">
                        {c.bloccato ? <Badge className="bg-destructive/15 text-destructive">Bloccato</Badge>
                          : c.in_gestione_legale ? <Badge className="bg-destructive/15 text-destructive">Legale</Badge>
                          : c.cliente_attivo ? <Badge className="bg-success/15 text-success">Attivo</Badge>
                          : <Badge variant="secondary">Non attivo</Badge>}
                      </Field>
                    </div>
                    {c.ultima_sincronizzazione && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Ultima sincronizzazione: {new Date(c.ultima_sincronizzazione).toLocaleString("it-IT")}
                      </p>
                    )}
                  </section>

                  <section className="border-t pt-4 space-y-3">
                    <h3 className="text-sm font-semibold">Azioni</h3>
                    {singleAction && (
                      <Textarea
                        placeholder={
                          singleAction === "integrazioni" ? "Specifica quali integrazioni richiedere (obbligatorio)"
                            : singleAction === "rifiuta" ? "Motivo del rifiuto (consigliato)"
                            : "Note (opzionali)"
                        }
                        value={singleNote}
                        onChange={(e) => setSingleNote(e.target.value)}
                        rows={3}
                      />
                    )}
                    <div className="flex flex-wrap gap-2">
                      {singleAction === null ? (
                        <>
                          <Button
                            className="bg-success text-success-foreground hover:bg-success/90"
                            onClick={() => setSingleAction("approva")}
                          ><Check className="size-4" /> Approva</Button>
                          <Button
                            variant="outline" className="text-destructive border-destructive/30"
                            onClick={() => setSingleAction("rifiuta")}
                          ><X className="size-4" /> Rifiuta</Button>
                          <Button
                            variant="outline"
                            onClick={() => setSingleAction("integrazioni")}
                          ><MessageSquare className="size-4" /> Richiedi integrazioni</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" onClick={() => { setSingleAction(null); setSingleNote(""); }}>Annulla</Button>
                          {singleAction === "approva" && (
                            <Button
                              className="bg-success text-success-foreground hover:bg-success/90"
                              onClick={() => single.mutate("approvata")}
                              disabled={single.isPending}
                            >Conferma approvazione</Button>
                          )}
                          {singleAction === "rifiuta" && (
                            <Button
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => single.mutate("rifiutata")}
                              disabled={single.isPending}
                            >Conferma rifiuto</Button>
                          )}
                          {singleAction === "integrazioni" && (
                            <Button
                              onClick={() => integrazioni.mutate()}
                              disabled={integrazioni.isPending || !singleNote.trim()}
                            >Invia richiesta integrazioni</Button>
                          )}
                        </>
                      )}
                    </div>
                  </section>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* DIALOG MASSIVO */}
      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "approva" ? "Approvazione massiva" : "Rifiuto massivo"}
            </DialogTitle>
            <DialogDescription>
              Stai per {action === "approva" ? "approvare" : "rifiutare"} <strong>{selectedRichieste.length}</strong> richieste
              {action === "approva" && <> per un totale di <strong>{formatEuro(totaleSelezionato)}</strong></>}.
              L'operazione è irreversibile.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs space-y-1">
            {selectedRichieste.map((r) => (
              <div key={r.id} className="flex justify-between gap-2">
                <span className="truncate">{(r as any).clienti?.ragione_sociale}</span>
                <span className="tabular-nums shrink-0">{formatEuro(Number(r.importo_richiesto))}</span>
              </div>
            ))}
          </div>
          {action === "approva" ? (
            <div>
              <Label className="text-xs">Note (opzionali, applicate a tutte)</Label>
              <Textarea value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} rows={2} />
            </div>
          ) : (
            <div>
              <Label className="text-xs">Motivo del rifiuto <span className="text-destructive">*</span></Label>
              <Textarea
                value={bulkMotivo}
                onChange={(e) => setBulkMotivo(e.target.value)}
                rows={3}
                placeholder="Specifica il motivo (obbligatorio)"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={bulk.isPending}>Annulla</Button>
            <Button
              onClick={() => bulk.mutate(action === "approva" ? "approvata" : "rifiutata")}
              disabled={bulk.isPending || (action === "rifiuta" && !bulkMotivo.trim())}
              className={action === "approva" ? "bg-success text-success-foreground hover:bg-success/90" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {bulk.isPending ? "Elaborazione..." : action === "approva" ? "Conferma approvazione" : "Conferma rifiuto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Riga({ label, v, danger }: { label: string; v: string; danger?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={`tabular-nums truncate font-medium ${danger ? "text-destructive" : ""}`}>{v}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
