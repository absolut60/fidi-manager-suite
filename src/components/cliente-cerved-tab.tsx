import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Link2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNomiUtentiQuery, formatNomeUtente } from "@/hooks/use-nomi-utenti";
import { puoAggiornareCerved } from "@/lib/permessi-cerved";
import { aggiornaCervedCliente } from "@/lib/cerved/cerved-cliente.functions";
import { formatEuro } from "@/lib/fidi";
import {
  coloreSemaforo, formattaAggiornatoIl, formattaPdCerved, statoAttivitaAnomalo, trovaScore,
  type ScoreCervedVista, type EsitoScore, livelloCategoria, esitoScore, sigleEcofin,
  formattaEuroCompatto, variazionePercentuale,
} from "@/lib/cerved-presentazione";
import { useEsperienzaPagamentoCliente, testiPagateInRitardo } from "@/hooks/use-esperienza-pagamento";
import { SemaforoAffidabilitaBadge } from "@/components/pannello-rischio-cliente";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Obj = Record<string, any>;
type Fotografie = { ricerca: Obj | null; profilo: Obj | null; score: Obj | null; bilancio?: Obj | null; eventi_negativi?: Obj | null; fido?: Obj | null };

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

  const aggiorna = useServerFn(aggiornaCervedCliente);
  const mut = useMutation({
    mutationFn: () => aggiorna({ data: { clienteId } }),
    onSuccess: (r) => {
      toast.success(r.nuovo_collegamento ? "Cliente collegato a Cerved" : "Dati Cerved aggiornati");
      if (r.errori?.length) toast.warning(`Alcuni dati non sono stati letti: ${r.errori.join(" · ")}`);
      qc.invalidateQueries({ queryKey: chiave });
    },
    onError: (e: Error) => toast.error(e.message || "Aggiornamento Cerved non riuscito"),
  });

  if (!pivaValida) {
    return <Riquadro><p className="text-sm text-muted-foreground">Cerved si collega tramite partita IVA: questo cliente non ne ha una valida.</p></Riquadro>;
  }
  if (q.isLoading) return <div className="max-w-6xl space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (q.error) return <Riquadro><p className="text-sm text-destructive">Non riesco a leggere i dati Cerved: {(q.error as Error).message}</p></Riquadro>;

  return (
    <VistaCerved
      dati={q.data!}
      clienteId={clienteId}
      fidoMade={fidoMade}
      puoAggiornare={puo}
      inCorso={mut.isPending}
      onAggiorna={() => mut.mutate()}
    />
  );
}

function Riquadro({ children }: { children: React.ReactNode }) {
  return <Card className="max-w-2xl"><CardContent className="p-4">{children}</CardContent></Card>;
}

/** Parte solo presentazionale (riusabile con dati finti). Impianto della prima pagina del Light Report. */
export function VistaCerved({ dati, clienteId, fidoMade, puoAggiornare, inCorso, onAggiorna }: {
  dati: DatiCervedCliente; clienteId: string; fidoMade: number | null | undefined; puoAggiornare: boolean;
  inCorso: boolean; onAggiorna: () => void;
}) {
  const [conferma, setConferma] = useState(false);
  const { data: nomi } = useNomiUtentiQuery();
  const collegato = !!dati.soggetto;

  const pulsante = puoAggiornare ? (
    <>
      <Button size="sm" className="min-h-10 w-full sm:w-auto" onClick={() => setConferma(true)} disabled={inCorso}>
        {inCorso ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : collegato ? <RefreshCw className="mr-1 h-4 w-4" /> : <Link2 className="mr-1 h-4 w-4" />}
        {collegato ? "Aggiorna da Cerved" : "Collega a Cerved"}
      </Button>
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
  const immo = trovaScore(scores, "IMMO");
  const ecofin = trovaScore(scores, "ECOFIN");
  const cnsl = trovaScore(scores, "CNSL");
  const anni: Obj[] = Array.isArray(dati.foto.bilancio?.anni) ? dati.foto.bilancio!.anni : [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3">
      {/* A) Intestazione */}
      <Card className="rounded-md">
        <CardContent className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="min-w-0 space-y-3">
            <div>
              <h2 className="break-words text-xl font-bold leading-tight sm:text-2xl">{s.denominazione_cerved ?? r.denominazione ?? "—"}</h2>
              {statoDescr && <p className={`mt-0.5 text-sm font-bold uppercase ${anomalo ? "text-destructive" : ""}`}>{statoDescr}</p>}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="min-w-0 space-y-2">
                <Campo k="P.IVA / CF" v={[r.partita_iva ?? s.partita_iva, r.codice_fiscale && r.codice_fiscale !== r.partita_iva ? r.codice_fiscale : null].filter(Boolean).join(" / ") || null} />
                <Campo k="N. REA" v={r.rea} />
                <Campo k="Natura giuridica" v={r.forma_giuridica} />
              </div>
              <div className="min-w-0 space-y-2">
                <Campo k="Settore attività" v={[r.ateco_2025_codice, r.ateco_2025_descrizione].filter(Boolean).join(" – ") || null} />
              </div>
              <div className="min-w-0 space-y-2">
                <Campo k="Indirizzo internet" v={p?.sito_web} />
                <Campo k="Indirizzo" v={sede} />
                <Campo k="PEC" v={p?.pec?.length ? p.pec.join(", ") : null} />
                <Campo k="Telefono" v={p?.telefono} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <Campo k="Data aggiornamento" v={aggIl ? `${aggIl}${nomeAgg ? ` da ${nomeAgg}` : ""}` : null} />
            <Campo k="Codice Cerved" v={s.id_soggetto != null ? String(s.id_soggetto) : null} />
            {pulsante}
          </div>
        </CardContent>
      </Card>

      {/* B) Riga principale */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <CardScore scores={scores} fido={dati.foto.fido} fidoMade={fidoMade} />
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
          <ComePagaMade clienteId={clienteId} />
        </Sezione>
      </div>

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
const esitoDaSemaforo = (c: string | null | undefined): EsitoScore => {
  const t = coloreSemaforo(c).tono;
  return t === "giallo" ? "ambra" : t;
};

function Quadratino({ esito }: { esito: EsitoScore }) {
  return (
    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-xs font-bold ${SFONDO_ESITO[esito]}`} aria-hidden>
      {esito === "verde" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : esito === "neutro" ? "–" : "!"}
    </span>
  );
}

const TRATTI = ["text-destructive", "text-warning", "text-warning", "text-success", "text-success"];

function CardScore({ scores, fido, fidoMade }: { scores: ScoreCervedVista[]; fido: Obj | null | undefined; fidoMade: number | null | undefined }) {
  const cgs = trovaScore(scores, "CGS");
  const sem = trovaScore(scores, "SEM_CGS");
  const esito = esitoDaSemaforo(sem?.categoria_codice);
  const valore = cgs?.valore ?? null;
  const pt = (deg: number, rr = 80) => [100 + rr * Math.cos((deg * Math.PI) / 180), 100 - rr * Math.sin((deg * Math.PI) / 180)];
  const attivo = valore == null ? -1 : Math.min(4, Math.max(0, Math.floor(valore / 20)));
  const pd = formattaPdCerved(cgs?.pd ?? sem?.pd);
  const andamento = cgs?.trend_descrizione ?? sem?.trend_descrizione;
  return (
    <Sezione titolo="Cerved Group Score">
      {cgs || sem ? (
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 200 108" className="w-full max-w-64" role="img" aria-label={`Affidabilità ${valore ?? "non disponibile"} su 100`}>
            {TRATTI.map((cl, i) => {
              const [x1, y1] = pt(180 - i * 36 - 1.5);
              const [x2, y2] = pt(180 - (i + 1) * 36 + 1.5);
              const on = i === attivo;
              return <path key={i} d={`M ${x1} ${y1} A 80 80 0 0 1 ${x2} ${y2}`} fill="none" stroke="currentColor"
                strokeWidth={on ? 22 : 12} className={on ? TESTO_ESITO[esito] : `${cl} opacity-25`} />;
            })}
          </svg>
          <p className={`-mt-14 flex items-baseline gap-1 ${TESTO_ESITO[esito]}`}>
            <span className="text-5xl font-bold tabular-nums">{valore ?? "—"}</span>
            <span className="text-sm text-muted-foreground">/100</span>
          </p>
          {cgs?.categoria_descrizione && <p className={`mt-1 text-xl font-bold ${TESTO_ESITO[esito]}`}>Affidabilità {cgs.categoria_descrizione.toLowerCase()}</p>}
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {[pd ? `Probabilità di insolvenza ${pd}` : null, andamento ? `Andamento: ${andamento}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      ) : <NonDisp />}
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
  const t = testiPagateInRitardo(esp);
  const soloRiba = t.valore === "Nessun pagamento non RiBa";
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-sm border border-dashed bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Come paga MADE</p>
        <p title={t.titolo} className={`text-sm font-bold ${t.inRitardo ? "text-warning" : ""}`}>
          {soloRiba ? "Paga con RiBa: nessun ritardo da misurare" : <>{t.label}: {t.valore}{t.dettaglio ? <span className="font-normal text-muted-foreground"> · {t.dettaglio}</span> : null}</>}
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

function Campo({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="break-words text-sm font-bold">{v || "—"}</p>
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
