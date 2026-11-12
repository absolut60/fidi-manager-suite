import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
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

export type PersonaAttivita = { id: string; nome: string | null; cognome: string | null; ruolo?: string | null };
const nomePersona = (c: PersonaAttivita) => [c.nome, c.cognome].map(v => v?.trim()).filter(Boolean).join(" ") || "Contatto";
export function AttivitaFornitoreTab({ fornitoreId, puoScrivere, contatti = [] }: { fornitoreId: string; puoScrivere: boolean; contatti?: PersonaAttivita[] }) {
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
        <ol className="space-y-2">{righe.map(a => <RigaAttivita key={a.id} a={a} conChi={conChi(contatti, a.contatto_id)} apri={() => setModulo({ attivita: a })} />)}</ol>
        {query.hasNextPage && <Button variant="outline" className="min-h-10 w-full sm:w-auto" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Caricamento…" : "Mostra altri"}</Button>}
      </>}
    {modulo && <ModuloAttivita contatti={contatti} fornitoreId={fornitoreId} puoScrivere={puoScrivere} iniziale={modulo.attivita} solaLettura={!puoScrivere || modulo.attivita?.origine === "invio"} chiudi={() => setModulo(null)} />}
  </div>;
}

function conChi(contatti: PersonaAttivita[], id: string | null | undefined): string | null {
  if (!id) return null;
  const c = contatti.find(x => x.id === id);
  return c ? nomePersona(c) : null;
}
function RigaAttivita({ a, apri, conChi: chi }: { a: AttivitaFornitore; apri: () => void; conChi: string | null }) {
  const t = tipoAttivita(a.tipo);
  const Icona = t.icona;
  return <li><Card role="button" tabIndex={0} aria-label={`Apri attività: ${t.label} del ${dataOraIt(a.data_attivita)}`} onClick={apri} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apri(); } }}
    className="flex min-w-0 cursor-pointer gap-3 p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${t.classe}`} aria-hidden><Icona className="size-4" /></span>
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{t.label}</span><span className="tabular-nums">{dataOraIt(a.data_attivita)}</span>{a.operatore && <span>· {a.operatore}</span>}{chi && <span>· con {chi}</span>}
        {a.origine === "invio" && <BadgeStato a={a} />}
        {a.n_allegati > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="size-3" />{a.n_allegati}</span>}
      </div>
      {a.oggetto && <p className="break-words text-sm font-medium">{a.oggetto}</p>}
      {a.origine === "invio" && a.destinatari?.length ? <p className="break-all text-xs text-muted-foreground">A: {a.destinatari.join(", ")}</p> : null}
      {a.corpo && <p className="line-clamp-3 whitespace-pre-line break-words text-sm">{a.corpo}</p>}
      {a.esito && <p className="break-words text-xs"><span className="font-medium text-muted-foreground">Esito: </span>{a.esito}</p>}
      {a.errore && <p className="line-clamp-2 break-words text-xs text-destructive">{a.errore}</p>}
    </div>
  </Card></li>;
}
function BadgeStato({ a }: { a: AttivitaFornitore }) {
  return <Badge variant="outline" className={a.stato === "errore" ? "border-destructive/30 bg-destructive/10 text-destructive" : a.stato === "inviata" ? "border-success/30 bg-success/10 text-success" : ""}>{a.stato === "errore" ? "Errore invio" : a.stato === "inviata" ? "Inviata" : "In invio"}</Badge>;
}
function Voce({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-1 gap-0.5 border-b py-2 last:border-0 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3"><dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt><dd className="min-w-0 break-words text-sm">{children}</dd></div>;
}
function elenco(v: unknown): string[] { return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []; }

/** HTML già sanificato dal server: ripassa comunque da DOMPurify nel browser. */
function CorpoHtml({ html }: { html: string }) {
  const pulito = DOMPurify.sanitize(html, { ALLOWED_TAGS: ["p", "br", "div", "span", "b", "strong", "i", "em", "u", "ul", "ol", "li", "a", "font"], ALLOWED_ATTR: ["href", "target", "rel", "style", "face", "size", "color"], ALLOWED_URI_REGEXP: /^(https?:|mailto:)/i });
  return <div className="max-w-none break-words text-sm [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: pulito }} />;
}

function DettaglioAttivita({ a, fornitoreId, puoEliminare, chiudi, contatti }: { a: AttivitaFornitore; fornitoreId: string; puoEliminare: boolean; chiudi: () => void; contatti: PersonaAttivita[] }) {
  const chi = conChi(contatti, a.contatto_id);
  const qc = useQueryClient();
  const [conferma, setConferma] = useState(false);
  const elimina = useServerFn(eliminaAttivitaFornitore);
  const mElimina = useMutation({
    mutationFn: () => elimina({ data: { id: a.id } }),
    onSuccess: () => { toast.success("Registrazione eliminata dalle Attività"); void qc.invalidateQueries({ queryKey: chiaveAttivita(fornitoreId) }); setConferma(false); chiudi(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const t = tipoAttivita(a.tipo);
  const x = a as AttivitaFornitore & { cc?: unknown; ccn?: unknown };
  const cc = elenco(x.cc), ccn = elenco(x.ccn), dest = elenco(a.destinatari);
  return <Dialog open onOpenChange={o => { if (!o) chiudi(); }}>
    <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-3 overflow-y-auto rounded-none sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-lg">
      <DialogHeader><DialogTitle className="break-words pr-6">{a.oggetto || t.label}</DialogTitle><DialogDescription>{a.origine === "invio" ? "Comunicazione inviata: non modificabile." : "Dettaglio attività (sola lettura)."}</DialogDescription></DialogHeader>
      <dl>
        <Voce label="Tipo">{t.label}</Voce>
        <Voce label="Data e ora"><span className="tabular-nums">{dataOraIt(a.data_attivita)}</span></Voce>
        {a.operatore && <Voce label="Operatore">{a.operatore}</Voce>}
        {chi && <Voce label="Con chi">{chi}</Voce>}
        {a.origine === "invio" && <Voce label="Stato"><BadgeStato a={a} /></Voce>}
        {a.origine === "invio" && <Voce label="Destinatari"><span className="break-all">{dest.length ? dest.join(", ") : "—"}</span></Voce>}
        {a.origine === "invio" && <Voce label="CC"><span className="break-all">{cc.length ? cc.join(", ") : "—"}</span></Voce>}
        {a.origine === "invio" && <Voce label="CCN"><span className="break-all">{ccn.length ? ccn.join(", ") : "—"}</span></Voce>}
        {a.errore && <Voce label="Errore"><span className="text-destructive">{a.errore}</span></Voce>}
        {a.oggetto && <Voce label="Oggetto">{a.oggetto}</Voce>}
        <Voce label={a.origine === "invio" ? "Testo" : "Note"}>{a.corpo_html ? <CorpoHtml html={a.corpo_html} /> : <span className="whitespace-pre-line">{a.corpo || "—"}</span>}</Voce>
        {a.esito && <Voce label="Esito">{a.esito}</Voce>}
      </dl>
      <div className="border-t pt-3"><AllegatiSection entitaTipo="attivita_fornitore" entitaId={a.id} clienteId={null} canEdit={false} compact /></div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {puoEliminare && <Button type="button" variant="outline" className="min-h-10 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConferma(true)}><Trash2 className="size-4" />Elimina</Button>}
        <Button type="button" variant="outline" className="min-h-10 w-full sm:ml-auto sm:w-auto" onClick={chiudi}>Chiudi</Button>
      </div>
      <AlertDialog open={conferma} onOpenChange={setConferma}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare la registrazione?</AlertDialogTitle><AlertDialogDescription>{a.origine === "invio" ? "L'email è già stata inviata: elimini solo la registrazione nelle Attività. Continuare?" : "L’attività e i suoi allegati verranno eliminati definitivamente."}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction disabled={mElimina.isPending} onClick={e => { e.preventDefault(); mElimina.mutate(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  </Dialog>;
}

function ModuloAttivita({ puoScrivere, ...props }: { fornitoreId: string; puoScrivere: boolean; iniziale: AttivitaFornitore | null; solaLettura?: boolean; chiudi: () => void; contatti: PersonaAttivita[] }) {
  if (props.solaLettura && props.iniziale) return <DettaglioAttivita a={props.iniziale} fornitoreId={props.fornitoreId} puoEliminare={puoScrivere} chiudi={props.chiudi} contatti={props.contatti} />;
  return <ModuloModifica {...props} />;
}
const NESSUNO = "__nessuno__";
function ModuloModifica({ fornitoreId, iniziale, chiudi, contatti }: { fornitoreId: string; iniziale: AttivitaFornitore | null; chiudi: () => void; contatti: PersonaAttivita[] }) {
  const qc = useQueryClient();
  const [conferma, setConferma] = useState(false);
  const elimina = useServerFn(eliminaAttivitaFornitore);
  const mElimina = useMutation({
    mutationFn: (idAtt: string) => elimina({ data: { id: idAtt } }),
    onSuccess: () => { toast.success("Attività eliminata"); void qc.invalidateQueries({ queryKey: chiaveAttivita(fornitoreId) }); setConferma(false); chiudi(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const [id, setId] = useState<string | null>(iniziale?.id ?? null);
  const [tipo, setTipo] = useState<TipoAttivitaFornitore>((iniziale ? tipoAttivitaChiave(iniziale.tipo) : "telefonata"));
  const [data, setData] = useState(dataLocaleInput(iniziale ? new Date(iniziale.data_attivita) : new Date()));
  const [oggetto, setOggetto] = useState(iniziale?.oggetto ?? "");
  const [corpo, setCorpo] = useState(iniziale?.corpo ?? "");
  const [esito, setEsito] = useState(iniziale?.esito ?? "");
  const [contattoId, setContattoId] = useState<string>(iniziale?.contatto_id ?? NESSUNO);
  const crea = useServerFn(creaAttivitaFornitore);
  const aggiorna = useServerFn(aggiornaAttivitaFornitore);
  const salva = useMutation({
    mutationFn: async () => {
      const d = new Date(data);
      if (Number.isNaN(d.getTime())) throw new Error("Data e ora non valide");
      const campi = { tipo, dataAttivita: d.toISOString(), oggetto, corpo, esito, contattoId: contattoId === NESSUNO ? null : contattoId };
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
        {(contatti.length > 0 || iniziale?.contatto_id) && <div className="space-y-1"><Label htmlFor="att-conchi">Con chi <span className="font-normal text-muted-foreground">(facoltativo)</span></Label><Select value={contattoId} onValueChange={setContattoId}><SelectTrigger id="att-conchi" className="min-h-10"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NESSUNO}>Nessuno</SelectItem>{contatti.map(c => <SelectItem key={c.id} value={c.id}>{nomePersona(c)}{c.ruolo ? ` · ${c.ruolo}` : ""}</SelectItem>)}{iniziale?.contatto_id && !contatti.some(c => c.id === iniziale.contatto_id) && <SelectItem value={iniziale.contatto_id}>Contatto non più collegato</SelectItem>}</SelectContent></Select></div>}
        <div className="space-y-1"><Label htmlFor="att-oggetto">Oggetto</Label><Input id="att-oggetto" maxLength={300} className="min-h-10" value={oggetto} onChange={e => setOggetto(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="att-corpo">Note</Label><Textarea id="att-corpo" maxLength={8000} rows={5} value={corpo} onChange={e => setCorpo(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="att-esito">Esito</Label><Input id="att-esito" maxLength={1000} className="min-h-10" value={esito} onChange={e => setEsito(e.target.value)} /></div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {iniziale && <Button type="button" variant="outline" className="min-h-10 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConferma(true)}><Trash2 className="size-4" />Elimina</Button>}
          <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row"><Button type="button" variant="outline" className="min-h-10" onClick={chiudi}>{id && !iniziale ? "Chiudi" : "Annulla"}</Button><Button type="submit" className="min-h-10" disabled={salva.isPending}>{salva.isPending ? "Salvataggio…" : "Salva"}</Button></div>
        </div>
      </form>
      {id ? <div className="border-t pt-3"><AllegatiSection entitaTipo="attivita_fornitore" entitaId={id} clienteId={null} canEdit eliminaTutti compact /></div>
        : <p className="text-xs text-muted-foreground">Gli allegati si aggiungono subito dopo il primo salvataggio.</p>}
      <DialogFooter className="hidden" />
      <AlertDialog open={conferma} onOpenChange={setConferma}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare questa attività?</AlertDialogTitle><AlertDialogDescription>L’attività e i suoi allegati verranno eliminati definitivamente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction disabled={mElimina.isPending} onClick={e => { e.preventDefault(); if (iniziale) mElimina.mutate(iniziale.id); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
