import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import { AllegatiSection } from "@/components/allegati-section";
import { elencoAttivitaFornitore, creaAttivitaFornitore, aggiornaAttivitaFornitore, eliminaAttivitaFornitore, type AttivitaFornitore } from "@/lib/attivita-fornitore.functions";
import { TIPI_ATTIVITA_FORNITORE, TIPO_ATTIVITA_FORNITORE, tipoAttivita, dataLocaleInput, type TipoAttivitaFornitore } from "@/lib/attivita-fornitore";
import { ErroreFornitori } from "./controlli-fornitori";

export const dataOraIt = (v: string) => new Date(v).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const PAGINA = 50;
export const chiaveAttivita = (id: string) => ["attivita-fornitore", id] as const;

export function AttivitaFornitoreTab({ fornitoreId, puoScrivere }: { fornitoreId: string; puoScrivere: boolean }) {
  const [tipi, setTipi] = useState<string[]>([]);
  const carica = useServerFn(elencoAttivitaFornitore);
  const qc = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: [...chiaveAttivita(fornitoreId), tipi],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => carica({ data: { fornitoreId, tipi: tipi as TipoAttivitaFornitore[], limite: PAGINA, offset: pageParam } }),
    getNextPageParam: (last, pages) => { const n = pages.reduce((s, p) => s + p.rows.length, 0); return n < last.total ? n : undefined; },
  });
  const [modulo, setModulo] = useState<{ attivita: AttivitaFornitore | null } | null>(null);
  const [daEliminare, setDaEliminare] = useState<AttivitaFornitore | null>(null);
  const elimina = useServerFn(eliminaAttivitaFornitore);
  const mElimina = useMutation({
    mutationFn: (id: string) => elimina({ data: { id } }),
    onSuccess: () => { toast.success("Attività eliminata"); void qc.invalidateQueries({ queryKey: chiaveAttivita(fornitoreId) }); setDaEliminare(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const righe = query.data?.pages.flatMap(p => p.rows) ?? [];
  const totale = query.data?.pages[0]?.total ?? 0;
  return <div className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1 text-xs text-muted-foreground sm:w-64"><span>Tipo</span><FiltroMultiplo etichetta="Tipo" testoTutti="Tutti i tipi" opzioni={TIPI_ATTIVITA_FORNITORE.map(t => ({ valore: t, label: TIPO_ATTIVITA_FORNITORE[t].label }))} selezionati={tipi} onChange={setTipi} className="min-h-10 w-full text-foreground" /></div>
      {puoScrivere && <Button className="min-h-10" onClick={() => setModulo({ attivita: null })}><Plus className="size-4" />Registra attività</Button>}
    </div>
    {query.isPending ? <p role="status" className="py-6 text-muted-foreground">Caricamento attività…</p>
      : query.error ? <ErroreFornitori error={query.error} riprova={() => void query.refetch()} />
      : !righe.length ? <p className="py-6 text-muted-foreground">{tipi.length ? "Nessuna attività di questo tipo." : "Nessuna attività registrata per questo fornitore."}</p>
      : <>
        <p className="text-xs text-muted-foreground tabular-nums">{totale.toLocaleString("it-IT", { useGrouping: true })} attività</p>
        <ol className="space-y-2">{righe.map(a => <RigaAttivita key={a.id} a={a} puoScrivere={puoScrivere} modifica={() => setModulo({ attivita: a })} elimina={() => setDaEliminare(a)} />)}</ol>
        {query.hasNextPage && <Button variant="outline" className="min-h-10 w-full sm:w-auto" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Caricamento…" : "Mostra altri"}</Button>}
      </>}
    {modulo && <ModuloAttivita fornitoreId={fornitoreId} iniziale={modulo.attivita} chiudi={() => setModulo(null)} />}
    <AlertDialog open={!!daEliminare} onOpenChange={o => { if (!o) setDaEliminare(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare questa attività?</AlertDialogTitle><AlertDialogDescription>L’attività verrà eliminata definitivamente. Gli allegati collegati vanno eliminati a parte.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction disabled={mElimina.isPending} onClick={e => { e.preventDefault(); if (daEliminare) mElimina.mutate(daEliminare.id); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function RigaAttivita({ a, puoScrivere, modifica, elimina }: { a: AttivitaFornitore; puoScrivere: boolean; modifica: () => void; elimina: () => void }) {
  const t = tipoAttivita(a.tipo);
  const Icona = t.icona;
  const [aperto, setAperto] = useState(false);
  const lungo = (a.corpo?.length ?? 0) > 220;
  return <li><Card className="flex min-w-0 gap-3 p-3">
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${t.classe}`} aria-hidden><Icona className="size-4" /></span>
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{t.label}</span><span className="tabular-nums">{dataOraIt(a.data_attivita)}</span>{a.operatore && <span>· {a.operatore}</span>}
        {a.origine === "invio" && <Badge variant="outline" className={a.stato === "errore" ? "border-destructive/30 bg-destructive/10 text-destructive" : a.stato === "inviata" ? "border-success/30 bg-success/10 text-success" : ""}>{a.stato === "errore" ? "Errore invio" : a.stato === "inviata" ? "Inviata" : "In invio"}</Badge>}
        {a.n_allegati > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="size-3" />{a.n_allegati}</span>}
      </div>
      {a.oggetto && <p className="break-words text-sm font-medium">{a.oggetto}</p>}
      {a.origine === "invio" && a.destinatari?.length ? <p className="break-all text-xs text-muted-foreground">A: {a.destinatari.join(", ")}</p> : null}
      {a.corpo && <p className={`whitespace-pre-line break-words text-sm ${lungo && !aperto ? "line-clamp-3" : ""}`}>{a.corpo}</p>}
      {lungo && <button type="button" className="min-h-8 text-xs text-primary hover:underline" onClick={() => setAperto(v => !v)}>{aperto ? "Mostra meno" : "Mostra tutto"}</button>}
      {a.esito && <p className="break-words text-xs"><span className="font-medium text-muted-foreground">Esito: </span>{a.esito}</p>}
      {a.errore && <p className="break-words text-xs text-destructive">{a.errore}</p>}
    </div>
    {puoScrivere && a.origine === "manuale" && <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
      <Button variant="ghost" size="icon" className="size-9" aria-label="Modifica attività" onClick={modifica}><Pencil className="size-4" /></Button>
      <Button variant="ghost" size="icon" className="size-9 text-destructive" aria-label="Elimina attività" onClick={elimina}><Trash2 className="size-4" /></Button>
    </div>}
  </Card></li>;
}

function ModuloAttivita({ fornitoreId, iniziale, chiudi }: { fornitoreId: string; iniziale: AttivitaFornitore | null; chiudi: () => void }) {
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(iniziale?.id ?? null);
  const [tipo, setTipo] = useState<TipoAttivitaFornitore>((iniziale ? tipoAttivitaChiave(iniziale.tipo) : "telefonata"));
  const [data, setData] = useState(dataLocaleInput(iniziale ? new Date(iniziale.data_attivita) : new Date()));
  const [oggetto, setOggetto] = useState(iniziale?.oggetto ?? "");
  const [corpo, setCorpo] = useState(iniziale?.corpo ?? "");
  const [esito, setEsito] = useState(iniziale?.esito ?? "");
  const crea = useServerFn(creaAttivitaFornitore);
  const aggiorna = useServerFn(aggiornaAttivitaFornitore);
  const salva = useMutation({
    mutationFn: async () => {
      const d = new Date(data);
      if (Number.isNaN(d.getTime())) throw new Error("Data e ora non valide");
      const campi = { tipo, dataAttivita: d.toISOString(), oggetto, corpo, esito };
      if (id) { await aggiorna({ data: { id, ...campi } }); return id; }
      return (await crea({ data: { fornitoreId, ...campi } })).id;
    },
    onSuccess: nuovo => {
      void qc.invalidateQueries({ queryKey: chiaveAttivita(fornitoreId) });
      if (!id) { setId(nuovo); toast.success("Attività registrata: ora puoi aggiungere gli allegati"); }
      else { toast.success("Attività salvata"); chiudi(); }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Dialog open onOpenChange={o => { if (!o) { void qc.invalidateQueries({ queryKey: chiaveAttivita(fornitoreId) }); chiudi(); } }}>
    <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-3 overflow-y-auto rounded-none sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-lg">
      <DialogHeader><DialogTitle>{iniziale ? "Modifica attività" : id ? "Attività registrata" : "Registra attività"}</DialogTitle><DialogDescription>Telefonate, incontri e note restano nello storico del fornitore.</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); salva.mutate(); }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="att-tipo">Tipo</Label><Select value={tipo} onValueChange={v => setTipo(v as TipoAttivitaFornitore)}><SelectTrigger id="att-tipo" className="min-h-10"><SelectValue /></SelectTrigger><SelectContent>{TIPI_ATTIVITA_FORNITORE.map(t => <SelectItem key={t} value={t}>{TIPO_ATTIVITA_FORNITORE[t].label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label htmlFor="att-data">Data e ora</Label><Input id="att-data" type="datetime-local" required className="min-h-10" value={data} onChange={e => setData(e.target.value)} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="att-oggetto">Oggetto</Label><Input id="att-oggetto" maxLength={300} className="min-h-10" value={oggetto} onChange={e => setOggetto(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="att-corpo">Note</Label><Textarea id="att-corpo" maxLength={8000} rows={5} value={corpo} onChange={e => setCorpo(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="att-esito">Esito</Label><Input id="att-esito" maxLength={1000} className="min-h-10" value={esito} onChange={e => setEsito(e.target.value)} /></div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" className="min-h-10" onClick={chiudi}>{id && !iniziale ? "Chiudi" : "Annulla"}</Button><Button type="submit" className="min-h-10" disabled={salva.isPending}>{salva.isPending ? "Salvataggio…" : "Salva"}</Button></div>
      </form>
      {id ? <div className="border-t pt-3"><AllegatiSection entitaTipo="attivita_fornitore" entitaId={id} clienteId={null} canEdit eliminaTutti compact /></div>
        : <p className="text-xs text-muted-foreground">Gli allegati si aggiungono subito dopo il primo salvataggio.</p>}
      <DialogFooter className="hidden" />
    </DialogContent>
  </Dialog>;
}
function tipoAttivitaChiave(v: string): TipoAttivitaFornitore {
  return (TIPI_ATTIVITA_FORNITORE as readonly string[]).includes(v) ? v as TipoAttivitaFornitore : "altro";
}

/** Card "Ultima attività" del Riepilogo: stessa query dell'elenco con limite 1. */
export function useUltimaAttivita(fornitoreId: string) {
  const carica = useServerFn(elencoAttivitaFornitore);
  return useInfiniteQuery({ queryKey: [...chiaveAttivita(fornitoreId), "ultima"], initialPageParam: 0, queryFn: () => carica({ data: { fornitoreId, limite: 1, offset: 0 } }), getNextPageParam: () => undefined });
}
