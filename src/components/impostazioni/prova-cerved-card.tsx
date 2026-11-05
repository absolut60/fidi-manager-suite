import { useState } from "react";
import type React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { formattaDataCerved as dc } from "@/lib/cerved/cerved.server";
import { provaCercaCerved } from "@/lib/cerved/cerved-prova.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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
  const valida = /^\d{11}$/.test(piva);
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

  const rea = a ? [a.rea, a.data_iscrizione_rea && `iscrizione ${dc(a.data_iscrizione_rea)}`].filter(Boolean).join(" · ") || null : null;

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
        ["Costituzione", dc(p.data_costituzione)],
        ["Inizio attività", dc(p.data_inizio_attivita)],
        ["Stato attività", [p.stato_attivita_descrizione ?? p.stato_attivita_codice, p.data_stato_attivita && `dal ${dc(p.data_stato_attivita)}`].filter(Boolean).join(" ") || null],
        ["Macrosettore", p.macrosettore],
        ["Gruppo", p.gruppo == null ? null : p.gruppo ? (p.capogruppo.length ? `Sì · capogruppo: ${p.capogruppo.join(", ")}` : "Sì") : "No"],
        ["Rating legalità", p.rating_legalita ? `${p.rating_legalita}${p.rating_legalita_rinnovo ? ` (rinnovo ${dc(p.rating_legalita_rinnovo)})` : ""}` : null],
        ["Dipendenti", p.dipendenti == null ? null : `${p.dipendenti.toLocaleString("it-IT")}${p.dipendenti_anno ? ` (${p.dipendenti_anno})` : ""}`],
        ["Unità locali", p.unita_locali == null ? null : p.unita_locali.toLocaleString("it-IT")],
        ["Ultimo bilancio", p.anno_ultimo_bilancio ? `${p.anno_ultimo_bilancio}${p.data_chiusura_ultimo_bilancio ? ` (chiuso il ${dc(p.data_chiusura_ultimo_bilancio)})` : ""}` : dc(p.data_chiusura_ultimo_bilancio)],
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
        <Button type="submit" disabled={!valida || m.isPending} className="h-10">
          {m.isPending ? "Ricerca in corso…" : "Prova ricerca"}
        </Button>
      </form>
      {m.error && <p className="mt-3 text-sm text-destructive break-words">{m.error.message}</p>}
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
