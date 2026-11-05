import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNomiUtentiQuery, formatNomeUtente } from "@/hooks/use-nomi-utenti";
import { puoAggiornareCerved } from "@/lib/permessi-cerved";
import { aggiornaCervedCliente } from "@/lib/cerved/cerved-cliente.functions";
import { formatEuro } from "@/lib/fidi";
import {
  ALTRI_SCORE_CERVED, coloreSemaforo, etichettaScoreCerved, formattaAggiornatoIl,
  formattaPdCerved, statoAttivitaAnomalo, trovaScore, type ScoreCervedVista,
} from "@/lib/cerved-presentazione";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Obj = Record<string, any>;
type Fotografie = { ricerca: Obj | null; profilo: Obj | null; score: Obj | null };

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
      const tipi = ["ricerca", "profilo", "score"] as const;
      const righe = await Promise.all(tipi.map(async (t) => {
        const { data, error: e } = await supabase.from("cerved_fotografie")
          .select("dati, letta_il").eq("cliente_id", clienteId).eq("tipo", t)
          .order("letta_il", { ascending: false }).limit(1).maybeSingle();
        if (e) throw e;
        return (data?.dati as Obj) ?? null;
      }));
      return { soggetto, foto: { ricerca: righe[0], profilo: righe[1], score: righe[2] } };
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
export function VistaCerved({ dati, fidoMade, puoAggiornare, inCorso, onAggiorna }: {
  dati: DatiCervedCliente; fidoMade: number | null | undefined; puoAggiornare: boolean;
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
            <AlertDialogDescription>Leggo da Cerved profilo e affidabilità di questo cliente.</AlertDialogDescription>
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

  const bilancioPresente = p && [p.fatturato, p.mol, p.utile_perdita_esercizio, p.patrimonio_netto, p.attivo].some((v) => v != null);

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
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`h-6 w-6 shrink-0 rounded-full ${colore.classe}`} aria-label={`Semaforo ${colore.etichetta}`} title={`Semaforo ${colore.etichetta}`} />
                <span className="text-2xl font-bold sm:text-3xl">{cgs?.valore != null ? `${cgs.valore}/100` : "—"}</span>
                {(cgs?.categoria_descrizione ?? sem?.categoria_descrizione) && <Badge variant="outline">{cgs?.categoria_descrizione ?? sem?.categoria_descrizione}</Badge>}
              </div>
              <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                <Voce k="Probabilità di insolvenza" v={formattaPdCerved(cgs?.pd ?? sem?.pd)} />
                <Voce k="Andamento" v={cgs?.trend_descrizione ?? sem?.trend_descrizione} />
              </dl>
            </div>
          ) : <NonDisp />}
          <div className="mt-3 border-t pt-2 text-sm">
            <p>Fido MADE: <span className="font-semibold">{formatEuro(fidoMade ?? 0)}</span></p>
            <p className="text-xs text-muted-foreground">Fido certificato Cerved: arriverà con il report completo</p>
          </div>
        </Box>

        <Box titolo="Valutazioni">
          {altri.length ? (
            <ul className="divide-y text-sm">
              {altri.map((x) => (
                <li key={x.codice_score} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-1.5">
                  <div className="min-w-0">
                    <p className="break-words text-xs sm:text-sm">{etichettaScoreCerved(x)}</p>
                    {x.categoria_descrizione && <p className="text-xs text-muted-foreground">{x.categoria_descrizione}</p>}
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">{x.valore != null ? `${x.valore}/100` : "—"}</span>
                </li>
              ))}
            </ul>
          ) : <NonDisp />}
        </Box>

        <Box titolo={p?.anno_ultimo_bilancio ? `Ultimo bilancio (${p.anno_ultimo_bilancio}${p.data_chiusura_ultimo_bilancio ? `, chiuso il ${p.data_chiusura_ultimo_bilancio}` : ""})` : "Ultimo bilancio"}>
          {bilancioPresente ? (
            <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 sm:text-sm">
              <Voce k="Fatturato" v={euro(p!.fatturato)} />
              <Voce k="MOL" v={euro(p!.mol)} />
              <Voce k={p!.utile_perdita_esercizio != null && p!.utile_perdita_esercizio < 0 ? "Perdita" : "Utile"} v={euro(p!.utile_perdita_esercizio)} rosso={p!.utile_perdita_esercizio != null && p!.utile_perdita_esercizio < 0} />
              <Voce k="Patrimonio netto" v={euro(p!.patrimonio_netto)} rosso={p!.patrimonio_netto != null && p!.patrimonio_netto < 0} />
              <Voce k="Attivo" v={euro(p!.attivo)} />
              <Voce k="Capitale sociale" v={euro(p!.capitale_sociale)} />
              <Voce k="Dipendenti" v={p!.dipendenti != null ? `${p!.dipendenti.toLocaleString("it-IT")}${p!.dipendenti_anno ? ` (${p!.dipendenti_anno})` : ""}` : null} />
            </dl>
          ) : <p className="text-sm text-muted-foreground">Bilancio non disponibile</p>}
        </Box>

        <Box titolo="Altre informazioni">
          {p || r.denominazione ? (
            <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 sm:text-sm">
              <Voce k="Gruppo" v={p?.gruppo == null ? null : p.gruppo ? `Sì${p.capogruppo?.length ? ` – capogruppo ${p.capogruppo.join(", ")}` : ""}` : "No"} />
              <Voce k="Unità locali" v={p?.unita_locali != null ? String(p.unita_locali) : null} />
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
