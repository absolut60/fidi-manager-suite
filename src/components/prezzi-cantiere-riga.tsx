import { useEffect, useRef, useLayoutEffect, useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CellaUm } from "@/components/cella-um";
import { RiquadroAnagrafica } from "@/components/ui/riquadro-anagrafica";
import { BottoneElimina } from "@/components/conferma-eliminazione";
import { formatNumeroIt, parseNumeroIt } from "@/lib/numero-it";
import { formatScontiGamma, parseScontiGamma, rigaInUnita, type UnitaGammaRiga } from "@/lib/riga-preventivo";
import type { CantiereListinoRow } from "@/lib/cantiere-listini-api";

export const COLONNE_PREZZI_CANTIERE = ["Codice", "Descrizione", "UM", "Listino cliente", "Prezzo cantiere", "Sconti", "Magg. %", "Netto cantiere", "Costo ultimo", "Costo speciale", "Note", ""];
const fmt = (n: number | null | undefined) => n == null ? "—" : formatNumeroIt(n, { minDecimals: 4, maxDecimals: 4 });
export function PrezziCantiereRiga({ row, gamma, listino, costoUltimo, modificabile, scheda, onSalva, onElimina }: {
  row: CantiereListinoRow; gamma?: UnitaGammaRiga | null; listino: number | null; costoUltimo: number | null;
  modificabile: boolean; scheda: boolean; onSalva: (r: CantiereListinoRow) => Promise<void>; onElimina: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(row);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  useEffect(() => { setDraft(row); }, [row]);
  const inputRiga = { quantita: 1, prezzo_unit: draft.prezzo_vendita_speciale, sconti_gamma: draft.sconti, maggiorazione_perc: draft.maggiorazione_perc, costo: draft.costo_netto_speciale, um_scelta: draft.um_scelta };
  const vista = rigaInUnita(inputRiga, gamma);
  const listinoVista = rigaInUnita({ ...inputRiga, prezzo_unit: listino, sconti_gamma: [], maggiorazione_perc: 0, costo: costoUltimo }, gamma);
  async function salva(patch: Partial<CantiereListinoRow> = {}) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!modificabile || busy) return;
    setBusy(true); setErrore(null);
    try { await onSalva(next); }
    catch (e) { const text = e instanceof Error ? e.message : "Salvataggio non riuscito"; setErrore(text); toast.error(text); }
    finally { setBusy(false); }
  }
  const testo = (campo: "descrizione" | "note", label: string) => modificabile
    ? campo === "descrizione"
      ? <Input aria-label={`${label} ${row.cod_gamma}`} disabled={busy} value={draft.descrizione ?? ""} className="h-11 min-w-0 rounded border-transparent px-1.5 py-1 text-xs shadow-none hover:border-input focus:border-ring sm:h-[26px] md:text-xs" onChange={e => setDraft({ ...draft, descrizione: e.target.value })} onBlur={() => { if (draft.descrizione !== row.descrizione) void salva(); }} />
      : <NoteAutoAltezza label={`${label} ${row.cod_gamma}`} disabled={busy} value={draft.note ?? ""} onChange={note => setDraft({ ...draft, note })} onBlur={() => { if (draft.note !== row.note) void salva(); }} />
    : <span className="break-words">{draft[campo] || "—"}</span>;
  const numero = (campo: "prezzo_vendita_speciale" | "costo_netto_speciale" | "maggiorazione_perc", label: string, valore: number | null) => modificabile
    ? <Input key={`${campo}-${valore}-${draft.um_scelta}`} aria-label={`${label} ${row.cod_gamma}`} disabled={busy} inputMode="decimal" defaultValue={valore == null ? "" : formatNumeroIt(valore, { minDecimals: 4 })} className={`h-11 min-w-0 rounded border-transparent px-1 py-1 text-right font-mono text-xs shadow-none hover:border-input focus:border-ring sm:h-[26px] md:text-xs ${campo !== "maggiorazione_perc" ? "font-bold" : ""}`} onBlur={e => {
      const n = parseNumeroIt(e.target.value);
      if (e.target.value.trim() && n == null) { toast.error("Inserisci un numero valido"); return; }
      if (n === valore || (n == null && valore == null)) return;
      if (campo === "maggiorazione_perc") void salva({ maggiorazione_perc: n ?? 0 });
      else { const p = rigaInUnita(inputRiga, gamma, campo === "prezzo_vendita_speciale" ? { prezzo_unit: n } : { costo_unit: n }).patchUm1; void salva({ [campo]: campo === "prezzo_vendita_speciale" ? p.prezzo_unit ?? null : p.costo ?? null }); }
    }} />
    : <span className={`font-mono ${campo !== "maggiorazione_perc" ? "font-bold" : ""}`}>{fmt(valore)}</span>;
  const cells: ReactNode[] = [
    <span className="break-all font-mono" key="codice">{row.cod_gamma}</span>, testo("descrizione", "Descrizione"),
    <CellaUm etichetta={`Unità ${row.cod_gamma}`} um1={vista.um1 ?? vista.um ?? "—"} um2={vista.convertibile ? vista.um2 ?? null : null} fattore={gamma?.fattore_conversione ?? null} secondaria={!!vista.secondaria} disabled={!modificabile || busy} onChange={um_scelta => void salva({ um_scelta })} />,
    <span className="font-mono">{fmt(listinoVista.prezzo_unit)}</span>, numero("prezzo_vendita_speciale", "Prezzo cantiere", vista.prezzo_unit),
    modificabile ? <Input key={formatScontiGamma(draft.sconti)} aria-label={`Sconti ${row.cod_gamma}`} disabled={busy} defaultValue={formatScontiGamma(draft.sconti)} className="h-11 min-w-0 rounded border-transparent px-1 py-1 font-mono text-xs shadow-none hover:border-input focus:border-ring sm:h-[26px] md:text-xs" onBlur={e => { const s = parseScontiGamma(e.target.value); if (!s) { toast.error("Sconti non validi: massimo 6, nel formato 17+5"); e.target.value = formatScontiGamma(draft.sconti); return; } if (JSON.stringify(s) !== JSON.stringify(draft.sconti)) void salva({ sconti: s }); }} /> : <span className="font-mono">{formatScontiGamma(draft.sconti) || "—"}</span>,
    numero("maggiorazione_perc", "Maggiorazione", draft.maggiorazione_perc),
    <span className={`font-mono font-semibold ${listino != null && draft.prezzo_vendita_speciale != null && vista.netto != null ? (vista.netto < (listinoVista.prezzo_unit ?? 0) ? "text-pv-verde" : vista.netto > (listinoVista.prezzo_unit ?? 0) ? "text-destructive" : "") : ""}`}>{draft.prezzo_vendita_speciale == null ? "—" : fmt(vista.netto)}</span>,
    <span className="font-mono">{fmt(listinoVista.costo_unit)}</span>, numero("costo_netto_speciale", "Costo speciale", vista.costo_unit), testo("note", "Note"),
    modificabile ? <div className="flex flex-wrap justify-end gap-1">{errore && <Button variant="ghost" size="icon" aria-label={`Riprova salvataggio ${row.cod_gamma}`} title="Riprova salvataggio" disabled={busy} onClick={() => void salva()}><Save className="size-4" /></Button>}<BottoneElimina etichetta="" titolo="Eliminare questo prezzo?" descrizione={row.cod_gamma} onConferma={onElimina} className="h-10 w-10 p-0 sm:h-[26px] sm:w-[26px]" /></div> : null,
  ];
  if (scheda) return <RiquadroAnagrafica tono="azzurro" id={`prezzo-mobile-${row.cod_gamma}`} className="p-3 text-xs"><div className="grid grid-cols-1 gap-2">{cells.map((cell, i) => <div key={i} className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] items-center gap-2"><span className="text-muted-foreground">{COLONNE_PREZZI_CANTIERE[i]}</span><div className="min-w-0">{cell}</div></div>)}</div>{busy && <p role="status" className="mt-2">Salvataggio…</p>}{errore && <p role="alert" className="mt-2 break-words text-destructive">{errore}</p>}</RiquadroAnagrafica>;
  return <tr id={`prezzo-desktop-${row.cod_gamma}`} className="border-b bg-card align-top text-xs">{cells.map((cell, i) => <td key={i} className="min-w-0 px-1 py-1">{cell}{i === 1 && errore && <p role="alert" className="break-words text-destructive">{errore}</p>}{i === 1 && busy && <span role="status">Salvataggio…</span>}</td>)}</tr>;
}
function NoteAutoAltezza({ value, label, disabled, onChange, onBlur }: { value: string; label: string; disabled: boolean; onChange: (v: string) => void; onBlur: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const aggiorna = () => { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; };
    aggiorna();
    let larghezza = el.clientWidth;
    const observer = new ResizeObserver(() => { if (el.clientWidth !== larghezza) { larghezza = el.clientWidth; aggiorna(); } });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);
  return <Textarea ref={ref} aria-label={label} rows={1} disabled={disabled} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} className="min-h-11 min-w-0 resize-none overflow-hidden rounded border-transparent px-1.5 py-1 text-xs leading-4 shadow-none hover:border-input focus:border-ring sm:min-h-[26px] md:text-xs" />;
}
