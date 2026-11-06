import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Link2, Check, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNomiUtentiQuery, formatNomeUtente } from "@/hooks/use-nomi-utenti";
import { puoAggiornareCerved } from "@/lib/permessi-cerved";
import { aggiornaCervedCliente, apriPdfReportCervedCliente } from "@/lib/cerved/cerved-cliente.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatEuro } from "@/lib/fidi";
import {
  coloreSemaforo, formattaAggiornatoIl, settoreGaugeCerved, SETTORI_GAUGE_CERVED, formattaPdCerved, statoAttivitaAnomalo, trovaScore,
  type ScoreCervedVista, type EsitoScore, livelloCategoria, esitoScore, sigleEcofin,
  formattaEuroCompatto, variazionePercentuale,
  dataIsoIt, meseBreveIt, formattaGiorniCerved, formattaPercentualeCerved, ETICHETTE_LIGHT_REPORT,
  testoGiorniPayline, testoConfrontoFido, eventoRecenteCerved,
} from "@/lib/cerved-presentazione";
import { VisualizzatorePdf } from "@/components/visualizzatore-pdf";
import { useLightReportCliente, chiaveLightReportCliente } from "@/hooks/use-light-report-cliente";
import { useEsperienzaPagamentoCliente, testiEsperienzaPagamento } from "@/hooks/use-esperienza-pagamento";
import { SemaforoAffidabilitaBadge } from "@/components/pannello-rischio-cliente";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Obj = Record<string, any>;
type Fotografie = { ricerca: Obj | null; profilo: Obj | null; score: Obj | null; bilancio?: Obj | null; eventi_negativi?: Obj | null; fido?: Obj | null; light_report?: Obj | null };

export type DatiCervedCliente = {
  soggetto: Obj | null;
  foto: Fotografie;
};

export function ClienteCervedTab({ clienteId, partitaIva, fidoMade }: {
  clienteId: string; partitaIva: string | null | undefined; fidoMade: number | null | undefined;
}) {
  const pivaValida = (partitaIva ?? "").replace(/\D/g, "").length === 11;
  const { roles } = useAuth();
  const puo = puoAggiornareCerved((roles ?? []) as string[]);
  const qc = useQueryClient();
  const chiave = ["cerved-cliente", clienteId];

  const q = useQuery({
    queryKey: chiave,
    enabled: pivaValida,
    queryFn: async (): Promise<DatiCervedCliente> => {
      const { data: soggetto, error } = await supabase
        .from("cerved_soggetti").select("*").eq("cliente_id", clienteId).maybeSingle();
      if (error) throw error;
      const tipi = ["ricerca", "profilo", "score", "bilancio", "eventi_negativi", "fido"] as const;
      const righe = await Promise.all(tipi.map(async (t) => {
        const { data, error: e } = await supabase.from("cerved_fotografie")
          .select("dati, letta_il").eq("cliente_id", clienteId).eq("tipo", t)
          .order("letta_il", { ascending: false }).limit(1).maybeSingle();
        if (e) throw e;
        return (data?.dati as Obj) ?? null;
      }));
      return { soggetto, foto: { ricerca: righe[0], profilo: righe[1], score: righe[2], bilancio: righe[3], eventi_negativi: righe[4], fido: righe[5] } };
    },
  });
  const lr = useLightReportCliente(pivaValida ? clienteId : null);

  const aggiorna = useServerFn(aggiornaCervedCliente);
  const mut = useMutation({
    mutationFn: () => aggiorna({ data: { clienteId } }),
    onSuccess: (r) => {
      toast.success(r.nuovo_collegamento ? "Cliente collegato a Cerved" : "Dati Cerved aggiornati");
      if (r.errori?.length) toast.warning(`Alcuni dati non sono stati letti: ${r.errori.join(" · ")}`);
      qc.invalidateQueries({ queryKey: chiave }); qc.invalidateQueries({ queryKey: ["cerved-report", clienteId] });
      qc.invalidateQueries({ queryKey: chiaveLightReportCliente(clienteId) });
    },
    onError: (e: Error) => toast.error(e.message || "Aggiornamento Cerved non riuscito"),
  });

  if (!pivaValida) {
    return <Riquadro><p className="text-sm text-muted-foreground">Cerved si collega tramite partita IVA: questo cliente non ne ha una valida.</p></Riquadro>;
  }
  if (q.isLoading || lr.isLoading) return <div className="max-w-6xl space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (q.error) return <Riquadro><p className="text-sm text-destructive">Non riesco a leggere i dati Cerved: {(q.error as Error).message}</p></Riquadro>;

  return (
    <VistaCerved
      dati={{ ...q.data!, foto: { ...q.data!.foto, light_report: lr.data ?? null } }}
      clienteId={clienteId}
      fidoMade={fidoMade}
      puoAggiornare={puo}
      inCorso={mut.isPending}
      onAggiorna={() => mut.mutate()}
      barraReport={<BarraReportCerved clienteId={clienteId} puo={puo} />}
    />
  );
}

function Riquadro({ children }: { children: React.ReactNode }) {
  return <Card className="max-w-2xl"><CardContent className="p-4">{children}</CardContent></Card>;
}

/** Parte solo presentazionale (riusabile con dati finti). Impianto della prima pagina del Light Report. */
export function VistaCerved({ dati, clienteId, fidoMade, puoAggiornare, inCorso, onAggiorna, barraReport }: {
  dati: DatiCervedCliente; clienteId: string; fidoMade: number | null | undefined; puoAggiornare: boolean;
  inCorso: boolean; onAggiorna: () => void; barraReport?: React.ReactNode;
}) {
  const [conferma, setConferma] = useState(false);
  const { data: nomi } = useNomiUtentiQuery();
  const collegato = !!dati.soggetto;

  const dialogo = (
    <AlertDialog open={conferma} onOpenChange={setConferma}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{collegato ? "Aggiorna da Cerved" : "Collega a Cerved"}</AlertDialogTitle>
          <AlertDialogDescription>Leggo da Cerved profilo, affidabilità, bilanci, eventi negativi e fido di questo cliente.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setConferma(false); onAggiorna(); }}>Procedi</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  const pulsante = puoAggiornare ? (
    <>
      <Button size="sm" className="min-h-10 w-full sm:w-auto" onClick={() => setConferma(true)} disabled={inCorso}>
        {inCorso ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
        Collega a Cerved
      </Button>
      {dialogo}
    </>
  ) : null;

  if (!collegato) {
    return (
      <Riquadro>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-sm">Questo cliente non è ancora collegato a Cerved.</p>
          {pulsante ?? <p className="text-xs text-muted-foreground">Il collegamento lo fanno amministrazione e recupero crediti.</p>}
        </div>
      </Riquadro>
    );
  }

  const s = dati.soggetto!;
  const r = dati.foto.ricerca ?? {};
  const p = dati.foto.profilo;
  const scores: ScoreCervedVista[] = Array.isArray(dati.foto.score?.scores) ? dati.foto.score!.scores : [];
  const nomeAgg = (() => {
    const u = (nomi ?? []).find((n: any) => n.id === s.aggiornato_da);
    return u ? formatNomeUtente(u) : null;
  })();
  const aggIl = formattaAggiornatoIl(s.ultimo_aggiornamento ?? s.collegato_il);
  const statoCodice = p?.stato_attivita_codice ?? r.stato_attivita_codice;
  const statoDescr = p?.stato_attivita_descrizione ?? r.stato_attivita_descrizione ?? statoCodice;
  const anomalo = statoAttivitaAnomalo(statoCodice);
  const sede = r.sede ? [r.sede.indirizzo, [r.sede.cap, r.sede.comune].filter(Boolean).join(" "), r.sede.provincia ? `(${r.sede.provincia})` : null].filter(Boolean).join(", ") : null;
  const ev = dati.foto.eventi_negativi;
  const denominazione = s.denominazione_cerved ?? r.denominazione ?? "—";
  const pivaCf = [r.partita_iva ?? s.partita_iva, r.codice_fiscale && r.codice_fiscale !== r.partita_iva ? r.codice_fiscale : null].filter(Boolean).join(" / ") || null;
  const pec = p?.pec?.length ? p.pec.join(", ") : null;
  const codiceCerved = s.id_soggetto != null ? String(s.id_soggetto) : null;
  const immo = trovaScore(scores, "IMMO");
  const ecofin = trovaScore(scores, "ECOFIN");
  const cnsl = trovaScore(scores, "CNSL");
  const anni: Obj[] = Array.isArray(dati.foto.bilancio?.anni) ? dati.foto.bilancio!.anni : [];
  const lr = dati.foto.light_report ?? null;
  const dataLr = dataIsoIt(lr?.data_report);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3">
      {/* A) Intestazione (come la testata del Light Report) */}
      <Card className="rounded-md">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-semibold leading-tight sm:text-3xl">{denominazione}</h2>
              {statoDescr && (
                <p className={`mt-1 inline-block border-b pb-1 text-sm font-semibold uppercase tracking-wide ${anomalo ? "border-destructive text-destructive" : "border-border"}`}>{statoDescr}</p>
              )}
            </div>
            {puoAggiornare && (
              <Button variant="outline" size="sm" className="h-10 w-10 shrink-0 px-0 sm:w-auto sm:px-3" onClick={() => setConferma(true)} disabled={inCorso} aria-label="Aggiorna da Cerved" title="Aggiorna da Cerved">
                {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="hidden sm:inline">Aggiorna da Cerved</span>
              </Button>
            )}
          </div>
          {dataLr && <p className="mt-2 text-xs font-semibold text-muted-foreground">Report Cerved del {dataLr}</p>}
          {barraReport}

          {/* Telefono */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 md:hidden">
            <CampoTestata k="P.IVA / CF" v={pivaCf} />
            <CampoTestata k="N. REA" v={r.rea} />
            <CampoTestata k="Natura giuridica" v={r.forma_giuridica} className="col-span-2" />
            <CampoTestata k="Settore attività" v={r.ateco_2025_codice} sotto={r.ateco_2025_descrizione} className="col-span-2" />
            <CampoTestata k="Indirizzo internet" v={p?.sito_web} />
            <CampoTestata k="Telefono" v={p?.telefono} />
            <CampoTestata k="Indirizzo" v={sede} className="col-span-2" />
            <CampoTestata k="PEC" v={pec} className="col-span-2" />
            <p className="col-span-2 border-t pt-2 text-xs text-muted-foreground">
              {[aggIl ? `Aggiornato il ${aggIl}${nomeAgg ? ` da ${nomeAgg}` : ""}` : null, codiceCerved ? `Codice Cerved ${codiceCerved}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>

          {/* Tablet e PC */}
          <div className="mt-5 hidden gap-x-8 gap-y-4 md:grid md:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
            <div className="min-w-0 space-y-3">
              <CampoTestata k="P.IVA / CF" v={pivaCf} />
              <CampoTestata k="N. REA" v={r.rea} />
              <CampoTestata k="Natura giuridica" v={r.forma_giuridica} />
            </div>
            <div className="min-w-0 space-y-3">
              <CampoTestata k="Settore attività" v={r.ateco_2025_codice} sotto={r.ateco_2025_descrizione} />
            </div>
            <div className="min-w-0 space-y-3">
              <CampoTestata k="Indirizzo internet" v={p?.sito_web} />
              <CampoTestata k="Indirizzo" v={sede} />
              <CampoTestata k="PEC" v={pec} />
              <CampoTestata k="Telefono" v={p?.telefono} />
            </div>
            <div className="min-w-0 space-y-3 border-t pt-3 md:col-span-3 md:grid md:grid-cols-2 md:gap-x-8 md:space-y-0 lg:col-span-1 lg:block lg:space-y-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <CampoTestata piccolo k="Data aggiornamento" v={aggIl} sotto={nomeAgg ? `da ${nomeAgg}` : null} />
              <CampoTestata piccolo k="Codice Cerved" v={codiceCerved} />
            </div>
          </div>
        </CardContent>
      </Card>
      {dialogo}

      {/* B) Riga principale */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <CardScore scores={scores} fido={dati.foto.fido} fidoMade={fidoMade} lightReport={lr} />
        <Sezione titolo="Valutazioni parziali">
          {scores.length ? (
            <div className="divide-y">
              {([["NEG", "Eventi negativi"], ["PAY", "Tempi di pagamento"], ["GOV", "Profilo strutturale"]] as const).map(([c, et]) => {
                const x = trovaScore(scores, c);
                return (
                  <div key={c} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0 text-sm">{et}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="break-words text-right text-sm font-bold">{x?.categoria_descrizione ?? "Dato non disponibile"}</span>
                      {x && <Quadratino esito={esitoScore(c, x.categoria_codice)} />}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : <NonDisp />}
          {!lr && <ComePagaMade clienteId={clienteId} />}
        </Sezione>
      </div>

      {lr && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <BloccoPayline payline={lr.payline} clienteId={clienteId} />
          <BloccoRichieste richieste={lr.richieste_12_mesi} />
          <BloccoImmobili immobili={lr.immobili} />
          <BloccoEventiStraordinari ev={lr.eventi_straordinari} />
        </div>
      )}

      {/* C) Bilancio */}
      <BloccoBilancio anni={anni} profilo={p} />

      {/* D) Elementi principali */}
      <Sezione titolo="Elementi principali">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {(() => {
            if (!ev?.azienda) return <Elemento k="Eventi negativi su azienda" v="Dato non disponibile" />;
            const presenti = EVENTI.filter(([k]) => ev.azienda[k] === true).map(([, et]) => et);
            return <Elemento k="Eventi negativi su azienda" v={presenti.length ? presenti.join(", ") : "Assenti"} tono={presenti.length ? "rosso" : "verde"} />;
          })()}
          {(() => {
            if (!ev) return <Elemento k="Eventi negativi su soggetti relazionati" v="Dato non disponibile" />;
            const n = (Array.isArray(ev.persone) ? ev.persone : []).filter((pp: Obj) => EVENTI.some(([k]) => pp[k] === true)).length;
            return <Elemento k="Eventi negativi su soggetti relazionati" v={n ? `${n} ${n === 1 ? "persona" : "persone"}` : "Assenti"} tono={n ? "rosso" : "verde"} />;
          })()}
          <Elemento k="Appartenenza a un gruppo" v={p?.gruppo == null ? "—" : p.gruppo ? `Sì${p.capogruppo?.length ? ` – ${p.capogruppo.join(", ")}` : ""}` : "No"} />
          <Elemento k="N. addetti" v={p?.dipendenti != null ? `${Number(p.dipendenti).toLocaleString("it-IT")}${p.dipendenti_anno ? ` (${p.dipendenti_anno})` : ""}` : "—"} />
          <Elemento k="Unità locali" v={p?.unita_locali != null ? String(p.unita_locali) : "—"} />
          <Elemento k="Unità immobiliari" v={immo?.categoria_descrizione ?? "—"} />
          <Elemento k="Costituita il" v={p?.data_costituzione ?? "—"} />
          <Elemento k="Pubblica amministrazione" v={r.ente_pa === true ? "Sì" : r.ente_pa === false ? "No" : "—"} />
        </div>
      </Sezione>

      {/* E) Altri dati */}
      <Sezione titolo="Altri dati">
        <div className="divide-y">
          <SottoSezione titolo="Solidità economico-finanziaria">
            {ecofin ? <ScalaEcofin s={ecofin} /> : <NonDisp />}
          </SottoSezione>
          <SottoSezione titolo="Debiti e crediti">
            {anni[0] ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {VOCI_SECONDARIE.map(([k, et]) => <Cifra key={k} etichetta={et} valore={anni[0][k]} precedente={anni[1]?.[k]} piccola />)}
              </div>
            ) : <NonDisp />}
          </SottoSezione>
          <SottoSezione titolo="Richieste di informazioni su questa azienda">
            {cnsl ? (
              <p className="flex items-center gap-2 text-sm font-bold"><Quadratino esito={esitoScore("CNSL", cnsl.categoria_codice)} /><span className="min-w-0 break-words">{cnsl.categoria_descrizione ?? "—"}</span></p>
            ) : <NonDisp />}
          </SottoSezione>
          <SottoSezione titolo="Dettaglio eventi negativi">
            {ev?.azienda ? (
              <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {EVENTI.map(([k, et]) => {
                  const val = ev.azienda[k];
                  return (
                    <li key={k} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 break-words">{et}</span>
                      <span className={`shrink-0 font-bold ${val === true ? "text-destructive" : val === false ? "text-success" : "text-muted-foreground"}`}>
                        {val === true ? "Presenti" : val === false ? "Assenti" : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <NonDisp />}
            {lr?.protesti?.possibile_omonimia === true && <p className="text-sm text-muted-foreground">{ETICHETTE_LIGHT_REPORT.omonimia}</p>}
          </SottoSezione>
          <SottoSezione titolo="Rating di legalità">
            <p className="text-sm font-bold">{p?.rating_legalita ? `${p.rating_legalita}${p.rating_legalita_rinnovo ? ` (rinnovo ${p.rating_legalita_rinnovo})` : ""}` : "Non presente"}</p>
          </SottoSezione>
        </div>
      </Sezione>
    </div>
  );
}

const EVENTI = [
  ["protesti", "Protesti"], ["pregiudizievoli", "Pregiudizievoli"], ["procedure", "Procedure concorsuali"],
  ["eventi_crisi", "Eventi di crisi"], ["cigs", "Cassa integrazione straordinaria"], ["fallimenti_propri", "Fallimenti in proprio"],
] as const;

const TESTO_ESITO: Record<EsitoScore, string> = { verde: "text-success", ambra: "text-warning", rosso: "text-destructive", neutro: "text-foreground" };
const SFONDO_ESITO: Record<EsitoScore, string> = {
  verde: "bg-success text-success-foreground", ambra: "bg-warning text-warning-foreground",
  rosso: "bg-destructive text-destructive-foreground", neutro: "bg-muted text-muted-foreground",
};

function Quadratino({ esito }: { esito: EsitoScore }) {
  return (
    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-xs font-bold ${SFONDO_ESITO[esito]}`} aria-hidden>
      {esito === "verde" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : esito === "neutro" ? "–" : "!"}
    </span>
  );
}

// Gauge come nel Light Report: 270° da 225° (basso sinistra) a −45° (basso destra), 8 settori.
function GaugeCerved({ valore }: { valore: number | null }) {
  const attivo = settoreGaugeCerved(valore);
  const pt = (deg: number, r: number) => [100 + r * Math.cos((deg * Math.PI) / 180), 100 - r * Math.sin((deg * Math.PI) / 180)];
  const ampiezza = 270 / 8;
  const spazio = 3;
  return (
    <svg viewBox="0 0 200 180" className="w-full max-w-64" role="img" aria-label={`Affidabilità ${valore ?? "non disponibile"} su 100`}>
      {SETTORI_GAUGE_CERVED.map((c, i) => {
        const on = i === attivo;
        const r = on ? 80 : 76;
        const da = 225 - i * ampiezza - spazio / 2;
        const a = 225 - (i + 1) * ampiezza + spazio / 2;
        const [x1, y1] = pt(da, r);
        const [x2, y2] = pt(a, r);
        return <path key={i} d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" stroke={on ? c.pieno : c.pastello} strokeWidth={on ? 22 : 14} strokeLinecap="butt" />;
      })}
    </svg>
  );
}

export function CardScore({ scores, fido, fidoMade, lightReport }: { scores: ScoreCervedVista[]; fido: Obj | null | undefined; fidoMade: number | null | undefined; lightReport?: Obj | null }) {
  const certificato: number | null = lightReport?.fido_certificato?.valore ?? null;
  const confronto = testoConfrontoFido(fidoMade, certificato);
  const cgs = trovaScore(scores, "CGS");
  const sem = trovaScore(scores, "SEM_CGS");
  const semaforo = coloreSemaforo(sem?.categoria_codice);
  const valore = cgs?.valore != null && Number.isFinite(cgs.valore) ? cgs.valore : null;
  const settore = settoreGaugeCerved(valore);
  const tinta = settore == null ? undefined : SETTORI_GAUGE_CERVED[settore].pieno;
  const categoria = cgs?.categoria_descrizione ? cgs.categoria_descrizione.charAt(0).toUpperCase() + cgs.categoria_descrizione.slice(1).toLowerCase() : null;
  const pd = formattaPdCerved(cgs?.pd ?? sem?.pd);
  const andamento = cgs?.trend_descrizione ?? sem?.trend_descrizione;
  return (
    <Sezione titolo="Cerved Group Score">
      {cgs || sem ? (
        <div className="flex flex-col items-center">
          <div className="relative w-full max-w-64">
            <GaugeCerved valore={valore} />
            <p className="absolute inset-x-0 top-[38%] flex items-baseline justify-center gap-1" style={{ color: tinta }}>
              <span className="text-5xl font-bold tabular-nums">{valore ?? "—"}</span>
              <span className="text-sm opacity-60">/100</span>
            </p>
          </div>
          {categoria && <p className="-mt-6 text-xl font-bold" style={{ color: tinta }}>Affidabilità {categoria}</p>}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
            {sem && (
              <span className="inline-flex items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-full ${semaforo.classe}`} aria-hidden />
                Semaforo: {semaforo.etichetta}
              </span>
            )}
            {pd && <span>Probabilità di insolvenza {pd}</span>}
            {andamento && <span>Andamento: {andamento}</span>}
          </div>
        </div>
      ) : <NonDisp />}
      {certificato != null ? (
        <div className="mt-4 rounded-sm bg-muted p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{ETICHETTE_LIGHT_REPORT.fidoCertificato}</p>
              <p className="text-2xl font-bold tabular-nums">{formatEuro(certificato)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fido MADE</p>
              <p className="text-2xl font-bold tabular-nums">{formatEuro(fidoMade ?? 0)}</p>
            </div>
          </div>
          {confronto && <p className="mt-2 border-t pt-2 text-sm">{confronto}</p>}
        </div>
      ) : (
      <div className="mt-4 rounded-sm bg-muted p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fido certificato</p>
        {fido?.fcert?.valore != null ? (
          <>
            <p className="text-2xl font-bold tabular-nums">{formatEuro(fido.fcert.valore)}</p>
            {fido.fmed?.valore != null && <p className="text-xs text-muted-foreground">Fido medio: {formatEuro(fido.fmed.valore)}</p>}
          </>
        ) : <p className="text-sm font-bold text-muted-foreground">Non ancora attivo</p>}
        <p className="mt-2 border-t pt-2 text-sm">Fido MADE: <span className="font-bold tabular-nums">{formatEuro(fidoMade ?? 0)}</span></p>
      </div>
      )}
    </Sezione>
  );
}

function ScalaEcofin({ s }: { s: ScoreCervedVista }) {
  const liv = livelloCategoria(s.categoria_codice);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-10 gap-0.5" aria-label={`Classe ${liv ? sigleEcofin[liv - 1] : "?"}`}>
        {sigleEcofin.map((sg, i) => {
          const e = esitoScore("ECOFIN", `ECOFIN_${i + 1}`);
          const on = liv === i + 1;
          return (
            <span key={sg} className={`flex h-8 items-center justify-center rounded-sm text-[10px] font-bold sm:text-xs ${SFONDO_ESITO[e]} ${on ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : "opacity-35"}`}>{sg}</span>
          );
        })}
      </div>
      <p className={`text-sm font-bold ${TESTO_ESITO[esitoScore("ECOFIN", s.categoria_codice)]}`}>{s.categoria_descrizione ?? "—"}</p>
    </div>
  );
}

function ComePagaMade({ clienteId }: { clienteId: string }) {
  const { data: esp } = useEsperienzaPagamentoCliente(clienteId);
  const t = testiEsperienzaPagamento(esp);
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-sm border border-dashed bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Come paga MADE</p>
        <p title={t.titolo} className={`text-sm font-bold ${t.nonPuntuali12m ? "text-destructive" : ""}`}>
          {t.label}: {t.valore}{t.dettaglio ? <span className="font-normal text-muted-foreground"> · {t.dettaglio}</span> : null}
        </p>
      </div>
      <div className="shrink-0"><SemaforoAffidabilitaBadge clienteId={clienteId} /></div>
    </div>
  );
}

const VOCI_PRINCIPALI = [
  ["ricavi", "Fatturato", "fatturato"], ["acquisti", "Acquisti", null], ["mol", "MOL", "mol"],
  ["utile", "Utile/Perdita", "utile_perdita_esercizio"], ["patrimonio_netto", "Patrimonio netto", "patrimonio_netto"],
] as const;
const VOCI_SECONDARIE = [
  ["debiti_banche", "Debiti verso banche"], ["debiti_fornitori", "Debiti verso fornitori"],
  ["crediti_clienti", "Crediti verso clienti"], ["liquidita", "Liquidità"],
] as const;

function BloccoBilancio({ anni, profilo }: { anni: Obj[]; profilo: Obj | null }) {
  const att = anni[0];
  const prec = anni[1];
  if (att) {
    return (
      <Sezione titolo={`Dati di bilancio${att.data_chiusura ? ` del ${att.data_chiusura}` : ""}`}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 md:grid-cols-5">
          {VOCI_PRINCIPALI.map(([k, et]) => <Cifra key={k} etichetta={et} valore={att[k]} precedente={prec?.[k]} />)}
        </div>
        {prec?.data_chiusura && <p className="mt-3 text-xs text-muted-foreground">Variazione rispetto al bilancio del {prec.data_chiusura}</p>}
      </Sezione>
    );
  }
  const daProfilo = profilo && VOCI_PRINCIPALI.some(([, , pk]) => pk && profilo[pk] != null);
  return (
    <Sezione titolo={daProfilo && profilo?.data_chiusura_ultimo_bilancio ? `Dati di bilancio del ${profilo.data_chiusura_ultimo_bilancio}` : "Dati di bilancio"}>
      {daProfilo ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 md:grid-cols-4">
          {VOCI_PRINCIPALI.filter(([, , pk]) => pk).map(([k, et, pk]) => <Cifra key={k} etichetta={et} valore={profilo![pk!]} />)}
        </div>
      ) : <p className="text-sm text-muted-foreground">Bilancio non disponibile (le ditte individuali non lo depositano)</p>}
    </Sezione>
  );
}

function Cifra({ etichetta, valore, precedente, piccola }: { etichetta: string; valore: number | null | undefined; precedente?: number | null; piccola?: boolean }) {
  const v = variazionePercentuale(valore, precedente);
  const negativo = valore != null && valore < 0;
  return (
    <div className="min-w-0">
      <p className="break-words text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{etichetta}</p>
      <p title={valore != null ? formatEuro(valore) : undefined}
        className={`font-bold tabular-nums ${piccola ? "text-base" : "text-xl sm:text-2xl"} ${negativo ? "text-destructive" : ""}`}>
        {formattaEuroCompatto(valore) ?? "—"}
      </p>
      {v != null && (
        <p className={`text-xs font-semibold tabular-nums ${v >= 0 ? "text-success" : "text-destructive"}`}>
          {v >= 0 ? "▲" : "▼"} {Math.abs(v).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%
        </p>
      )}
    </div>
  );
}

function Titolo({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{children}</h3>;
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-md">
      <CardContent className="space-y-3 p-4">
        <Titolo>{titolo}</Titolo>
        <div>{children}</div>
      </CardContent>
    </Card>
  );
}

function SottoSezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0">
      <p className="text-sm font-semibold">{titolo}</p>
      {children}
    </div>
  );
}

function CampoTestata({ k, v, sotto, piccolo, className = "" }: { k: string; v: string | null | undefined; sotto?: string | null; piccolo?: boolean; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className={`break-words font-medium ${piccolo ? "text-xs text-muted-foreground" : "text-sm"}`}>{v || "—"}</p>
      {sotto && <p className={`break-words ${piccolo ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}`}>{sotto}</p>}
    </div>
  );
}

function Elemento({ k, v, tono }: { k: string; v: string; tono?: "verde" | "rosso" }) {
  return (
    <div className="min-w-0 rounded-sm border p-3">
      <p className="break-words text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className={`mt-1 break-words text-sm font-bold ${tono === "verde" ? "text-success" : tono === "rosso" ? "text-destructive" : ""}`}>{v}</p>
    </div>
  );
}

function NonDisp() {
  return <p className="text-sm text-muted-foreground">Dato non disponibile</p>;
}

/** "AAAA-MM-GG…" → "GG/MM/AAAA" (solo stringa, niente new Date). */
const dataReportIt = (iso: string | null | undefined) => {
  if (!iso) return null;
  const [a, m, g] = iso.slice(0, 10).split("-");
  return a && m && g ? `${g}/${m}/${a}` : null;
};

/** Solo apertura del PDF del Light Report (dialog con visualizzatore e "Scarica"), se il cliente ha un report. */
function BarraReportCerved({ clienteId, puo }: { clienteId: string; puo: boolean }) {
  const [urlPdf, setUrlPdf] = useState<string | null>(null);
  const rep = useQuery({
    queryKey: ["cerved-report", clienteId],
    enabled: puo,
    queryFn: async () => {
      const { data, error } = await supabase.from("cerved_report")
        .select("percorso_pdf").eq("cliente_id", clienteId).not("percorso_pdf", "is", null)
        .order("scade_il", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const apri = useServerFn(apriPdfReportCervedCliente);
  const mutPdf = useMutation({
    mutationFn: () => apri({ data: { clienteId } }),
    onSuccess: (r) => setUrlPdf(r.url),
    onError: (e: Error) => toast.error(e.message || "Impossibile aprire il PDF"),
  });

  if (!puo || !rep.data?.percorso_pdf) return null;

  return (
    <div className="mt-3 flex justify-end">
      <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => mutPdf.mutate()} disabled={mutPdf.isPending}
        aria-label="Apri report PDF" title="Apri report PDF">
        {mutPdf.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      </Button>

      <Dialog open={!!urlPdf} onOpenChange={(o) => { if (!o) setUrlPdf(null); }}>
        <DialogContent className="flex h-[90dvh] w-[95vw] max-w-5xl flex-col gap-2 p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle>Light Report Cerved</DialogTitle>
            <DialogDescription className="sr-only">Report PDF del cliente</DialogDescription>
          </DialogHeader>
          {urlPdf && <VisualizzatorePdf url={urlPdf} nomeFile="light-report-cerved.pdf" className="flex-1" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
const intIt = (n: unknown) => (num(n) == null ? "—" : Math.round(num(n)!).toLocaleString("it-IT"));

function Voce({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="break-words text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="break-words text-sm font-bold tabular-nums">{v || "—"}</p>
    </div>
  );
}

function BloccoPayline({ payline, clienteId }: { payline: Obj | null | undefined; clienteId: string }) {
  const pl = payline ?? {};
  const giorni = testoGiorniPayline(pl.giorni_effettivi, pl.giorni_concordati);
  const trim: Obj[] = Array.isArray(pl.trimestri) ? pl.trimestri : [];
  const max = Math.max(1, ...trim.flatMap((t) => [num(t.azienda) ?? 0, num(t.settore) ?? 0]));
  return (
    <Sezione titolo={ETICHETTE_LIGHT_REPORT.payline}>
      <div className="space-y-3">
        <p className="text-lg font-bold">{giorni ?? "Dato non disponibile"}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Voce k="Esperienze" v={intIt(pl.esperienze)} />
          <Voce k="Importo totale" v={formattaEuroCompatto(num(pl.importo_totale))} />
          <Voce k="Incidenza scaduto" v={formattaPercentualeCerved(num(pl.incidenza_scaduto))} />
          <Voce k="Aperte scadute" v={intIt(pl.aperte_scadute)} />
          <Voce k="Ritardo medio scadute" v={formattaGiorniCerved(num(pl.ritardo_medio_scadute))} />
          {pl.trend && <Voce k="Andamento" v={pl.trend} />}
        </div>
        {trim.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Giorni di pagamento per trimestre: <span className="font-semibold text-foreground">azienda</span> e <span className="font-semibold">settore</span></p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {trim.map((t, i) => (
                <div key={i} className="flex min-w-0 flex-col items-center gap-1">
                  <div className="flex h-20 items-end gap-0.5">
                    <span className="w-3 rounded-t-sm bg-primary" style={{ height: `${((num(t.azienda) ?? 0) / max) * 100}%` }} title={`Azienda ${formattaGiorniCerved(num(t.azienda)) ?? "—"}`} />
                    <span className="w-3 rounded-t-sm bg-muted-foreground/40" style={{ height: `${((num(t.settore) ?? 0) / max) * 100}%` }} title={`Settore ${formattaGiorniCerved(num(t.settore)) ?? "—"}`} />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">T{t.trimestre ?? "?"}</span>
                  <span className="text-[10px] tabular-nums">{intIt(t.azienda)}/{intIt(t.settore)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <ComePagaMade clienteId={clienteId} />
      </div>
    </Sezione>
  );
}

function BloccoRichieste({ richieste }: { richieste: Obj | null | undefined }) {
  const r = richieste ?? {};
  const mesi: Obj[] = Array.isArray(r.per_mese) ? r.per_mese : [];
  const max = Math.max(1, ...mesi.map((m) => num(m.totale) ?? 0));
  const colori = ["bg-primary", "bg-warning", "bg-muted-foreground/50"];
  return (
    <Sezione titolo={ETICHETTE_LIGHT_REPORT.richieste}>
      <p className="text-xs text-muted-foreground">{ETICHETTE_LIGHT_REPORT.richiesteAiuto}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{intIt(r.totale)}</p>
      {mesi.length > 0 && (
        <>
          <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${mesi.length}, minmax(0, 1fr))` }}>
            {mesi.map((m, i) => (
              <div key={i} className="flex min-w-0 flex-col items-center gap-1">
                <div className="flex h-20 w-full max-w-6 flex-col-reverse overflow-hidden rounded-t-sm" title={`${meseBreveIt(m.mese, m.anno)}: ${intIt(m.totale)}`}>
                  {ETICHETTE_LIGHT_REPORT.serieRichieste.map(([k], j) => (
                    <span key={k} className={colori[j]} style={{ height: `${((num(m[k]) ?? 0) / max) * 100}%` }} />
                  ))}
                </div>
                <span className="text-[9px] leading-tight text-muted-foreground sm:text-[10px]">{meseBreveIt(m.mese, m.anno)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {ETICHETTE_LIGHT_REPORT.serieRichieste.map(([k, et], j) => (
              <span key={k} className="inline-flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${colori[j]}`} aria-hidden />{et}</span>
            ))}
          </div>
        </>
      )}
    </Sezione>
  );
}

function BloccoImmobili({ immobili }: { immobili: Obj | null | undefined }) {
  const im = immobili ?? {};
  return (
    <Sezione titolo={ETICHETTE_LIGHT_REPORT.immobili}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Valore stimato</p>
          <p className="text-xl font-bold tabular-nums" title={num(im.valore_stimato) != null ? formatEuro(im.valore_stimato) : undefined}>{formattaEuroCompatto(num(im.valore_stimato)) ?? "—"}</p>
        </div>
        <Voce k="Immobili stimati" v={intIt(im.numero_stimati)} />
        <Voce k="Fabbricati" v={intIt(im.fabbricati)} />
        <Voce k="Terreni" v={intIt(im.terreni)} />
      </div>
    </Sezione>
  );
}

function BloccoEventiStraordinari({ ev }: { ev: Obj | null | undefined }) {
  const elenco: Obj[] = Array.isArray(ev?.elenco) ? ev!.elenco : [];
  const cont = ev?.conteggi ?? {};
  const oggi = new Date().toISOString().slice(0, 10);
  return (
    <Sezione titolo={ETICHETTE_LIGHT_REPORT.eventiStraordinari}>
      {elenco.length ? (
        <ul className="divide-y">
          {elenco.map((e, i) => {
            const recente = eventoRecenteCerved(e.data_atto, oggi);
            return (
              <li key={i} className={`py-2 text-sm first:pt-0 ${recente ? "rounded-sm border-l-4 border-warning pl-2" : ""}`}>
                <p className="font-semibold"><span className={recente ? "text-warning" : ""}>{dataIsoIt(e.data_atto) ?? "—"}</span> · <span className="break-words">{[e.tipo, e.tipo_trasferimento].filter(Boolean).join(" – ") || "—"}</span></p>
                {(e.cedente || e.cessionario) && <p className="break-words text-muted-foreground">{e.cedente ?? "—"} → {e.cessionario ?? "—"}</p>}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Nessun evento straordinario</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
        {ETICHETTE_LIGHT_REPORT.conteggiEventi.map(([k, et]) => <span key={k}>{et}: <span className="font-semibold text-foreground">{intIt(cont[k])}</span></span>)}
      </div>
    </Sezione>
  );
}
