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
import { SemaforoPallino } from "@/components/semaforo-pallino";
import { fetchUltimiLasciati, lasciaCosiRevisione } from "@/lib/revisione-fidi";
import {
  fetchAlertFidiAperti, cosaFareAlert, alertLasciabileCosi, etichettaAvviso, debitoOggi, alertSelezionabile,
  importoDaAlert, statoEffettivoAlert, fetchDecisioniProtette, giaDeciso, testoGiaDeciso, etichettaRichiestaBreve, etichettaDecisioneAlert, percheAlert, filtraAlert, contatoriAlert, SITUAZIONE_ALERT_LABEL, STATI_ALERT_DEFAULT, TIPO_ALERT_LABEL,
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
  const { data: righeBase, isLoading, error } = useQuery({
    queryKey: ["alert-fidi-aperti"],
    queryFn: fetchAlertFidiAperti,
  });
  const righe = righeBase;
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
  const { data: decisioniMap } = useQuery({
    queryKey: ["decisioni-protette-alert", idsClienti.join(",")],
    enabled: idsClienti.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchDecisioniProtette(idsClienti),
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

  // "Già deciso" (fonte unica giaDeciso): decisione protetta e riferimento = fido Gamma.
  const tutte = useMemo(() => (righe ?? []).map((a) => {
    const d = decisioniMap?.get(a.cliente_id);
    const gd = giaDeciso(d, riferimentoMap?.get(a.cliente_id), a.cliente?.fido_gestionale ?? a.fido_gamma);
    return gd && d ? { ...a, gia_deciso: d } : a;
  }), [righe, decisioniMap, riferimentoMap]);
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

  const visibili = useMemo(() => filtraAlert(tutte, { stati, tipi, negozi, agenti: agentiSel, richiesta: richiestaSel }),
    [tutte, stati, tipi, negozi, agentiSel, richiestaSel]);
  // Contatori: stessi filtri Negozio/Agente/Richiesta della lista, non Situazione e Tipo.
  const contatori = useMemo(() => contatoriAlert(filtraAlert(tutte, { negozi, agenti: agentiSel, richiesta: richiestaSel })),
    [tutte, negozi, agentiSel, richiestaSel]);
  // Selezione per alert (solo selezionabili e visibili).
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const selezionabiliVisibili = visibili.filter(alertSelezionabile);
  const selVisibili = selezionabiliVisibili.filter((a) => selezionati.has(a.id));
  const tuttiSel = selezionabiliVisibili.length > 0 && selVisibili.length === selezionabiliVisibili.length;
  const toggle = (id: string) => setSelezionati((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleTutti = (v: boolean) => setSelezionati(v ? new Set(selezionabiliVisibili.map((a) => a.id)) : new Set());

  // Dialog proposta: un cliente una volta sola; l'importo dell'alert (riduzione/extra) prevale.
  const [propostaOpen, setPropostaOpen] = useState(false);
  const [proposta, setProposta] = useState<{ righe: any[]; importi: Map<string, number>; sempre: string[] }>({ righe: [], importi: new Map(), sempre: [] });
  // Da Alert fidi i clienti scelti si vedono sempre nella finestra, anche se rinnovi
  // (chi apre da un alert ha già scelto quei clienti; vale per singolo e selezione multipla).
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
    setProposta({ righe: [...clienti.values()], importi, sempre: [...clienti.keys()] });
    setPropostaOpen(true);
  }

  const filtriAttivi = Number(stati.length !== STATI_ALERT_DEFAULT.length || !STATI_ALERT_DEFAULT.every((s) => stati.includes(s)))
    + Number(tipi.length > 0) + Number(negozi.length > 0) + Number(agentiSel.length > 0) + Number(richiestaSel.length > 0);

  const linkCliente = (a: AlertFidoRow) => (
    <Link to="/clienti/$clienteId" params={{ clienteId: a.cliente_id }} search={{ tab: "storico" } as any}
      className="break-words line-clamp-2 font-medium text-primary hover:underline">
      {a.cliente?.ragione_sociale ?? "Cliente"}
    </Link>
  );
  const nomeAgenteAlert = (a: AlertFidoRow) => a.cliente?.codice_agente ? (nomeAgente.get(a.cliente.codice_agente) ?? a.cliente.codice_agente) : null;
  const renderCliente = (a: AlertFidoRow) => (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start gap-2">
        <SemaforoPallino cliente={{ fido_teorico_cliente: teoricoMap?.get(a.cliente_id) }} className="mt-1.5" />
        <div className="min-w-0">{linkCliente(a)}</div>
      </div>
      {a.cliente?.codice_gestionale && <div className="text-xs text-muted-foreground">{a.cliente.codice_gestionale}</div>}
      <div className="break-words text-xs text-muted-foreground">
        {[a.cliente?.stores?.nome ?? "Senza negozio", nomeAgenteAlert(a) ?? "Senza agente"].join(" · ")}
      </div>
    </div>
  );
  const fidoGammaAlert = (a: AlertFidoRow) => Number(a.cliente?.fido_gestionale ?? a.fido_gamma ?? 0);
  // Stesso valore che "Apri proposta" precompila (teoricoPropostaIniziale).
  const fidoTeoricoAlert = (a: AlertFidoRow): number | null =>
    teoricoPropostaIniziale(isProponibile(teoricoMap?.get(a.cliente_id)?.regola_applicata ?? ""), importoDaAlert(a), riferimentoMap?.get(a.cliente_id));
  const renderTeorico = (a: AlertFidoRow) => {
    const t = fidoTeoricoAlert(a);
    if (t == null) return <span className="text-muted-foreground">—</span>;
    const diff = t - fidoGammaAlert(a);
    return (
      <span className="tabular-nums">
        {formatEuro(t)}
        {diff !== 0 && (
          <span className={diff > 0 ? "ml-1 text-success" : "ml-1 text-muted-foreground"}>
            ({diff > 0 ? "+" : "−"}{Math.abs(diff).toLocaleString("it-IT")})
          </span>
        )}
      </span>
    );
  };
  const renderNumeri = (a: AlertFidoRow) => (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm tabular-nums">
      <span>Fido Gamma {formatEuro(fidoGammaAlert(a))}</span><span className="text-muted-foreground">|</span>
      <span>Ci deve {formatEuro(debitoOggi(a))}</span><span className="text-muted-foreground">|</span>
      <span>Fido teorico {renderTeorico(a)}</span>
    </div>
  );
  const renderOrdini = (a: AlertFidoRow) => {
    const t = testoOrdiniAlert(a);
    return t ? <div className="break-words text-xs text-warning">{t}</div> : null;
  };
  const renderPerche = (a: AlertFidoRow, conOrdini = true) => (
    <div className="min-w-0 space-y-0.5">
      <div className="break-words text-sm">{percheAlert(a, teoricoMap?.get(a.cliente_id))}</div>
      {conOrdini && renderOrdini(a)}
    </div>
  );
  // "Ultima decisione": solo quando c'è (decisione, già deciso, lasciato così); il badge della richiesta attiva resta.
  const renderDecisione = (a: AlertFidoRow) => {
    if (statoEffettivoAlert(a) === "gia_deciso" && a.gia_deciso) {
      return <span className="break-words text-xs text-muted-foreground">{testoGiaDeciso(a.gia_deciso)}</span>;
    }
    const r = a.richiesta_attiva;
    if (r) {
      return (
        <Link to="/richieste/$richiestaId" params={{ richiestaId: r.id }}>
          <Badge className="whitespace-normal break-words bg-info/15 text-left text-info hover:bg-info/25">{etichettaRichiestaBreve(r)}</Badge>
        </Link>
      );
    }
    if (a.decisione) {
      return (
        <div className="space-y-0.5">
          <Link to="/richieste/$richiestaId" params={{ richiestaId: a.decisione.id }}
            className="break-words text-xs text-muted-foreground hover:underline">{etichettaDecisioneAlert(a.decisione)}</Link>
          {a.decisione_protetta && <div className="text-xs text-muted-foreground">Extra protetto: non selezionabile per 30 giorni</div>}
        </div>
      );
    }
    if (statoEffettivoAlert(a) === "confermato") {
      const l = lasciatiMap?.get(a.cliente_id);
      const fino = l?.valido_fino ?? a.riproponi_dal;
      return <span className="break-words text-xs text-muted-foreground">Lasciato così fino al {fmtGiornoMese(fino)}{l?.deciso_da_nome ? ` (da ${l.deciso_da_nome})` : ""}</span>;
    }
    return null;
  };
  const renderAzioni = (a: AlertFidoRow) => alertSelezionabile(a) ? (
    <Button size="sm" className="h-auto min-h-10 w-full whitespace-normal" onClick={() => apriProposta([a])}>Apri proposta</Button>
  ) : null;

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
                  { etichetta: "Fido", valore: renderNumeri(a) },
                  { etichetta: "Perché", valore: renderPerche(a) },
                  ...(renderDecisione(a) ? [{ etichetta: "Ultima decisione", valore: renderDecisione(a) }] : []),
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
                <TableHead className="w-[17%]">Cliente</TableHead>
                <TableHead>Perché</TableHead>
                <TableHead className="w-24 text-right">Fido Gamma</TableHead>
                <TableHead className="w-24 text-right">Ci deve</TableHead>
                <TableHead className="w-28 text-right">Fido teorico</TableHead>
                <TableHead className="w-[13%]">Ultima decisione</TableHead>
                <TableHead className="w-24">Alert dal</TableHead>
                <TableHead className="w-28">Azioni</TableHead>
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
                    <TableCell className="align-top whitespace-normal">
                      <Badge variant="outline" className="mb-1 whitespace-normal">{etichettaAvviso(a)}</Badge>
                      {renderPerche(a)}
                    </TableCell>
                    <TableCell className="align-top text-right tabular-nums">{formatEuro(fidoGammaAlert(a))}</TableCell>
                    <TableCell className="align-top text-right tabular-nums">{formatEuro(debitoOggi(a))}</TableCell>
                    <TableCell className="align-top whitespace-normal text-right">{renderTeorico(a)}</TableCell>
                    <TableCell className="align-top whitespace-normal">{renderDecisione(a)}</TableCell>
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
        mostraSempre={proposta.sempre}
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
