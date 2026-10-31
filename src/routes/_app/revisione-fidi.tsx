import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ClipboardList, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import { SchedaLista, ElencoSchede } from "@/components/lista-responsive";
import { ProposteFidoMassivoDialog } from "@/components/proposta-fido-massiva-dialog";
import { SegnalazioniFido } from "@/components/segnalazioni-fido";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatEuro } from "@/lib/fidi";
import { fetchUtentiAnteprimaFidoNuovo } from "@/lib/fido-teorico";
import { confermaAlertFido, etichettaRichiestaAlert } from "@/lib/alert-fidi";
import {
  fetchRevisioneFidi, riepilogoRevisione, ETICHETTE_GRUPPO_REVISIONE, type GruppoRevisione, type RigaRevisione,
} from "@/lib/revisione-fidi";

export const Route = createFileRoute("/_app/revisione-fidi")({
  head: () => ({ meta: [
    { title: "Revisione fidi | FidiManager" },
    { name: "description", content: "I tuoi clienti da sistemare in tre passaggi: proposte pronte, da decidere, da incassare." },
    { property: "og:title", content: "Revisione fidi | FidiManager" },
    { property: "og:description", content: "I tuoi clienti da sistemare in tre passaggi: proposte pronte, da decidere, da incassare." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: RevisioneFidiPage,
});

const NESSUNO = "__none__";

function RevisioneFidiPage() {
  const { user } = useAuth();
  const { data: abilitati, isLoading } = useQuery({
    queryKey: ["fido-v2-anteprima-utenti"], queryFn: fetchUtentiAnteprimaFidoNuovo, staleTime: 5 * 60_000,
  });
  if (isLoading || !user) return <div className="mx-auto w-full max-w-7xl p-4"><Skeleton className="h-40 w-full" /></div>;
  if (!(abilitati ?? []).includes(user.id)) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <Card className="p-6 text-center">
          <p className="font-medium">Pagina non disponibile</p>
          <p className="mt-1 text-sm text-muted-foreground">La revisione fidi è in anteprima e visibile solo agli utenti abilitati.</p>
        </Card>
      </div>
    );
  }
  return <RevisioneContenuto userId={user.id} />;
}

function fmtGiornoMese(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function RevisioneContenuto({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["revisione-fidi", userId],
    queryFn: () => fetchRevisioneFidi(userId),
    staleTime: 2 * 60_000,
  });
  const { data: agenti } = useQuery({
    queryKey: ["agenti", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60_000,
  });
  const nomeAgente = useMemo(() => new Map((agenti ?? []).map((a) => [a.codice, a.descrizione])), [agenti]);

  const { filtri, setCampo, reset } = useFiltriPagina("revisione-fidi", { negozi: [] as string[], agenti: [] as string[] },
    { userId, valida: { negozi: Array.isArray, agenti: Array.isArray } });
  const { negozi, agenti: agentiSel } = filtri;

  const tutte = data ?? [];
  const opzioniNegozi = useMemo(() => {
    const m = new Map<string, string>(); let senza = false;
    for (const r of tutte) { if (r.cliente.store_id) m.set(r.cliente.store_id, r.cliente.stores?.nome ?? "—"); else senza = true; }
    const o = [...m].map(([valore, label]) => ({ valore, label })).sort((x, y) => x.label.localeCompare(y.label, "it"));
    return senza ? [...o, { valore: NESSUNO, label: "Senza negozio" }] : o;
  }, [tutte]);
  const opzioniAgenti = useMemo(() => {
    const s = new Set<string>(); let senza = false;
    for (const r of tutte) { if (r.cliente.codice_agente) s.add(r.cliente.codice_agente); else senza = true; }
    const o = [...s].map((c) => ({ valore: c, label: nomeAgente.get(c) ?? c })).sort((x, y) => x.label.localeCompare(y.label, "it"));
    return senza ? [...o, { valore: NESSUNO, label: "Senza agente" }] : o;
  }, [tutte, nomeAgente]);

  const visibili = useMemo(() => tutte.filter((r) => {
    if (negozi.length > 0 && !negozi.includes(r.cliente.store_id ?? NESSUNO)) return false;
    if (agentiSel.length > 0 && !agentiSel.includes(r.cliente.codice_agente ?? NESSUNO)) return false;
    return true;
  }), [tutte, negozi, agentiSel]);
  const perGruppo = useMemo(() => {
    const m = new Map<GruppoRevisione, RigaRevisione[]>();
    for (const r of visibili) m.set(r.gruppo, [...(m.get(r.gruppo) ?? []), r]);
    for (const l of m.values()) l.sort((a, b) => a.cliente.ragione_sociale.localeCompare(b.cliente.ragione_sociale, "it"));
    return m;
  }, [visibili]);
  const riepilogo = useMemo(() => riepilogoRevisione(visibili), [visibili]);
  const lista = (g: GruppoRevisione) => perGruppo.get(g) ?? [];

  const invalida = () => {
    queryClient.invalidateQueries({ queryKey: ["revisione-fidi"] });
    queryClient.invalidateQueries({ queryKey: ["alert-fidi-aperti"] });
  };

  const [propostaOpen, setPropostaOpen] = useState(false);
  const [propostaRighe, setPropostaRighe] = useState<any[]>([]);
  const apriProposta = (righe: RigaRevisione[]) => {
    setPropostaRighe(righe.map((r) => ({
      id: r.cliente.id, store_id: r.cliente.store_id, ragione_sociale: r.cliente.ragione_sociale,
      totale_rischio: r.cliente.totale_rischio, fido_gestionale: r.cliente.fido_gestionale,
    })));
    setPropostaOpen(true);
  };
  const conferma = useMutation({
    mutationFn: confermaAlertFido,
    onSuccess: () => { toast.success("Lasciato così per 30 giorni"); invalida(); },
    onError: (e: any) => toast.error("Impossibile confermare: " + (e?.message ?? "errore")),
  });

  const agente = (r: RigaRevisione) => r.cliente.codice_agente ? (nomeAgente.get(r.cliente.codice_agente) ?? r.cliente.codice_agente) : "—";
  const differenza = (r: RigaRevisione) => {
    if (r.riferimento == null) return "—";
    const d = r.riferimento - r.fidoGamma;
    return d === 0 ? "—" : `${d > 0 ? "+" : "−"}${formatEuro(Math.abs(d))}`;
  };
  const linkCliente = (r: RigaRevisione, tab = "storico") => (
    <Link to="/clienti/$clienteId" params={{ clienteId: r.cliente_id }} search={{ tab } as any}
      className="break-words line-clamp-2 font-medium text-primary hover:underline">{r.cliente.ragione_sociale}</Link>
  );
  const segn = (r: RigaRevisione) => r.teorico && r.teorico.segnalazioni.length > 0
    ? <div className="mt-1 min-w-0"><SegnalazioniFido riga={r.teorico} /></div> : null;

  const azioni = (g: GruppoRevisione, r: RigaRevisione): ReactNode => {
    if (g === "pronta") return <Button size="sm" variant="outline" className="h-10" onClick={() => apriProposta([r])}>Apri proposta</Button>;
    if (g === "da_decidere") return (
      <div className="flex flex-wrap gap-2">
        {r.riferimento != null && r.riferimento !== r.fidoGamma && (
          <Button size="sm" className="h-10" onClick={() => apriProposta([r])}>Accetta proposta</Button>
        )}
        <Button size="sm" variant="outline" className="h-10" onClick={() => apriProposta([r])}>Dai un extra</Button>
        {r.alertLasciabile && (
          <Button size="sm" variant="outline" className="h-10" disabled={conferma.isPending}
            onClick={() => conferma.mutate(r.alertLasciabile!.id)}>
            {conferma.isPending && conferma.variables === r.alertLasciabile.id && <Loader2 className="size-4 animate-spin" />}
            Lascia così 30 giorni
          </Button>
        )}
      </div>
    );
    if (g === "da_incassare") return (
      <Button size="sm" variant="outline" className="h-10" asChild>
        <Link to="/clienti/$clienteId" params={{ clienteId: r.cliente_id }} search={{ tab: "scadenziario" } as any}>Vai alle scadenze</Link>
      </Button>
    );
    if (g === "in_corso" && r.richiesta) return (
      <Link to="/richieste/$richiestaId" params={{ richiestaId: r.richiesta.id }}>
        <Badge className="whitespace-normal break-words bg-info/15 text-left text-info hover:bg-info/25">{etichettaRichiestaAlert(r.richiesta)}</Badge>
      </Link>
    );
    if (g === "lasciato_cosi") return <span className="text-xs text-muted-foreground">Lasciato così fino al {fmtGiornoMese(r.alertConfermato?.riproponi_dal)}</span>;
    return null;
  };

  const elenco = (g: GruppoRevisione) => {
    const righe = lista(g);
    if (righe.length === 0) return <p className="p-3 text-sm text-muted-foreground">Nessun cliente.</p>;
    return (
      <>
        <ElencoSchede>
          {righe.map((r) => (
            <SchedaLista key={r.cliente_id}
              titolo={<div className="min-w-0">{linkCliente(r)}{segn(r)}</div>}
              campi={[
                { etichetta: "Negozio", valore: r.cliente.stores?.nome ?? "—" },
                { etichetta: "Agente", valore: agente(r) },
                { etichetta: "Fido in Gamma", valore: formatEuro(r.fidoGamma) },
                { etichetta: "Proposta", valore: formatEuro(r.riferimento) },
                { etichetta: "Differenza", valore: differenza(r) },
              ]}
              footer={<div className="flex w-full flex-wrap gap-2">{azioni(g, r)}</div>}
            />
          ))}
        </ElencoSchede>
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Cliente</TableHead><TableHead>Negozio</TableHead><TableHead>Agente</TableHead>
              <TableHead className="text-right">Fido in Gamma</TableHead><TableHead className="text-right">Proposta</TableHead>
              <TableHead className="text-right">Differenza</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {righe.map((r) => (
                <TableRow key={r.cliente_id}>
                  <TableCell className="max-w-72 min-w-48">{linkCliente(r)}
                    {r.cliente.codice_gestionale && <div className="text-xs text-muted-foreground">{r.cliente.codice_gestionale}</div>}
                    {segn(r)}
                  </TableCell>
                  <TableCell className="break-words">{r.cliente.stores?.nome ?? "—"}</TableCell>
                  <TableCell className="break-words">{agente(r)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEuro(r.fidoGamma)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEuro(r.riferimento)}</TableCell>
                  <TableCell className="text-right tabular-nums">{differenza(r)}</TableCell>
                  <TableCell className="max-w-80">{azioni(g, r)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    );
  };

  const passaggi: { g: GruppoRevisione; n: string; testo: string; extra?: ReactNode }[] = [
    { g: "pronta", n: "①", testo: "Aumenti e riduzioni calcolati dal sistema. Controlla e invia.",
      extra: lista("pronta").length > 0 && (
        <Button size="lg" className="h-12 w-full sm:w-auto" onClick={() => apriProposta(lista("pronta"))}>
          Invia tutte ({lista("pronta").length})
        </Button>
      ) },
    { g: "da_decidere", n: "②", testo: "Clienti che comprano più del solito o con anomalie. Per ognuno scegli." },
    { g: "da_incassare", n: "③", testo: "Hanno scaduto non pagato: il fido resta fermo finché il cliente non paga." },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-4">
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold sm:text-2xl">
          <ClipboardList className="size-5 shrink-0" /> Revisione fidi <Badge variant="secondary">Anteprima</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">I tuoi clienti da sistemare, in tre passaggi.</p>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <FiltroMultiplo etichetta="Negozio" testoTutti="Tutti i negozi" cercabile
            opzioni={opzioniNegozi} selezionati={negozi} onChange={(v) => setCampo("negozi", v)} />
          <FiltroMultiplo etichetta="Agente" testoTutti="Tutti gli agenti" cercabile
            opzioni={opzioniAgenti} selezionati={agentiSel} onChange={(v) => setCampo("agenti", v)} />
          {(negozi.length > 0 || agentiSel.length > 0) && <Button variant="ghost" size="sm" onClick={() => reset()}>Ripristina filtri</Button>}
        </div>
      </Card>

      {isLoading ? <Skeleton className="h-60 w-full" /> : error ? (
        <Card className="p-4 text-sm text-destructive">Impossibile leggere i clienti: {(error as any)?.message ?? "errore"}</Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {passaggi.map((p) => (
              <Card key={p.g} className="flex flex-col gap-2 p-4">
                <div className="text-sm font-medium">{p.n} {ETICHETTE_GRUPPO_REVISIONE[p.g]}</div>
                <div className="text-3xl font-semibold tabular-nums sm:text-4xl">{riepilogo[p.g].clienti.toLocaleString("it-IT")}</div>
                <p className="text-sm text-muted-foreground">{p.testo}</p>
                {p.extra}
              </Card>
            ))}
          </div>

          {passaggi.map((p) => (
            <Card key={p.g} className="overflow-hidden">
              <div className="border-b p-3 font-medium">{p.n} {ETICHETTE_GRUPPO_REVISIONE[p.g]} ({riepilogo[p.g].clienti.toLocaleString("it-IT")})</div>
              {elenco(p.g)}
            </Card>
          ))}

          {(["nuovo", "in_corso", "lasciato_cosi"] as GruppoRevisione[]).map((g) => (
            <Collapsible key={g}>
              <Card className="overflow-hidden">
                <CollapsibleTrigger className="group flex min-h-12 w-full items-center justify-between gap-2 p-3 text-left font-medium">
                  <span className="min-w-0 break-words">{ETICHETTE_GRUPPO_REVISIONE[g]} ({riepilogo[g].clienti.toLocaleString("it-IT")})</span>
                  <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t">{elenco(g)}</CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </>
      )}

      <ProposteFidoMassivoDialog
        open={propostaOpen}
        onOpenChange={setPropostaOpen}
        selectedRows={propostaRighe}
        userId={userId}
        onSuccess={() => { setPropostaOpen(false); invalida(); }}
        onRemove={(id) => setPropostaRighe((p) => p.filter((r) => r.id !== id))}
      />
    </div>
  );
}
