import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { BackButton } from "@/components/back-button";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ElencoRiconciliati, PulsanteControllaOra, SchedaDaRiconciliare,
} from "@/components/lead/riconciliazione-viste";
import {
  LEAD_RICONCILIAZIONE_ESITO_LABEL, puoAccedereLead, puoGestireLead,
} from "@/lib/lead-costanti";
import {
  CHIAVE_RICONCILIAZIONE, ESITI_RICONCILIATI, esitoControlloOra, validaVistaRiconciliazione,
  type CandidatoRiconciliazione, type RigaRiconciliazione, type VistaRiconciliazione,
} from "@/lib/lead-riconciliazione";
import { testoPerFiltroOr } from "@/lib/ricerca-sicura";

const TITOLO = "Riconciliazione lead → clienti — FidiManager";
const DESCRIZIONE = "Lead collegati ai clienti arrivati da Gamma e lead da riconciliare a mano.";

export const Route = createFileRoute("/_app/lead/riconciliazione")({
  validateSearch: (s: Record<string, unknown>): { vista: VistaRiconciliazione } => ({ vista: validaVistaRiconciliazione(s["vista"]) }),
  head: () => ({
    meta: [
      { title: TITOLO }, { name: "description", content: DESCRIZIONE },
      { property: "og:title", content: TITOLO }, { property: "og:description", content: DESCRIZIONE },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RiconciliazionePage,
});

const PAGINA = 25;
const COLONNE = "id, lead_id, esito, cliente_id, chiave, candidati, nome_lead, lead_partita_iva, lead_codice_fiscale, cliente_ragione_sociale, cliente_codice, importazione_id, operatore_id, creato_il, risolto_da, risolto_il, nota";

/** Link alla scheda cliente solo se la RLS la rende leggibile; altrimenti il solo nome. */
function LinkClienteVisibile({ clienteId, children }: { clienteId: string; children: ReactNode }) {
  const { data: visibile } = useQuery({
    queryKey: ["cliente-visibile-lead", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clienti").select("id").eq("id", clienteId).maybeSingle();
      return !error && !!data;
    },
    staleTime: 30_000,
  });
  return visibile
    ? <Link to="/clienti/$clienteId" params={{ clienteId }} className="text-primary hover:underline">{children}</Link>
    : <span>{children}</span>;
}

type Conferma = { titolo: string; testo: string; azione: () => void };

function RiconciliazionePage() {
  const { vista } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { roles, user, loading } = useAuth();
  const ruoli = (roles ?? []) as string[];
  const canSee = puoAccedereLead(ruoli);
  const canManage = puoGestireLead(ruoli);
  const isAdmin = ruoli.includes("amministratore");
  const [conferma, setConferma] = useState<Conferma | null>(null);
  const [erroriControllo, setErroriControllo] = useState<string[]>([]);

  const arrayStringhe = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  const { filtri: F, setCampo } = useFiltriPagina("lead-riconciliazione", {
    searchInput: "", search: "", esiti: [] as string[], page: 1,
  }, { userId: user?.id, valida: { esiti: arrayStringhe } });
  const { searchInput, search, esiti, page } = F;
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) { setCampo("search", searchInput); setCampo("page", 1); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, setCampo]);

  const { data: profili } = useQuery({
    queryKey: ["utenti-assegnabili"],
    enabled: canSee,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_utenti_assegnabili");
      return (data ?? []) as { id: string; nome: string | null; cognome: string | null }[];
    },
    staleTime: 5 * 60_000,
  });
  const nomeOperatore = (id: string | null) => {
    if (!id) return "Sistema";
    const p = profili?.find((x) => x.id === id);
    return p ? `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || "—" : "—";
  };

  const conteggi = useQuery({
    queryKey: [...CHIAVE_RICONCILIAZIONE, "conteggi"],
    enabled: canSee,
    queryFn: async () => {
      const conta = async (lista: string[]) => {
        const { count, error } = await supabase.from("lead_riconciliazioni").select("id", { count: "exact", head: true }).in("esito", lista);
        if (error) throw error;
        return count ?? 0;
      };
      const [da, fatti] = await Promise.all([conta(["da_riconciliare"]), conta(ESITI_RICONCILIATI)]);
      return { da, fatti };
    },
  });

  const daRiconciliare = useQuery({
    queryKey: [...CHIAVE_RICONCILIAZIONE, "da-riconciliare"],
    enabled: canSee && vista === "da-riconciliare",
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_riconciliazioni").select(COLONNE)
        .eq("esito", "da_riconciliare").order("creato_il", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as RigaRiconciliazione[];
    },
  });

  const esitiFiltro = esiti.filter((e) => (ESITI_RICONCILIATI as string[]).includes(e));
  const riconciliati = useQuery({
    queryKey: [...CHIAVE_RICONCILIAZIONE, "riconciliati", search, esitiFiltro, page],
    enabled: canSee && vista === "riconciliati",
    queryFn: async () => {
      let q = supabase.from("lead_riconciliazioni").select(COLONNE, { count: "exact" })
        .in("esito", esitiFiltro.length ? esitiFiltro : ESITI_RICONCILIATI);
      const t = testoPerFiltroOr(search);
      if (t) q = q.or(`nome_lead.ilike.%${t}%,cliente_ragione_sociale.ilike.%${t}%,cliente_codice.ilike.%${t}%,lead_partita_iva.ilike.%${t}%`);
      const da = (page - 1) * PAGINA;
      const { data, error, count } = await q
        .order("risolto_il", { ascending: false, nullsFirst: false })
        .order("creato_il", { ascending: false })
        .range(da, da + PAGINA - 1);
      if (error) throw error;
      return { righe: (data ?? []) as unknown as RigaRiconciliazione[], totale: count ?? 0 };
    },
  });

  const aggiorna = (leadId?: string) => {
    void qc.invalidateQueries({ queryKey: CHIAVE_RICONCILIAZIONE });
    void qc.invalidateQueries({ queryKey: ["lead-lista"] });
    if (leadId) {
      void qc.invalidateQueries({ queryKey: ["lead", leadId] });
      void qc.invalidateQueries({ queryKey: ["lead-storico", leadId] });
    }
  };

  const controlla = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("riconcilia_lead_ora");
      if (error) throw error;
      return esitoControlloOra(data);
    },
    onSuccess: (e) => {
      setErroriControllo(e.errori);
      if (e.errori.length) toast.warning(`${e.testo}. ${e.errori.length} lead non elaborati: vedi il dettaglio.`);
      else toast.success(e.testo);
      aggiorna();
    },
    onError: (e: Error) => toast.error(`Controllo non riuscito: ${e.message}`),
  });

  const collega = useMutation({
    mutationFn: async (v: { riga: RigaRiconciliazione; cliente: CandidatoRiconciliazione }) => {
      const { error } = await supabase.rpc("collega_lead_da_riconciliare", { _riconciliazione_id: v.riga.id, _cliente_id: v.cliente.id });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success("Lead collegato al cliente"); aggiorna(v.riga.lead_id); },
    onError: (e: Error) => toast.error(`Collegamento non riuscito: ${e.message}`),
  });

  const annulla = useMutation({
    mutationFn: async (r: RigaRiconciliazione) => {
      const { error } = await supabase.rpc("annulla_conversione_lead", { _lead_id: r.lead_id });
      if (error) throw error;
    },
    onSuccess: (_d, r) => { toast.success("Collegamento annullato"); aggiorna(r.lead_id); },
    onError: (e: Error) => toast.error(`Annullamento non riuscito: ${e.message}`),
  });

  const linkLead = (id: string, testo: ReactNode) =>
    canManage ? <Link to="/lead/$leadId" params={{ leadId: id }} className="text-primary hover:underline">{testo}</Link> : <span>{testo}</span>;
  const linkCliente = (id: string, testo: ReactNode) => <LinkClienteVisibile clienteId={id}>{testo}</LinkClienteVisibile>;

  const opzioniEsito = useMemo(() => ESITI_RICONCILIATI.map((e) => ({ valore: e, label: LEAD_RICONCILIAZIONE_ESITO_LABEL[e] })), []);
  const totale = riconciliati.data?.totale ?? 0;
  const pagine = Math.max(1, Math.ceil(totale / PAGINA));
  const inCorso = collega.isPending || annulla.isPending;

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!canSee) {
    return <Card className="p-6"><p className="text-sm text-muted-foreground">Non hai accesso alla sezione Lead.</p></Card>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <BackButton fallbackTo="/lead" fallbackLabel="Lead" />
          <h1 className="mt-1 break-words text-2xl font-bold tracking-tight sm:text-3xl">Riconciliazione lead → clienti</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Dopo ogni import clienti da Gamma, un lead viene collegato in automatico al cliente con la stessa partita IVA o codice fiscale. Se i clienti possibili sono più di uno, la scelta va fatta qui.
          </p>
        </div>
        <PulsanteControllaOra isAdmin={isAdmin} inCorso={controlla.isPending} onClick={() => controlla.mutate()} />
      </div>

      {erroriControllo.length > 0 && (
        <details className="rounded-md border border-l-4 border-l-amber-500 bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">{erroriControllo.length} lead non elaborati nell'ultimo controllo</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {erroriControllo.map((e, i) => <li key={i} className="break-words">{e}</li>)}
          </ul>
        </details>
      )}

      <Tabs value={vista} onValueChange={(v) => void navigate({ search: { vista: validaVistaRiconciliazione(v) } })}>
        <TabsList className="h-auto max-w-full flex-wrap">
          <TabsTrigger value="da-riconciliare" className="min-h-10">Da riconciliare ({(conteggi.data?.da ?? 0).toLocaleString("it-IT")})</TabsTrigger>
          <TabsTrigger value="riconciliati" className="min-h-10">Riconciliati ({(conteggi.data?.fatti ?? 0).toLocaleString("it-IT")})</TabsTrigger>
        </TabsList>

        <TabsContent value="da-riconciliare" className="mt-4 space-y-3">
          {daRiconciliare.isLoading ? <Skeleton className="h-32 w-full" />
            : (daRiconciliare.data ?? []).length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nessun lead da riconciliare</p>
            : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {(daRiconciliare.data ?? []).map((r) => (
                  <SchedaDaRiconciliare
                    key={r.id} riga={r} puoCollegare={canManage} linkLead={linkLead} linkCliente={linkCliente} inCorso={inCorso}
                    onCollega={(c) => setConferma({
                      titolo: "Collegare il lead al cliente?",
                      testo: `Collegare il lead ${r.nome_lead ?? ""} al cliente ${c.ragione_sociale ?? ""} (${c.codice_gestionale ?? "—"})? Contatti, cantieri, preventivi e allegati del lead passeranno al cliente.`,
                      azione: () => collega.mutate({ riga: r, cliente: c }),
                    })}
                  />
                ))}
              </div>
            )}
        </TabsContent>

        <TabsContent value="riconciliati" className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setCampo("searchInput", e.target.value)}
                placeholder="Cerca lead, cliente, codice o P.IVA"
                aria-label="Cerca nei riconciliati"
                className="min-h-10 pl-8"
              />
            </div>
            <FiltroMultiplo etichetta="Esito" opzioni={opzioniEsito} selezionati={esitiFiltro} onChange={(v) => { setCampo("esiti", v); setCampo("page", 1); }} />
          </div>
          {riconciliati.isLoading ? <Skeleton className="h-32 w-full" />
            : (riconciliati.data?.righe ?? []).length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nessun lead riconciliato</p>
            : (
              <ElencoRiconciliati
                righe={riconciliati.data?.righe ?? []} isAdmin={isAdmin} nomeOperatore={nomeOperatore}
                linkLead={linkLead} linkCliente={linkCliente} inCorso={inCorso}
                onAnnulla={(r) => setConferma({
                  titolo: "Annullare il collegamento?",
                  testo: "Il lead torna non collegato. Il cliente non viene toccato; preventivi e contatti già passati restano al cliente.",
                  azione: () => annulla.mutate(r),
                })}
              />
            )}
          {totale > PAGINA && (
            <div className="flex items-center justify-end gap-2 text-sm">
              <span className="text-muted-foreground">Pagina {page} di {pagine}</span>
              <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Pagina precedente" disabled={page <= 1} onClick={() => setCampo("page", page - 1)}><ChevronLeft className="size-4" /></Button>
              <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Pagina successiva" disabled={page >= pagine} onClick={() => setCampo("page", page + 1)}><ChevronRight className="size-4" /></Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!conferma} onOpenChange={(o) => { if (!o) setConferma(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{conferma?.titolo}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">{conferma?.testo}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { conferma?.azione(); setConferma(null); }}>Conferma</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
