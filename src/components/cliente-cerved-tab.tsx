import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Link2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNomiUtentiQuery, formatNomeUtente } from "@/hooks/use-nomi-utenti";
import { puoAggiornareCerved } from "@/lib/permessi-cerved";
import { aggiornaCervedCliente } from "@/lib/cerved/cerved-cliente.functions";
import { formatEuro } from "@/lib/fidi";
import {
  ALTRI_SCORE_CERVED, coloreSemaforo, etichettaScoreCerved, formattaAggiornatoIl,
  formattaPdCerved, statoAttivitaAnomalo, trovaScore, type ScoreCervedVista,
  livelloCategoria, scalaScore, esitoValutazione, formattaEuroCompatto, variazionePercentuale,
} from "@/lib/cerved-presentazione";
import { useEsperienzaPagamentoCliente, testiPagateInRitardo } from "@/hooks/use-esperienza-pagamento";
import { SemaforoAffidabilitaBadge } from "@/components/pannello-rischio-cliente";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

/** Parte solo presentazionale (riusabile con dati finti). */
export function VistaCerved({ dati, clienteId, fidoMade, puoAggiornare, inCorso, onAggiorna }: {
  dati: DatiCervedCliente; clienteId: string; fidoMade: number | null | undefined; puoAggiornare: boolean;
  inCorso: boolean; onAggiorna: () => void;
}) {
  const [conferma, setConferma] = useState(false);
  const { data: nomi } = useNomiUtentiQuery();
  const collegato = !!dati.soggetto;

  const pulsante = puoAggiornare ? (
    <>
      <Button size="sm" className="min-h-10 shrink-0" onClick={() => setConferma(true)} disabled={inCorso}>
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

  const cgs = trovaScore(scores, "CGS");
  const sem = trovaScore(scores, "SEM_CGS");
  const colore = coloreSemaforo(sem?.categoria_codice ?? null);
  const altri = ALTRI_SCORE_CERVED.map((c) => trovaScore(scores, c)).filter((x): x is ScoreCervedVista => !!x);

  const fido = dati.foto.fido;
  const ev = dati.foto.eventi_negativi;
  const bil = dati.foto.bilancio;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3">
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-base font-semibold sm:text-lg">{s.denominazione_cerved ?? r.denominazione ?? "—"}</h2>
              {statoDescr && <Badge variant={anomalo ? "destructive" : "secondary"}>{statoDescr}</Badge>}
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <Voce k="Forma giuridica" v={[r.forma_giuridica, r.classe_forma_descrizione ? `(${r.classe_forma_descrizione})` : null].filter(Boolean).join(" ") || null} />
              <Voce k="ATECO 2025" v={[r.ateco_2025_codice, r.ateco_2025_descrizione].filter(Boolean).join(" – ") || null} />
              <Voce k="REA" v={[r.rea, r.data_iscrizione_rea ? `iscritta il ${r.data_iscrizione_rea}` : null].filter(Boolean).join(" · ") || null} />
              <Voce k="Sede" v={sede} />
              <Voce k="PEC" v={p?.pec?.length ? p.pec.join(", ") : null} />
              <Voce k="Telefono" v={p?.telefono} />
              <Voce k="Sito" v={p?.sito_web} />
            </dl>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {aggIl && <p className="text-xs text-muted-foreground">Aggiornato il {aggIl}{nomeAgg ? ` da ${nomeAgg}` : ""}</p>}
            {pulsante}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Box titolo="Affidabilità Cerved">
          {cgs || sem ? (
            <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
              <Semicerchio valore={cgs?.valore ?? null} categoria={cgs?.categoria_descrizione ?? null} />
              <dl className="space-y-1 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <span className={`h-4 w-4 shrink-0 rounded-full ${colore.classe}`} aria-hidden />
                  <span>Semaforo: <span className="font-medium">{colore.etichetta}</span></span>
                </div>
                <Voce k="Probabilità di insolvenza" v={formattaPdCerved(cgs?.pd ?? sem?.pd)} />
                <Voce k="Andamento" v={cgs?.trend_descrizione ?? sem?.trend_descrizione} />
              </dl>
            </div>
          ) : <NonDisp />}
          <div className="mt-3 space-y-1 rounded-md border bg-muted/40 p-3 text-xs sm:text-sm">
            <RigaValore k="Fido MADE" v={formatEuro(fidoMade ?? 0)} forte />
            {fido ? (
              <>
                <RigaValore k="Fido certificato Cerved" v={euro(fido.fcert?.valore) ?? "Dato non disponibile"} />
                <RigaValore k="Fido medio accordabile" v={euro(fido.fmed?.valore) ?? "Dato non disponibile"} />
              </>
            ) : <p className="text-xs text-muted-foreground">Fido Cerved: servizio non ancora attivo</p>}
          </div>
        </Box>

        <Box titolo="Valutazioni">
          {altri.length ? (
            <ul className="divide-y">
              {altri.map((x) => (
                <li key={x.codice_score}>
                  <RigaValutazione s={x} />
                  {x.codice_score?.toUpperCase() === "PAY" && <ComePagaMade clienteId={clienteId} />}
                </li>
              ))}
            </ul>
          ) : <NonDisp />}
        </Box>
      </div>

      <BloccoBilancio bil={bil} profilo={p} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Box titolo="Eventi negativi">
          {ev?.azienda ? (
            <div className="space-y-2">
              <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 sm:text-sm">
                {EVENTI.map(([k, et]) => {
                  const val = ev.azienda[k];
                  return (
                    <li key={k} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 break-words">{et}</span>
                      <span className={`shrink-0 font-medium ${val === true ? "text-destructive" : val === false ? "text-success" : "text-muted-foreground"}`}>
                        {val === true ? "Presenti" : val === false ? "Assenti" : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {(() => {
                const n = (Array.isArray(ev.persone) ? ev.persone : []).filter((pp: Obj) => EVENTI.some(([k]) => pp[k] === true)).length;
                return <p className={`border-t pt-2 text-xs ${n ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                  {n ? `${n} ${n === 1 ? "persona collegata" : "persone collegate"} con eventi negativi` : "Persone collegate: nessun evento"}
                </p>;
              })()}
            </div>
          ) : <NonDisp />}
        </Box>

        <Box titolo="Altre informazioni">
          {p || r.denominazione ? (
            <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 sm:text-sm">
              <Voce k="Dipendenti" v={p?.dipendenti != null ? `${p.dipendenti.toLocaleString("it-IT")}${p.dipendenti_anno ? ` (${p.dipendenti_anno})` : ""}` : null} />
              <Voce k="Unità locali" v={p?.unita_locali != null ? String(p.unita_locali) : null} />
              <Voce k="Gruppo" v={p?.gruppo == null ? null : p.gruppo ? `Sì${p.capogruppo?.length ? ` – capogruppo ${p.capogruppo.join(", ")}` : ""}` : "No"} />
              <Voce k="Costituita il" v={p?.data_costituzione} />
              <Voce k="Rating di legalità" v={p?.rating_legalita ? `${p.rating_legalita}${p.rating_legalita_rinnovo ? ` (rinnovo ${p.rating_legalita_rinnovo})` : ""}` : null} />
              <Voce k="Pubblica amministrazione" v={r.ente_pa === true ? "Sì" : r.ente_pa === false ? "No" : null} />
            </dl>
          ) : <NonDisp />}
        </Box>
      </div>
    </div>
  );
}

const EVENTI = [
  ["protesti", "Protesti"], ["pregiudizievoli", "Pregiudizievoli"], ["procedure", "Procedure concorsuali"],
  ["eventi_crisi", "Eventi di crisi"], ["cigs", "Cassa integrazione straordinaria"], ["fallimenti_propri", "Fallimenti in proprio"],
] as const;

const TRATTI = ["text-destructive", "text-destructive opacity-70", "text-warning", "text-success opacity-70", "text-success"];

function Semicerchio({ valore, categoria }: { valore: number | null; categoria: string | null }) {
  const pt = (deg: number, r = 80) => [100 + r * Math.cos((deg * Math.PI) / 180), 100 - r * Math.sin((deg * Math.PI) / 180)];
  const attivo = valore == null ? -1 : Math.min(4, Math.max(0, Math.floor(valore / 20)));
  return (
    <div className="mx-auto w-44 shrink-0 sm:w-48" role="img" aria-label={`Affidabilità ${valore ?? "non disponibile"} su 100`}>
      <svg viewBox="0 0 200 112" className="w-full">
        {TRATTI.map((cl, i) => {
          const [x1, y1] = pt(180 - i * 36 - 1.5);
          const [x2, y2] = pt(180 - (i + 1) * 36 + 1.5);
          return <path key={i} d={`M ${x1} ${y1} A 80 80 0 0 1 ${x2} ${y2}`} fill="none" stroke="currentColor"
            strokeWidth={i === attivo ? 20 : 12} className={`${cl} ${i === attivo || attivo < 0 ? "" : "opacity-25"}`} />;
        })}
        <text x="100" y="92" textAnchor="middle" className="fill-foreground" style={{ fontSize: 30, fontWeight: 700 }}>{valore ?? "—"}</text>
        <text x="100" y="108" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>/100</text>
      </svg>
      {categoria && <p className="text-center text-sm font-medium">{categoria}</p>}
    </div>
  );
}

function RigaValutazione({ s }: { s: ScoreCervedVista }) {
  const scala = scalaScore(s.codice_score);
  const liv = livelloCategoria(s.categoria_codice);
  const esito = esitoValutazione(liv);
  const peggioreAMeglio = scala ? [...scala].reverse() : null;
  const attivo = scala && liv != null && liv <= scala.length ? scala.length - liv : -1;
  return (
    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
      <div className="min-w-0">
        <p className="break-words text-xs text-muted-foreground">{etichettaScoreCerved(s)}</p>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {esito === "ottimo" && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />}
          {esito === "attenzione" && <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />}
          <span className="min-w-0 break-words">{s.categoria_descrizione ?? "—"}</span>
        </p>
      </div>
      {peggioreAMeglio && (
        <div className="w-full sm:w-40">
          <div className="flex items-center justify-between gap-1" aria-label={`Livello ${liv ?? "?"} su ${scala!.length}`}>
            {peggioreAMeglio.map((et, i) => (
              <span key={et} title={et} className={`rounded-full ${i === attivo
                ? `h-3.5 w-3.5 ${esito === "ottimo" ? "bg-success" : "bg-warning"} ring-2 ring-offset-1 ring-offset-background ${esito === "ottimo" ? "ring-success/40" : "ring-warning/40"}`
                : "h-2 w-2 bg-muted-foreground/30"}`} />
            ))}
          </div>
          <div className="mt-0.5 hidden justify-between gap-2 text-[10px] leading-tight text-muted-foreground sm:flex">
            <span className="min-w-0 break-words">{peggioreAMeglio[0]}</span>
            <span className="min-w-0 break-words text-right">{peggioreAMeglio[peggioreAMeglio.length - 1]}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ComePagaMade({ clienteId }: { clienteId: string }) {
  const { data: esp } = useEsperienzaPagamentoCliente(clienteId);
  const t = testiPagateInRitardo(esp);
  return (
    <div className="mb-2 flex flex-col gap-1 rounded-md border border-dashed bg-muted/40 p-2 text-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-muted-foreground">Come paga noi (MADE)</p>
        <p title={t.titolo} className={t.inRitardo ? "font-medium text-warning" : "font-medium"}>
          {t.label}: {t.valore}{t.dettaglio ? <span className="font-normal text-muted-foreground"> · {t.dettaglio}</span> : null}
        </p>
      </div>
      <div className="shrink-0"><SemaforoAffidabilitaBadge clienteId={clienteId} /></div>
    </div>
  );
}

const VOCI_PRINCIPALI = [
  ["ricavi", "Ricavi", "fatturato"], ["acquisti", "Acquisti", null], ["mol", "MOL", "mol"],
  ["utile", "Utile/Perdita", "utile_perdita_esercizio"], ["patrimonio_netto", "Patrimonio netto", "patrimonio_netto"],
] as const;
const VOCI_SECONDARIE = [
  ["debiti_banche", "Debiti verso banche"], ["debiti_fornitori", "Debiti verso fornitori"],
  ["crediti_clienti", "Crediti verso clienti"], ["liquidita", "Liquidità"],
] as const;

function BloccoBilancio({ bil, profilo }: { bil: Obj | null | undefined; profilo: Obj | null }) {
  const anni: Obj[] = Array.isArray(bil?.anni) ? bil!.anni : [];
  const att = anni[0];
  const prec = anni[1];
  if (att) {
    return (
      <Box titolo={`Dati di bilancio${att.data_chiusura ? ` (chiuso il ${att.data_chiusura})` : ""}`}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {VOCI_PRINCIPALI.map(([k, et]) => (
            <Cifra key={k} etichetta={k === "utile" && att[k] != null && att[k] < 0 ? "Perdita" : k === "utile" ? "Utile" : et}
              valore={att[k]} precedente={prec?.[k]} />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          {VOCI_SECONDARIE.map(([k, et]) => <Cifra key={k} etichetta={et} valore={att[k]} precedente={prec?.[k]} piccola />)}
        </div>
        {prec?.data_chiusura && <p className="mt-2 text-xs text-muted-foreground">Variazioni rispetto al bilancio chiuso il {prec.data_chiusura}.</p>}
      </Box>
    );
  }
  const daProfilo = profilo && VOCI_PRINCIPALI.some(([, , pk]) => pk && profilo[pk] != null);
  return (
    <Box titolo={daProfilo && profilo?.data_chiusura_ultimo_bilancio ? `Dati di bilancio (chiuso il ${profilo.data_chiusura_ultimo_bilancio})` : "Dati di bilancio"}>
      {daProfilo ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {VOCI_PRINCIPALI.filter(([, , pk]) => pk).map(([k, et, pk]) => (
            <Cifra key={k} etichetta={et} valore={profilo![pk!]} />
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Bilancio non disponibile (le ditte individuali non lo depositano)</p>}
    </Box>
  );
}

function Cifra({ etichetta, valore, precedente, piccola }: { etichetta: string; valore: number | null | undefined; precedente?: number | null; piccola?: boolean }) {
  const v = variazionePercentuale(valore, precedente);
  const negativo = valore != null && valore < 0;
  return (
    <div className="min-w-0 rounded-md border p-2">
      <p className="break-words text-xs text-muted-foreground">{etichetta}</p>
      <p title={valore != null ? formatEuro(valore) : undefined}
        className={`font-semibold tabular-nums ${piccola ? "text-sm" : "text-base sm:text-lg"} ${negativo ? "text-destructive" : ""}`}>
        {formattaEuroCompatto(valore) ?? "—"}
      </p>
      {v != null && (
        <p className={`text-xs font-medium tabular-nums ${v >= 0 ? "text-success" : "text-destructive"}`}>
          {v >= 0 ? "▲" : "▼"} {Math.abs(v).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%
        </p>
      )}
    </div>
  );
}

function RigaValore({ k, v, forte }: { k: string; v: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="min-w-0 text-muted-foreground">{k}</span>
      <span className={`shrink-0 tabular-nums ${forte ? "font-semibold" : "font-medium"}`}>{v}</span>
    </div>
  );
}

const euro = (v: number | null | undefined) => (v == null ? null : formatEuro(v));

function Box({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-semibold">{titolo}</CardTitle></CardHeader>
      <CardContent className="p-4 pt-0">{children}</CardContent>
    </Card>
  );
}

function NonDisp() {
  return <p className="text-sm text-muted-foreground">Dato non disponibile</p>;
}

function Voce({ k, v, rosso }: { k: string; v: string | null | undefined; rosso?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="inline text-muted-foreground">{k}: </dt>
      <dd className={`inline break-words ${rosso ? "font-medium text-destructive" : ""}`}>{v ?? "—"}</dd>
    </div>
  );
}
