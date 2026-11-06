import { useState } from "react";
import type React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { provaCercaCerved, provaArchivioCerved, provaRecuperoCerved, provaDatiEstesiCerved, provaAcquistoLightReport } from "@/lib/cerved/cerved-prova.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const siNo = (v: boolean | null) => (v == null ? null : v ? "Sì" : "No");

/** Euro all'italiana senza decimali (es. 2.500.000 €). */
const euro = (n: number | null) =>
  n == null ? null : `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(n)} €`;

/** Colore della categoria del semaforo Cerved, se riconoscibile. */
function coloreSemaforo(codice: string | null): string | null {
  const c = (codice ?? "").toUpperCase();
  if (c === "V") return "bg-success text-success-foreground";
  if (c === "G") return "bg-warning text-warning-foreground";
  if (c === "R") return "bg-destructive text-destructive-foreground";
  return null;
}

function Righe({ righe }: { righe: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 pt-1">
      {righe.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "MAGENTA (MI)"; se manca uno dei due, mostra quello che c'è. */
function comuneProvincia(comune: string | null, provincia: string | null): string | null {
  if (comune && provincia) return `${comune} (${provincia})`;
  return comune || provincia || null;
}

export function ProvaCervedCard() {
  const [piva, setPiva] = useState("");
  const fn = useServerFn(provaCercaCerved);
  const m = useMutation({ mutationFn: (p: string) => fn({ data: { piva: p } }) });
  const fnArch = useServerFn(provaArchivioCerved);
  const ma = useMutation({ mutationFn: (p: string) => fnArch({ data: { piva: p } }) });
  const ra = ma.data;
  const valida = /^\d{11}$/.test(piva);
  const [reqId, setReqId] = useState("");
  const fnRec = useServerFn(provaRecuperoCerved);
  const mr = useMutation({ mutationFn: (id: string) => fnRec({ data: { request_id: id } }) });
  const rr = mr.data;
  const fnEst = useServerFn(provaDatiEstesiCerved);
  const me = useMutation({ mutationFn: (p: string) => fnEst({ data: { piva: p } }) });
  const re = me.data;
  const [pivaLr, setPivaLr] = useState("");
  const [confermaLr, setConfermaLr] = useState(false);
  const [pdfAperto, setPdfAperto] = useState(false);
  const fnLr = useServerFn(provaAcquistoLightReport);
  const ml = useMutation({ mutationFn: (p: string) => fnLr({ data: { piva: p } }) });
  const rl = ml.data;
  const httpTesto = (h: number | null | undefined, err: string | null | undefined) =>
    [h != null ? `HTTP ${h}` : null, err].filter(Boolean).join(" · ") || null;
  const r = m.data;
  const a = r?.prima ?? null;

  const stato = a
    ? a.stato_attivita_descrizione
      ? a.stato_attivita_codice
        ? `${a.stato_attivita_descrizione} (${a.stato_attivita_codice})`
        : a.stato_attivita_descrizione
      : a.stato_attivita_codice
    : null;

  const forma = a ? [a.forma_giuridica, a.classe_forma_descrizione].filter(Boolean).join(" · ") || null : null;

  const ateco = a ? [a.ateco_2025_codice, a.ateco_2025_descrizione].filter(Boolean).join(" — ") || null : null;

  const rea = a ? [a.rea, a.data_iscrizione_rea && `iscrizione ${a.data_iscrizione_rea}`].filter(Boolean).join(" · ") || null : null;

  const sede = a?.sede
    ? [a.sede.indirizzo, a.sede.cap, comuneProvincia(a.sede.comune, a.sede.provincia)]
        .filter(Boolean)
        .join(", ") || null
    : null;

  const righe: [string, string | null][] = a
    ? [
        ["ID soggetto", a.id_soggetto],
        ["Denominazione", a.denominazione],
        ["Partita IVA", a.partita_iva],
        ["Stato attività", stato],
        ["Operativa", siNo(a.operativa)],
        ["Forma giuridica", forma],
        ["ATECO 2025", ateco],
        ["REA", rea],
        ["Sede", sede],
        ["Pubblica amministrazione", siNo(a.ente_pa)],
      ]
    : [];

  const p = r?.profilo?.dati ?? null;
  const righeProfilo: [string, React.ReactNode][] = p
    ? [
        ["Telefono", p.telefono],
        ["Sito web", p.sito_web],
        ["PEC", p.pec.length ? p.pec.join(", ") : null],
        ["Costituzione", p.data_costituzione],
        ["Inizio attività", p.data_inizio_attivita],
        ["Stato attività", [p.stato_attivita_descrizione ?? p.stato_attivita_codice, p.data_stato_attivita && `dal ${p.data_stato_attivita}`].filter(Boolean).join(" ") || null],
        ["Macrosettore", p.macrosettore],
        ["Gruppo", p.gruppo == null ? null : p.gruppo ? (p.capogruppo.length ? `Sì · capogruppo: ${p.capogruppo.join(", ")}` : "Sì") : "No"],
        ["Rating legalità", p.rating_legalita ? `${p.rating_legalita}${p.rating_legalita_rinnovo ? ` (rinnovo ${p.rating_legalita_rinnovo})` : ""}` : null],
        ["Dipendenti", p.dipendenti == null ? null : `${p.dipendenti.toLocaleString("it-IT")}${p.dipendenti_anno ? ` (${p.dipendenti_anno})` : ""}`],
        ["Unità locali", p.unita_locali == null ? null : p.unita_locali.toLocaleString("it-IT")],
        ["Ultimo bilancio", p.anno_ultimo_bilancio ? `${p.anno_ultimo_bilancio}${p.data_chiusura_ultimo_bilancio ? ` (chiuso il ${p.data_chiusura_ultimo_bilancio})` : ""}` : p.data_chiusura_ultimo_bilancio],
        ["Capitale sociale", euro(p.capitale_sociale)],
        ["Fatturato", euro(p.fatturato)],
        ["MOL", euro(p.mol)],
        ["Attivo", euro(p.attivo)],
        ["Patrimonio netto", euro(p.patrimonio_netto)],
        ["Utile/perdita", p.utile_perdita_esercizio == null ? null : (
          <span className={p.utile_perdita_esercizio < 0 ? "text-destructive font-medium" : undefined}>{euro(p.utile_perdita_esercizio)}</span>
        )],
      ]
    : [];
  const scores = r?.score?.dati ?? [];

  return (
    <Card className="p-4 sm:p-5 max-w-2xl">
      <h2 className="font-semibold flex items-center gap-2 mb-3"><Search className="size-4" /> Prova Cerved</h2>
      <form
        className="flex flex-col sm:flex-row sm:items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); if (valida) m.mutate(piva); }}
      >
        <div className="flex-1 min-w-0 space-y-1">
          <Label htmlFor="cerved-piva">Partita IVA</Label>
          <Input id="cerved-piva" inputMode="numeric" maxLength={11} placeholder="11 cifre"
            value={piva} onChange={(e) => setPiva(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <Button type="submit" disabled={!valida || m.isPending} className="h-10">
            {m.isPending ? "Ricerca…" : "Prova ricerca"}
          </Button>
          <Button type="button" variant="outline" disabled={!valida || ma.isPending} className="h-10"
            onClick={() => ma.mutate(piva)}>
            {ma.isPending ? "Lettura…" : "Prova archivio"}
          </Button>
          <Button type="button" variant="outline" disabled={!valida || me.isPending} className="h-10 col-span-2 sm:col-span-1"
            onClick={() => me.mutate(piva)}>
            {me.isPending ? "Lettura…" : "Prova dati estesi"}
          </Button>
        </div>
      </form>
      <form
        className="mt-3 flex flex-col sm:flex-row sm:items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); if (reqId) mr.mutate(reqId); }}
      >
        <div className="flex-1 min-w-0 space-y-1">
          <Label htmlFor="cerved-reqid">Numero richiesta (request_id)</Label>
          <Input id="cerved-reqid" inputMode="numeric" maxLength={20} placeholder="Facoltativo"
            value={reqId} onChange={(e) => setReqId(e.target.value.replace(/\D/g, ""))} />
        </div>
        <Button type="submit" variant="outline" disabled={!reqId || mr.isPending} className="h-10">
          {mr.isPending ? "Recupero…" : "Recupera documento"}
        </Button>
      </form>
      <div className="mt-4 border-t pt-3">
        <form
          className="flex flex-col sm:flex-row sm:items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); if (/^\d{11}$/.test(pivaLr)) setConfermaLr(true); }}
        >
          <div className="flex-1 min-w-0 space-y-1">
            <Label htmlFor="cerved-piva-lr">Partita IVA per Light Report</Label>
            <Input id="cerved-piva-lr" inputMode="numeric" maxLength={11} placeholder="11 cifre"
              value={pivaLr} onChange={(e) => setPivaLr(e.target.value.replace(/\D/g, ""))} />
          </div>
          <Button type="submit" disabled={!/^\d{11}$/.test(pivaLr) || ml.isPending} className="h-10">
            {ml.isPending ? "Acquisto in corso…" : "Prova acquisto Light Report"}
          </Button>
        </form>
        {ml.isPending && <p className="mt-2 text-xs text-muted-foreground">Se Cerved prepara il report in differita, l'attesa può arrivare a circa un minuto.</p>}
        {ml.error && <p className="mt-3 text-sm text-destructive break-words">{ml.error.message}</p>}
        {rl && (
          <div className="mt-3 rounded-md border p-3 text-sm">
            <h3 className="font-medium mb-1">Light Report</h3>
            {rl.errore && <p className="text-destructive break-words">{rl.errore}</p>}
            <Righe righe={[
              ["ID soggetto", rl.id_soggetto],
              ["Acquisto", rl.acquisto ? httpTesto(rl.acquisto.http_status, rl.acquisto.errore) : null],
              ["Numero richiesta", rl.request_id],
              ["Stato consegna", rl.delivery_status],
              ["Recupero XML", rl.xml ? [httpTesto(rl.xml.http_status, rl.xml.errore), `${rl.xml.lunghezza.toLocaleString("it-IT")} caratteri`].filter(Boolean).join(" · ") : null],
              ["Recupero PDF", rl.pdf ? [httpTesto(rl.pdf.http_status, rl.pdf.errore), rl.pdf.byte ? `${rl.pdf.byte.toLocaleString("it-IT")} byte` : null].filter(Boolean).join(" · ") : null],
              ["Fido certificato", euro(rl.fido_certificato)],
              ["Data report", rl.data_report],
              ["Tag 1° livello", rl.tag_livello_1.length ? rl.tag_livello_1.join(", ") : null],
              ["Tag 2° livello", rl.tag_livello_2.length ? rl.tag_livello_2.join(", ") : null],
              ["PDF salvato", rl.percorso_pdf],
            ]} />
            {rl.url_pdf && (
              <Button type="button" variant="outline" className="mt-2 h-10" onClick={() => setPdfAperto(true)}>Apri PDF</Button>
            )}
          </div>
        )}
      </div>
      <AlertDialog open={confermaLr} onOpenChange={setConfermaLr}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Acquisto di prova con utenza di test</AlertDialogTitle>
            <AlertDialogDescription>
              Verrà acquistato il Light Report Cerved della partita IVA {pivaLr}, in XML e poi recuperato anche in PDF. Confermi?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => ml.mutate(pivaLr)}>Conferma acquisto</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={pdfAperto} onOpenChange={setPdfAperto}>
        <DialogContent className="max-w-5xl w-[calc(100vw-1rem)] h-[90vh] flex flex-col p-3 sm:p-4">
          <DialogHeader><DialogTitle>Light Report {rl?.request_id}</DialogTitle></DialogHeader>
          {rl?.url_pdf && <iframe title="Light Report PDF" src={rl.url_pdf} className="flex-1 w-full rounded border" />}
          {rl?.url_pdf && <a href={rl.url_pdf} target="_blank" rel="noreferrer" className="text-sm underline">Apri in una nuova scheda</a>}
        </DialogContent>
      </Dialog>
      {mr.error && <p className="mt-3 text-sm text-destructive break-words">{mr.error.message}</p>}
      {rr && (
        <div className="mt-3 rounded-md border p-3 text-sm">
          <h3 className="font-medium mb-1">Documento {rr.request_id}</h3>
          {rr.errore ? <p className="text-destructive break-words">{rr.errore}</p> : (
            <>
              <Righe righe={[
                ["Stato consegna", rr.delivery_status],
                ["Dettaglio stato", rr.detailed_delivery_status],
                ["Lunghezza XML", `${rr.lunghezza.toLocaleString("it-IT")} caratteri`],
              ]} />
              {rr.anteprima && (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{rr.anteprima}</pre>
              )}
            </>
          )}
        </div>
      )}
      {me.error && <p className="mt-3 text-sm text-destructive break-words">{me.error.message}</p>}
      {re && (
        <div className="mt-3 rounded-md border p-3 text-sm">
          <h3 className="font-medium mb-1">Dati estesi</h3>
          <ul className="divide-y">
            {re.passi.map((ps, i) => (
              <li key={`${ps.operazione}-${i}`} className="py-1.5">
                <div className="flex flex-wrap gap-x-2">
                  <span className="font-mono text-xs pt-0.5 break-all min-w-0">{ps.operazione}</span>
                  <span className={ps.esito === "ok" ? "text-xs" : "text-xs text-destructive"}>
                    {ps.esito === "ok" ? "OK" : "Errore"}{ps.http_status != null && ` · HTTP ${ps.http_status}`}
                  </span>
                </div>
                {ps.errore && <p className="text-xs text-destructive break-words">{ps.errore}</p>}
                {ps.riassunto.length > 0 && <p className="text-xs text-muted-foreground break-words">{ps.riassunto.join(" · ")}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {m.error && <p className="mt-3 text-sm text-destructive break-words">{m.error.message}</p>}
      {ma.error && <p className="mt-3 text-sm text-destructive break-words">{ma.error.message}</p>}
      {ra && (
        <>
          <div className="mt-3 rounded-md border p-3 text-sm">
            <h3 className="font-medium mb-1">Prodotti acquistabili</h3>
            {ra.prodotti.errore ? <p className="text-destructive break-words">{ra.prodotti.errore}</p>
              : ra.prodotti.dati.length === 0 ? <p className="text-muted-foreground">Nessun prodotto restituito.</p>
              : (
                <ul className="divide-y">
                  {ra.prodotti.dati.map((p, i) => (
                    <li key={`${p.codice}-${i}`} className="py-1.5 flex flex-wrap gap-x-2">
                      <span className="font-mono text-xs shrink-0 pt-0.5">{p.codice ?? "—"}</span>
                      <span className="min-w-0 break-words">{p.descrizione ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
          </div>
          <div className="mt-3 rounded-md border p-3 text-sm">
            <h3 className="font-medium mb-1">Report già acquistati</h3>
            {ra.archivio.errore ? <p className="text-destructive break-words">{ra.archivio.errore}</p>
              : ra.archivio.dati.length === 0 ? <p className="text-muted-foreground">Nessun report in archivio.</p>
              : (
                <ul className="divide-y">
                  {ra.archivio.dati.map((d, i) => (
                    <li key={`${d.request_id}-${i}`} className="py-2">
                      <Righe righe={[
                        ["Richiesta", d.request_id],
                        ["Prodotto", d.product_id],
                        ["Data richiesta", d.request_date],
                        ["Data consegna", d.delivery_date],
                        ["Monitoraggio fino al", d.monitoring_expiry_date ? `${d.monitoring_expiry_date}${d.expired_monitoring ? " (scaduto)" : ""}` : siNo(d.expired_monitoring) && `Scaduto: ${siNo(d.expired_monitoring)}`],
                        ["Formati", d.document_formats.length ? d.document_formats.join(", ") : null],
                        ["Utente", d.user_id],
                      ]} />
                    </li>
                  ))}
                </ul>
              )}
          </div>
          <div className="mt-3 rounded-md border p-3 text-sm">
            <h3 className="font-medium mb-1">Documento recuperato</h3>
            {!ra.documento ? <p className="text-muted-foreground">Nessun report da recuperare.</p>
              : ra.documento.errore ? <p className="text-destructive break-words">{ra.documento.errore}</p>
              : (
                <>
                  <Righe righe={[
                    ["Richiesta", ra.documento.request_id],
                    ["Stato consegna", ra.documento.delivery_status],
                    ["Lunghezza XML", `${ra.documento.lunghezza.toLocaleString("it-IT")} caratteri`],
                  ]} />
                  {ra.documento.anteprima && (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{ra.documento.anteprima}</pre>
                  )}
                </>
              )}
          </div>
        </>
      )}
      {r && (
        <div className="mt-3 rounded-md border p-3 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Esito:</span>{" "}
            <span className={r.esito === "ok" ? "font-medium" : "font-medium text-destructive"}>
              {r.esito === "ok" ? "OK" : "Errore"}
            </span>
            {r.http_status != null && <span className="text-muted-foreground"> · HTTP {r.http_status}</span>}
          </p>
          {r.errore && <p className="text-destructive break-words">{r.errore}</p>}
          {r.esito === "ok" && <p><span className="text-muted-foreground">Aziende trovate:</span> {r.numero_aziende}</p>}
          {r.cliente_trovato && <p className="text-muted-foreground">Cliente presente in anagrafica: collegato al registro.</p>}
          {righe.length > 0 && <Righe righe={righe} />}
        </div>
      )}
      {r?.profilo && (
        <div className="mt-3 rounded-md border p-3 text-sm">
          <h3 className="font-medium">Profilo</h3>
          {r.profilo.errore ? <p className="text-destructive break-words">{r.profilo.errore}</p> : <Righe righe={righeProfilo} />}
        </div>
      )}
      {r?.score && (
        <div className="mt-3 rounded-md border p-3 text-sm">
          <h3 className="font-medium mb-1">Score Cerved</h3>
          {r.score.errore ? (
            <p className="text-destructive break-words">{r.score.errore}</p>
          ) : scores.length === 0 ? (
            <p className="text-muted-foreground">Nessuno score restituito.</p>
          ) : (
            <ul className="divide-y">
              {scores.map((s, i) => {
                const sem = s.codice_score === "SEM_CGS";
                const colore = sem ? coloreSemaforo(s.categoria_codice) : null;
                const categoria = s.categoria_descrizione ?? s.categoria_codice;
                return (
                  <li key={`${s.codice_score}-${i}`} className={sem ? "py-2 font-medium" : "py-2"}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 break-words">{s.descrizione_score ?? s.codice_score ?? "—"}</span>
                      {!sem && s.valore != null && <span className="shrink-0 tabular-nums">{s.valore.toLocaleString("it-IT")}/100</span>}
                      {categoria && (colore
                        ? <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${colore}`}>{categoria}</span>
                        : <span className="shrink-0 text-muted-foreground">{categoria}</span>)}
                    </div>
                    {(() => {
                      const extra = [s.pd != null && `Prob. insolvenza ${(s.pd * 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
                        (s.trend_descrizione ?? s.trend_codice) && `Trend: ${s.trend_descrizione ?? s.trend_codice}`].filter(Boolean).join(" · ");
                      return extra ? <div className="text-xs text-muted-foreground font-normal">{extra}</div> : null;
                    })()}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
