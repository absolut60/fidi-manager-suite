import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArticoloGammaPicker, type ArticoloGammaScelto } from "@/components/preventivatore/ArticoloGammaPicker";
import { PrezziCantiereRiga, COLONNE_PREZZI_CANTIERE } from "@/components/prezzi-cantiere-riga";
import { chiavePrezziCantiere, chiaveConteggioPrezziCantiere, getCantiereListini, upsertCantiereListino, deleteCantiereListino, puoModificareCantiereDb, unitaPrezziCantiere, propostaPrezzoCantiere, type CantiereListinoRow } from "@/lib/cantiere-listini-api";
import { fetchPrezziClienteArticoli } from "@/lib/preventivi-api";
import type { CantiereRow } from "@/lib/cantieri";
import type { PrezzoClienteGamma } from "@/lib/riga-preventivo";

export function PrezziCantiereDialog({ open, onOpenChange, cantiere }: { open: boolean; onOpenChange: (v: boolean) => void; cantiere: CantiereRow }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-3 overflow-hidden rounded-none p-3 sm:h-auto sm:max-h-[92dvh] sm:w-[calc(100%-2rem)] sm:max-w-[1600px] sm:rounded-lg sm:p-4"><DialogHeader className="shrink-0 pr-8"><DialogTitle>Prezzi del cantiere</DialogTitle><DialogDescription className="break-words">{cantiere.nome}</DialogDescription></DialogHeader>{open && <ContenutoPrezziCantiere key={cantiere.id} cantiere={cantiere} />}</DialogContent></Dialog>;
}
function ContenutoPrezziCantiere({ cantiere }: { cantiere: CantiereRow }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data: rows = [], isPending, error } = useQuery({ queryKey: chiavePrezziCantiere(cantiere.id), queryFn: () => getCantiereListini(cantiere.id) });
  const { data: modificabile = false, error: permessoError } = useQuery({ queryKey: ["prezzi-cantiere-modifica", cantiere.id, cantiere.cliente_id, cantiere.lead_id, cantiere.agente_codice, cantiere.created_by], queryFn: () => puoModificareCantiereDb(cantiere), retry: false });
  const codici = rows.map(r => r.cod_gamma);
  const { data: gamma = [] } = useQuery({ queryKey: ["prezzi-cantiere-unita", cantiere.id, codici], queryFn: () => unitaPrezziCantiere(codici), enabled: !!codici.length });
  const { data: prezzi = new Map<string, PrezzoClienteGamma>() } = useQuery({ queryKey: ["prezzi-cantiere-listino", cantiere.id, codici], queryFn: async () => {
    const cached = new Map<string, PrezzoClienteGamma>();
    const mancanti: string[] = [];
    for (const cod of codici) { const p = qc.getQueryData<PrezzoClienteGamma | null>(["prezzi-cantiere-proposta", cantiere.id, cod]); if (p === undefined) mancanti.push(cod); else if (p) cached.set(cod, p); }
    if (cantiere.cliente_id && mancanti.length) {
      try { const batch = await fetchPrezziClienteArticoli(cantiere.cliente_id, mancanti); for (const cod of mancanti) { const p = batch.get(cod) ?? null; qc.setQueryData(["prezzi-cantiere-proposta", cantiere.id, cod], p); if (p) cached.set(cod, p); } } catch { for (const cod of mancanti) qc.setQueryData(["prezzi-cantiere-proposta", cantiere.id, cod], null); }
    }
    return cached;
  }, enabled: !!codici.length, retry: false });
  function focus(cod: string) { requestAnimationFrame(() => { const el = [document.getElementById(`prezzo-mobile-${cod}`), document.getElementById(`prezzo-desktop-${cod}`)].find(e => e && e.getClientRects().length); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.querySelector("input")?.focus(); }); }
  function cambiaRows(next: CantiereListinoRow[]) { qc.setQueryData(chiavePrezziCantiere(cantiere.id), next); void qc.invalidateQueries({ queryKey: chiaveConteggioPrezziCantiere(cantiere.id) }); }
  async function aggiungi(a: ArticoloGammaScelto) {
    if (!modificabile || adding) return;
    const presente = rows.find(r => r.cod_gamma === a.codice);
    if (presente) { focus(a.codice); return; }
    setAdding(true);
    try {
      let prezzo: PrezzoClienteGamma | null = null;
      if (cantiere.cliente_id) { try { prezzo = (await fetchPrezziClienteArticoli(cantiere.cliente_id, [a.codice])).get(a.codice) ?? null; } catch { /* No engine access: manual entry remains available. */ } }
      qc.setQueryData(["prezzi-cantiere-proposta", cantiere.id, a.codice], prezzo);
      const proposta = propostaPrezzoCantiere(prezzo);
      const r = await upsertCantiereListino({ cantiere_id: cantiere.id, cod_gamma: a.codice, descrizione: a.descrizione, prezzo_vendita_speciale: proposta.prezzo_vendita_speciale, sconti: proposta.sconti, maggiorazione_perc: proposta.maggiorazione_perc, costo_netto_speciale: null, um_scelta: "um1", note: null });
      cambiaRows([...rows, r]); focus(a.codice);
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === "23505") { await qc.invalidateQueries({ queryKey: chiavePrezziCantiere(cantiere.id) }); focus(a.codice); }
      else toast.error(e instanceof Error ? e.message : "Inserimento non riuscito");
    } finally { setAdding(false); }
  }
  async function salva(r: CantiereListinoRow) {
    const saved = await upsertCantiereListino({ id: r.id, cantiere_id: r.cantiere_id, cod_gamma: r.cod_gamma, descrizione: r.descrizione, prezzo_vendita_speciale: r.prezzo_vendita_speciale, sconti: r.sconti, maggiorazione_perc: r.maggiorazione_perc, costo_netto_speciale: r.costo_netto_speciale, um_scelta: r.um_scelta, note: r.note });
    qc.setQueryData<CantiereListinoRow[]>(chiavePrezziCantiere(cantiere.id), old => old?.map(x => x.id === saved.id ? saved : x));
  }
  async function elimina(r: CantiereListinoRow) {
    const e = await deleteCantiereListino(r.id);
    if (e.tipo !== "eliminato") { toast.error(e.tipo === "permessi" ? "Non hai i permessi per eliminare questo prezzo." : e.tipo === "errore" ? `Eliminazione non riuscita: ${e.messaggio}` : "Il prezzo è collegato e non si può eliminare."); return; }
    cambiaRows((qc.getQueryData<CantiereListinoRow[]>(chiavePrezziCantiere(cantiere.id)) ?? []).filter(x => x.id !== r.id)); toast.success("Prezzo eliminato");
  }
  const riga = (r: CantiereListinoRow, scheda: boolean) => { const a = gamma.find(x => x.codice === r.cod_gamma); const p = propostaPrezzoCantiere(prezzi.get(r.cod_gamma)); return <PrezziCantiereRiga key={r.id} row={r} gamma={a} listino={p.listino_cliente} costoUltimo={a?.costo_ultimo ?? p.costo_ultimo} modificabile={modificabile} scheda={scheda} onSalva={salva} onElimina={() => elimina(r)} />; };
  return <>{modificabile && <div className="w-full shrink-0 sm:max-w-md"><ArticoloGammaPicker preventivoId={`cantiere:${cantiere.id}`} codice={null} descrizione={null} onChange={a => void aggiungi(a)} disabled={adding} />{adding && <p role="status" className="text-xs">Inserimento…</p>}</div>}{permessoError && <p role="alert" className="text-xs text-destructive">Verifica dei permessi non riuscita: prezzi in sola lettura.</p>}{error ? <p role="alert" className="text-destructive">Caricamento prezzi non riuscito.</p> : isPending ? <p role="status">Caricamento…</p> : rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nessun prezzo del cantiere</p> : <div className="min-h-0 flex-1 overflow-y-auto"><div className="space-y-3 sm:hidden">{rows.map(r => riga(r, true))}</div><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[900px] table-fixed text-xs"><colgroup>{[8,15,5,8,9,7,6,8,8,8,12,6].map((w,i) => <col key={i} width={`${w}%`} />)}</colgroup><thead className="sticky top-0 bg-card"><tr className="border-b">{COLONNE_PREZZI_CANTIERE.map((s,i) => <th key={i} className="break-words px-1 py-2 text-left font-medium">{s}</th>)}</tr></thead><tbody>{rows.map(r => riga(r, false))}</tbody></table></div></div>}</>;
}