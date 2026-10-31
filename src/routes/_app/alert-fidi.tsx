import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import { FiltriCollassabili, SchedaLista, ElencoSchede } from "@/components/lista-responsive";
import { ProposteFidoMassivoDialog } from "@/components/proposta-fido-massiva-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatEuro, formatDate } from "@/lib/fidi";
import { fetchFidoTeorico, fetchFidoTeoricoPerRichiesta, fetchSogliaConsumoFido, fidoPerTornareSottoSoglia, fetchUtentiAnteprimaFidoNuovo } from "@/lib/fido-teorico";
import { SegnalazioniFido } from "@/components/segnalazioni-fido";
import { fetchRevisioneFidi, riepilogoRevisione, daRivedereRevisione, fetchUltimiLasciati, lasciaCosiRevisione } from "@/lib/revisione-fidi";
import {
  fetchAlertFidiAperti, cosaFareAlert, alertLasciabileCosi, etichettaAvviso, debitoOggi, alertSelezionabile,
  importoDaAlert, statoEffettivoAlert, etichettaRichiestaBreve, etichettaDecisioneAlert, percheAlert, SITUAZIONE_ALERT_LABEL, STATI_ALERT_DEFAULT, TIPO_ALERT_LABEL,
  type AlertFidoRow, type StatoAlertFido, type TipoAlertFido,
} from "@/lib/alert-fidi";

export const Route = createFileRoute("/_app/alert-fidi")({
  head: () => ({ meta: [
    { title: "Alert fidi | FidiManager" },
    { name: "description", content: "Clienti con fido da rivedere: consumo alto, riduzioni ed extra non usati." },
    { property: "og:title", content: "Alert fidi | FidiManager" },
    { property: "og:description", content: "Clienti con fido da rivedere: consumo alto, riduzioni ed extra non usati." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: AlertFidiPage,
});

const NESSUNO = "__none__";

function fmtPerc(v: number | null): string {
  if (v == null) return "—";
  return `${(Number(v) * 100).toLocaleString("it-IT", { maximumFractionDigits: 0 })}%`;
}
function fmtGiornoMese(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function AlertFidiPage() {
  const { user } = useAuth();
  const { data: abilitati, isLoading: abilitatiLoading } = useQuery({
    queryKey: ["fido-v2-anteprima-utenti"],
    queryFn: fetchUtentiAnteprimaFidoNuovo,
    staleTime: 5 * 60_000,
  });
  const abilitato = !!user && (abilitati ?? []).includes(user.id);

  if (abilitatiLoading || !user) {
    return <div className="mx-auto w-full max-w-7xl p-4"><Skeleton className="h-40 w-full" /></div>;
  }
  if (!abilitato) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <Card className="p-6 text-center">
          <p className="font-medium">Pagina non disponibile</p>
          <p className="mt-1 text-sm text-muted-foreground">Gli alert fidi sono in anteprima e visibili solo agli utenti abilitati.</p>
        </Card>
      </div>
    );
  }
  return <AlertFidiContenuto userId={user.id} />;
}

function AlertFidiContenuto({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: righe, isLoading, error } = useQuery({
    queryKey: ["alert-fidi-aperti"],
    queryFn: fetchAlertFidiAperti,
  });
  const { data: revisione } = useQuery({
    queryKey: ["revisione-fidi", userId],
    queryFn: () => fetchRevisioneFidi(userId),
    staleTime: 2 * 60_000,
  });
  const daRivedere = useMemo(() => revisione ? daRivedereRevisione(riepilogoRevisione(revisione)) : 0, [revisione]);
  // FM55 3C: segnalazioni dalla stessa fonte di proposta massiva e scheda cliente.
  const idsClienti = useMemo(() => [...new Set((righe ?? []).map((a) => a.cliente_id))].sort(), [righe]);
  const { data: teoricoMap } = useQuery({
    queryKey: ["fido-teorico-alert", idsClienti.join(",")],
    enabled: idsClienti.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchFidoTeorico(idsClienti),
  });
  // Fido proposto = riferimento della richiesta (stessa fonte di proposta massiva e richiesta singola).
  const { data: riferimentoMap } = useQuery({
    queryKey: ["fido-teorico-per-richiesta-alert", userId, idsClienti.join(",")],
    enabled: idsClienti.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchFidoTeoricoPerRichiesta(idsClienti, userId),
  });
  const { data: lasciatiMap } = useQuery({
    queryKey: ["revisione-fidi-lasciati-alert", idsClienti.join(",")],
    enabled: idsClienti.length > 0,
    queryFn: () => fetchUltimiLasciati(idsClienti),
  });
  const { data: sogliaConsumo } = useQuery({ queryKey: ["soglia-consumo-fido"], queryFn: fetchSogliaConsumoFido, staleTime: 5 * 60_000 });
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

  const { filtri, setCampo, reset } = useFiltriPagina("alert-fidi", {
    stati: STATI_ALERT_DEFAULT as string[], tipi: [] as string[], negozi: [] as string[], agenti: [] as string[], richiesta: [] as string[],
  }, { userId, valida: { stati: Array.isArray, tipi: Array.isArray, negozi: Array.isArray, agenti: Array.isArray, richiesta: Array.isArray } });
  const { stati, tipi, negozi, agenti: agentiSel, richiesta: richiestaSel } = filtri;

  const tutte = righe ?? [];
  const opzioniNegozi = useMemo(() => {
    const m = new Map<string, string>();
    let senza = false;
    for (const a of tutte) {
      if (a.cliente?.store_id) m.set(a.cliente.store_id, a.cliente.stores?.nome ?? "—");
      else senza = true;
    }
    const o = [...m].map(([valore, label]) => ({ valore, label })).sort((x, y) => x.label.localeCompare(y.label, "it"));
    return senza ? [...o, { valore: NESSUNO, label: "Senza negozio" }] : o;
  }, [tutte]);
  const opzioniAgenti = useMemo(() => {
    const s = new Set<string>();
    let senza = false;
    for (const a of tutte) {
      if (a.cliente?.codice_agente) s.add(a.cliente.codice_agente); else senza = true;
    }
    const o = [...s].map((c) => ({ valore: c, label: nomeAgente.get(c) ?? c })).sort((x, y) => x.label.localeCompare(y.label, "it"));
    return senza ? [...o, { valore: NESSUNO, label: "Senza agente" }] : o;
  }, [tutte, nomeAgente]);

  const visibili = useMemo(() => tutte.filter((a) => {
    if (stati.length > 0 && !stati.includes(statoEffettivoAlert(a))) return false;
    if (richiestaSel.length > 0 && !richiestaSel.includes(a.richiesta_attiva ? "inoltrata" : "senza")) return false;
    if (tipi.length > 0 && !tipi.includes(a.tipo)) return false;
    if (negozi.length > 0 && !negozi.includes(a.cliente?.store_id ?? NESSUNO)) return false;
    if (agentiSel.length > 0 && !agentiSel.includes(a.cliente?.codice_agente ?? NESSUNO)) return false;
    return true;
  }), [tutte, stati, tipi, negozi, agentiSel, richiestaSel]);

  const contatori = useMemo(() => {
    const aperti = tutte.filter((a) => statoEffettivoAlert(a) === "aperto");
    return {
      c80: aperti.filter((a) => a.tipo === "consumo" && Number(a.livello) < 0.9).length,
      c90: aperti.filter((a) => a.tipo === "consumo" && Number(a.livello) >= 0.9).length,
      rid: aperti.filter((a) => a.tipo === "riduzione").length,
      extra: aperti.filter((a) => a.tipo === "extra_non_usato").length,
    };
  }, [tutte]);

  // Selezione per alert (solo selezionabili e visibili).
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const selezionabiliVisibili = visibili.filter(alertSelezionabile);
  const selVisibili = selezionabiliVisibili.filter((a) => selezionati.has(a.id));
  const tuttiSel = selezionabiliVisibili.length > 0 && selVisibili.length === selezionabiliVisibili.length;
  const toggle = (id: string) => setSelezionati((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleTutti = (v: boolean) => setSelezionati(v ? new Set(selezionabiliVisibili.map((a) => a.id)) : new Set());

  // Dialog proposta: un cliente una volta sola; l'importo dell'alert (riduzione/extra) prevale.
  const [propostaOpen, setPropostaOpen] = useState(false);
  const [proposta, setProposta] = useState<{ righe: any[]; importi: Map<string, number> }>({ righe: [], importi: new Map() });
  function apriProposta(lista: AlertFidoRow[] = selVisibili) {
    const clienti = new Map<string, any>();
    const importi = new Map<string, number>();
    for (const a of lista) {
      if (!a.cliente) continue;
      clienti.set(a.cliente_id, {
        id: a.cliente.id, store_id: a.cliente.store_id, ragione_sociale: a.cliente.ragione_sociale,
        totale_rischio: a.cliente.totale_rischio, fido_gestionale: a.cliente.fido_gestionale,
      });
      const imp = importoDaAlert(a);
      if (imp !== undefined) importi.set(a.cliente_id, imp);
    }
    setProposta({ righe: [...clienti.values()], importi });
    setPropostaOpen(true);
  }

  const conferma = useMutation({
    mutationFn: lasciaCosiRevisione,
    onSuccess: () => {
      toast.success("Lasciato così per 30 giorni");
      queryClient.invalidateQueries({ queryKey: ["alert-fidi-aperti"] });
      queryClient.invalidateQueries({ queryKey: ["revisione-fidi"] });
      queryClient.invalidateQueries({ queryKey: ["revisione-fidi-lasciati-alert"] });
    },
    onError: (e: any) => toast.error("Impossibile confermare: " + (e?.message ?? "errore")),
  });

  const filtriAttivi = Number(stati.length !== STATI_ALERT_DEFAULT.length || !STATI_ALERT_DEFAULT.every((s) => stati.includes(s)))
    + Number(tipi.length > 0) + Number(negozi.length > 0) + Number(agentiSel.length > 0) + Number(richiestaSel.length > 0);

  const linkCliente = (a: AlertFidoRow) => (
    <Link to="/clienti/$clienteId" params={{ clienteId: a.cliente_id }} search={{ tab: "storico" } as any}
      className="break-words line-clamp-2 font-medium text-primary hover:underline">
      {a.cliente?.ragione_sociale ?? "Cliente"}
    </Link>
  );
  const segnalazioniCliente = (a: AlertFidoRow) => {
    const t = teoricoMap?.get(a.cliente_id);
    return t && t.segnalazioni.length > 0 ? <div className="mt-1 min-w-0"><SegnalazioniFido riga={t} /></div> : null;
  };
  const nomeAgenteAlert = (a: AlertFidoRow) => a.cliente?.codice_agente ? (nomeAgente.get(a.cliente.codice_agente) ?? a.cliente.codice_agente) : null;
  const renderCliente = (a: AlertFidoRow) => (
    <div className="min-w-0">
      {linkCliente(a)}
      {a.cliente?.codice_gestionale && <div className="text-xs text-muted-foreground">{a.cliente.codice_gestionale}</div>}
      <div className="break-words text-xs text-muted-foreground">
        {[a.cliente?.stores?.nome ?? "Senza negozio", nomeAgenteAlert(a) ?? "Senza agente"].join(" · ")}
      </div>
    </div>
  );
  const renderPerche = (a: AlertFidoRow) => (
    <div className="min-w-0">
      <div className="break-words text-sm">{percheAlert(a, teoricoMap?.get(a.cliente_id))}</div>
      {segnalazioniCliente(a)}
    </div>
  );
  const fidoPropostoAlert = (a: AlertFidoRow): number | null => {
    const rif = riferimentoMap?.get(a.cliente_id);
    return rif != null ? rif : (a.fido_proposto != null ? Number(a.fido_proposto) : null);
  };
  // "Cosa fare": frase da cosaFareAlert (solo segnalazioni + riferimento richiesta), sotto i valori informativi.
  const renderCosaFare = (a: AlertFidoRow) => {
    const prop = fidoPropostoAlert(a);
    const t = teoricoMap?.get(a.cliente_id);
    const teorico = t?.fido_proposto != null ? Number(t.fido_proposto) : null;
    const sottoSoglia = a.tipo === "consumo" && t && sogliaConsumo
      && t.segnalazioni.some((c) => c === "uso_pieno" || c === "impegni_sopra_base")
      ? fidoPerTornareSottoSoglia(debitoOggi(a), sogliaConsumo) : null;
    return (
      <div className="min-w-0 space-y-0.5">
        <div className="break-words text-sm font-medium">{cosaFareAlert(a, prop, t)}</div>
        <div className="text-xs text-muted-foreground tabular-nums">Proposta: {formatEuro(prop)}</div>
        {teorico != null && teorico !== prop && <div className="text-xs text-muted-foreground tabular-nums">Teorico {formatEuro(teorico)}</div>}
        {sottoSoglia != null && <div className="text-xs text-muted-foreground tabular-nums">Per tornare sotto l'{Math.round(sogliaConsumo! * 100)}% servirebbero {formatEuro(sottoSoglia)}</div>}
      </div>
    );
  };
  // Colonna "Richiesta": solo quando c'è qualcosa (richiesta, decisione, "lasciato così").
  const renderRichiesta = (a: AlertFidoRow) => {
    if (a.decisione) {
      return (
        <div className="space-y-1">
          <Link to="/richieste/$richiestaId" params={{ richiestaId: a.decisione.id }}>
            <Badge variant="secondary" className="whitespace-normal break-words text-left">{etichettaDecisioneAlert(a.decisione)}</Badge>
          </Link>
          {a.decisione_protetta && <div className="text-xs text-muted-foreground">Extra protetto: non selezionabile per 30 giorni</div>}
        </div>
      );
    }
    const r = a.richiesta_attiva;
    if (r) {
      return (
        <Link to="/richieste/$richiestaId" params={{ richiestaId: r.id }}>
          <Badge className="whitespace-normal break-words bg-info/15 text-left text-info hover:bg-info/25">{etichettaRichiestaBreve(r)}</Badge>
        </Link>
      );
    }
    if (statoEffettivoAlert(a) === "confermato") {
      const l = lasciatiMap?.get(a.cliente_id);
      const fino = l?.valido_fino ?? a.riproponi_dal;
      return <span className="break-words text-xs text-muted-foreground">Lasciato così fino al {fmtGiornoMese(fino)}{l?.deciso_da_nome ? ` (da ${l.deciso_da_nome})` : ""}</span>;
    }
    return null;
  };
  const renderAzioni = (a: AlertFidoRow) => (
    <div className="flex w-full flex-col gap-2">
      {alertSelezionabile(a) && (
        <Button size="sm" className="h-auto min-h-10 w-full whitespace-normal" onClick={() => apriProposta([a])}>Apri proposta</Button>
      )}
      {alertLasciabileCosi(a) && (
        <Button size="sm" variant="outline" className="h-auto min-h-10 w-full whitespace-normal" disabled={conferma.isPending}
          onClick={() => conferma.mutate(a.cliente_id)}>
          {conferma.isPending && conferma.variables === a.cliente_id ? <Loader2 className="size-4 animate-spin" /> : null}
          Lascia così 30 giorni
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <Bell className="size-5 shrink-0" /> Alert fidi <Badge variant="secondary">Anteprima</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">Clienti con il fido da rivedere. Si aggiornano a ogni ricalcolo del fido teorico.</p>
        </div>
      </div>

      {daRivedere > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-2 border-primary/40 bg-primary/5 p-3">
          <span className="min-w-0 font-medium">Hai {daRivedere.toLocaleString("it-IT")} clienti da rivedere</span>
          <Button asChild className="h-10"><Link to="/revisione-fidi">Apri Revisione fidi</Link></Button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {([
          ["Usano 80–89% del fido", contatori.c80], ["Usano il 90% o più", contatori.c90],
          ["Riduzioni", contatori.rid], ["Extra non usati", contatori.extra],
        ] as [string, number][]).filter(([l, v], i) => i < 2 || v > 0).map(([l, v]) => (
          <Card key={l} className="p-3">
            <div className="text-xs text-muted-foreground">{l} · da gestire</div>
            <div className="text-2xl font-semibold tabular-nums sm:text-3xl">{(v as number).toLocaleString("it-IT")}</div>
          </Card>
        ))}
      </div>

      <Card className="p-3">
        <FiltriCollassabili attivi={filtriAttivi}
          azioni={filtriAttivi > 0 && <Button variant="ghost" size="sm" onClick={() => reset()}>Ripristina filtri</Button>}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <FiltroMultiplo etichetta="Situazione" testoTutti="Tutte le situazioni"
              opzioni={(Object.keys(SITUAZIONE_ALERT_LABEL) as StatoAlertFido[]).map((s) => ({ valore: s, label: SITUAZIONE_ALERT_LABEL[s] }))}
              selezionati={stati} onChange={(v) => setCampo("stati", v)} />
            <FiltroMultiplo etichetta="Tipo" testoTutti="Tutti i tipi"
              opzioni={(Object.keys(TIPO_ALERT_LABEL) as TipoAlertFido[]).map((t) => ({ valore: t, label: TIPO_ALERT_LABEL[t] }))}
              selezionati={tipi} onChange={(v) => setCampo("tipi", v)} />
            <FiltroMultiplo etichetta="Negozio" testoTutti="Tutti i negozi" cercabile
              opzioni={opzioniNegozi} selezionati={negozi} onChange={(v) => setCampo("negozi", v)} />
            <FiltroMultiplo etichetta="Agente" testoTutti="Tutti gli agenti" cercabile
              opzioni={opzioniAgenti} selezionati={agentiSel} onChange={(v) => setCampo("agenti", v)} />
            <FiltroMultiplo etichetta="Richiesta" testoTutti="Tutte"
              opzioni={[{ valore: "senza", label: "Senza richiesta" }, { valore: "inoltrata", label: "Proposta già inoltrata" }]}
              selezionati={richiestaSel} onChange={(v) => setCampo("richiesta", v)} />
          </div>
        </FiltriCollassabili>
      </Card>

      {selVisibili.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-sm">
          <span className="text-sm">{selVisibili.length} avvisi selezionati</span>
          <Button size="sm" className="h-10" onClick={() => apriProposta()}>Apri proposta</Button>
          <Button size="sm" variant="ghost" className="h-10" onClick={() => setSelezionati(new Set())}>Deseleziona</Button>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : error ? (
        <Card className="p-4 text-sm text-destructive">Impossibile leggere gli alert: {(error as any)?.message ?? "errore"}</Card>
      ) : visibili.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Nessun alert con questi filtri.</Card>
      ) : (
        <>
          <ElencoSchede selezioneTutti={{
            tutti: tuttiSel, alcuni: selVisibili.length > 0, disabled: selezionabiliVisibili.length === 0,
            onChange: toggleTutti, etichetta: `Seleziona tutti (${selezionabiliVisibili.length})`,
          }}>
            {visibili.map((a) => (
              <SchedaLista key={a.id}
                selezione={alertSelezionabile(a) ? { checked: selezionati.has(a.id), onChange: () => toggle(a.id) } : undefined}
                titolo={renderCliente(a)}
                badge={<Badge variant="outline" className="shrink-0">{etichettaAvviso(a)}</Badge>}
                campi={[
                  { etichetta: "Perché", valore: renderPerche(a) },
                  { etichetta: "Fido in Gamma", valore: formatEuro(a.fido_gamma) },
                  { etichetta: "Cosa fare", valore: renderCosaFare(a) },
                  ...(renderRichiesta(a) ? [{ etichetta: "Richiesta", valore: renderRichiesta(a) }] : []),
                  { etichetta: "Alert dal", valore: formatDate(a.aperto_il) },
                ]}
                footer={renderAzioni(a)}
              />
            ))}
          </ElencoSchede>

          <Card className="hidden md:block">
            <Table className="table-fixed">
              <TableHeader><TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={tuttiSel ? true : selVisibili.length > 0 ? "indeterminate" : false}
                    disabled={selezionabiliVisibili.length === 0} onCheckedChange={() => toggleTutti(!tuttiSel)}
                    aria-label="Seleziona tutti" />
                </TableHead>
                <TableHead className="w-[19%]">Cliente</TableHead>
                <TableHead className="w-[22%]">Perché</TableHead>
                <TableHead className="w-28 text-right">Fido in Gamma</TableHead>
                <TableHead>Cosa fare</TableHead>
                <TableHead className="w-[12%]">Richiesta</TableHead>
                <TableHead className="w-24">Alert dal</TableHead>
                <TableHead className="w-40">Azioni</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {visibili.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="align-top">
                      {alertSelezionabile(a) && (
                        <Checkbox checked={selezionati.has(a.id)} onCheckedChange={() => toggle(a.id)}
                          aria-label={`Seleziona ${a.cliente?.ragione_sociale ?? "cliente"}`} />
                      )}
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">{renderCliente(a)}</TableCell>
                    <TableCell className="align-top whitespace-normal">{renderPerche(a)}</TableCell>
                    <TableCell className="align-top text-right tabular-nums">{formatEuro(a.fido_gamma)}</TableCell>
                    <TableCell className="align-top whitespace-normal">{renderCosaFare(a)}</TableCell>
                    <TableCell className="align-top whitespace-normal">{renderRichiesta(a)}</TableCell>
                    <TableCell className="align-top">{formatDate(a.aperto_il)}</TableCell>
                    <TableCell className="align-top whitespace-normal">{renderAzioni(a)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <ProposteFidoMassivoDialog
        open={propostaOpen}
        onOpenChange={setPropostaOpen}
        selectedRows={proposta.righe}
        importiDaAlert={proposta.importi}
        userId={userId}
        onSuccess={() => {
          setSelezionati(new Set());
          setPropostaOpen(false);
          queryClient.invalidateQueries({ queryKey: ["alert-fidi-aperti"] });
        }}
        onRemove={(clienteId) => {
          setSelezionati((p) => new Set([...p].filter((id) => tutte.find((a) => a.id === id)?.cliente_id !== clienteId)));
          setProposta((p) => ({ ...p, righe: p.righe.filter((r) => r.id !== clienteId) }));
        }}
      />
    </div>
  );
}
