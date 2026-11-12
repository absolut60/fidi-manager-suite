// FM62 G6: tab "Contatti" della scheda fornitore. Persone nella stessa tabella dei
// contatti di clienti e lead; privacy con lo stesso flusso (ContattoPrivacyAzioni),
// nessun marketing per chi è solo del fornitore (escluso lato database).
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileCheck2, Link2, Mail, Phone, Plus, Search, Smartphone, Star, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { NuovoContattoWizard } from "@/components/nuovo-contatto-wizard";
import { ContattoPrivacyAzioni } from "@/components/contatto-privacy-azioni";
import { BadgeConsensiContatto } from "@/components/badge-consensi";
import { RuoloSelect } from "@/components/ruolo-select";
import { erroreScritturaContatto } from "@/lib/contatti-permessi";
import {
  useContattiFornitore, chiaveContattiFornitore, nomeContatto, cercaContattiCollegabili, collegaContattoFornitore,
  scollegaContattoFornitore, testoConfermaScollega, type ContattoFornitore,
} from "@/lib/contatti-fornitore";

export function ContattiFornitoreTab({ fornitore, puoGestire }: { fornitore: { id: string; ragione_sociale: string | null; partita_iva: string | null; codice_fiscale: string | null; indirizzo: string | null; citta: string | null }; puoGestire: boolean }) {
  const q = useContattiFornitore(fornitore.id);
  const qc = useQueryClient();
  const [nuovo, setNuovo] = useState(false);
  const [collega, setCollega] = useState(false);
  const [aperto, setAperto] = useState<ContattoFornitore | null>(null);
  const aggiorna = () => void qc.invalidateQueries({ queryKey: chiaveContattiFornitore(fornitore.id) });
  return <div className="space-y-3">
    {puoGestire && <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" className="min-h-10 gap-1.5" onClick={() => setCollega(true)}><Link2 className="size-4" />Collega contatto esistente</Button>
      <Button className="min-h-10 gap-1.5" onClick={() => setNuovo(true)}><Plus className="size-4" />Nuovo contatto</Button>
    </div>}
    {q.isPending ? <p role="status" className="py-6 text-muted-foreground">Caricamento contatti…</p>
      : q.error ? <p role="alert" className="py-6 text-destructive">{q.error.message}</p>
      : !q.data.length ? <Card className="p-10 text-center"><p className="text-sm font-medium">Nessun contatto</p><p className="mt-1 text-xs text-muted-foreground">{puoGestire ? "Aggiungi un referente o collega una persona già presente (es. del cliente collegato)." : "Nessun referente registrato per questo fornitore."}</p></Card>
      : <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{q.data.map(c => <SchedaContatto key={c.id} c={c} apri={() => setAperto(c)} onRefresh={aggiorna} />)}</div>}
    <Dialog open={nuovo} onOpenChange={setNuovo}>
      {nuovo && <NuovoContattoWizard fornitore cliente={{ id: fornitore.id, ragione_sociale: fornitore.ragione_sociale ?? "", partita_iva: fornitore.partita_iva, codice_fiscale: fornitore.codice_fiscale, indirizzo: fornitore.indirizzo, citta: fornitore.citta }}
        onClose={() => setNuovo(false)} onSuccess={aggiorna} />}
    </Dialog>
    {collega && <CollegaContattoDialog fornitoreId={fornitore.id} chiudi={() => setCollega(false)} />}
    {aperto && <ContattoDialog c={aperto} fornitoreId={fornitore.id} puoGestire={puoGestire} chiudi={() => setAperto(null)} />}
  </div>;
}

function SchedaContatto({ c, apri, onRefresh }: { c: ContattoFornitore; apri: () => void; onRefresh: () => void }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return <Card role="button" tabIndex={0} aria-label={`Apri ${nomeContatto(c)}`} onClick={apri} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); apri(); } }}
    className="min-w-0 cursor-pointer p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <p className="min-w-0 break-words font-semibold">{nomeContatto(c)}</p>
      {c.principale && <Badge className="shrink-0 gap-1 bg-accent/15 text-accent"><Star className="size-3 fill-current" />Principale</Badge>}
      {c.privacy_firmata && <Badge className="shrink-0 gap-1 bg-success/15 text-success"><FileCheck2 className="size-3" />Privacy firmata</Badge>}
      <BadgeConsensiContatto contattoId={c.id} compact />
    </div>
    {c.ruolo && <p className="mt-0.5 text-xs text-muted-foreground">{c.ruolo}</p>}
    {(c.cliente_id || c.lead_id) && <p className="mt-1 text-xs text-muted-foreground">Anche referente di un {c.cliente_id ? "cliente" : "lead"}</p>}
    <div className="mt-3 space-y-1 text-sm">
      {c.email && <a href={`mailto:${c.email}`} onClick={stop} className="flex min-h-8 min-w-0 items-center gap-2 break-all text-muted-foreground hover:text-foreground"><Mail className="size-3.5 shrink-0" />{c.email}</a>}
      {c.cellulare && <a href={`tel:${c.cellulare}`} onClick={stop} className="flex min-h-8 items-center gap-2 text-muted-foreground hover:text-foreground"><Smartphone className="size-3.5 shrink-0" />{c.cellulare}</a>}
      {c.telefono && <a href={`tel:${c.telefono}`} onClick={stop} className="flex min-h-8 items-center gap-2 text-muted-foreground hover:text-foreground"><Phone className="size-3.5 shrink-0" />{c.telefono}</a>}
    </div>
    <div className="mt-3 border-t pt-3" onClick={stop} onKeyDown={stop}><ContattoPrivacyAzioni contatto={c} onRefresh={onRefresh} /></div>
  </Card>;
}

type Modulo = { nome: string; cognome: string; ruolo: string; email: string; telefono: string; cellulare: string; principale: boolean };
const daContatto = (c: ContattoFornitore): Modulo => ({ nome: c.nome ?? "", cognome: c.cognome ?? "", ruolo: c.ruolo ?? "", email: c.email ?? "", telefono: c.telefono ?? "", cellulare: c.cellulare ?? "", principale: !!c.principale });
const vuoto = (v: string) => v.trim() || null;

/** Apertura come nella scheda cliente: modifica per chi gestisce i fornitori, "Scollega" solo qui dentro. */
function ContattoDialog({ c, fornitoreId, puoGestire, chiudi }: { c: ContattoFornitore; fornitoreId: string; puoGestire: boolean; chiudi: () => void }) {
  const qc = useQueryClient();
  const [m, setM] = useState<Modulo>(daContatto(c));
  const [conferma, setConferma] = useState(false);
  const set = <K extends keyof Modulo>(k: K, v: Modulo[K]) => setM(p => ({ ...p, [k]: v }));
  const fine = () => { void qc.invalidateQueries({ queryKey: chiaveContattiFornitore(fornitoreId) }); void qc.invalidateQueries({ queryKey: ["contatti-all"] }); if (c.cliente_id) void qc.invalidateQueries({ queryKey: ["contatti", c.cliente_id] }); };
  const salva = useMutation({
    mutationFn: async () => {
      if (!m.nome.trim()) throw new Error("Il nome è obbligatorio");
      const { data, error } = await supabase.from("contatti").update({ nome: m.nome.trim(), cognome: vuoto(m.cognome), ruolo: vuoto(m.ruolo), email: vuoto(m.email), telefono: vuoto(m.telefono), cellulare: vuoto(m.cellulare), principale: m.principale }).eq("id", c.id).select("id");
      if (error) throw new Error(erroreScritturaContatto(error, "modificare"));
      if (!data?.length) throw new Error("Non hai il permesso di modificare questo contatto");
    },
    onSuccess: () => { toast.success("Contatto aggiornato"); fine(); chiudi(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const scollega = useMutation({
    mutationFn: () => scollegaContattoFornitore(c.id, fornitoreId),
    onSuccess: esito => { toast.success(esito === "eliminato" ? "Contatto eliminato" : "Contatto scollegato dal fornitore"); fine(); chiudi(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const campo = (k: Exclude<keyof Modulo, "principale" | "ruolo">, label: string, type = "text") =>
    <div className="min-w-0 space-y-1"><Label htmlFor={`cf-${k}`}>{label}</Label><Input id={`cf-${k}`} type={type} className="min-h-10" value={m[k]} disabled={!puoGestire} onChange={e => set(k, e.target.value)} /></div>;
  return <Dialog open onOpenChange={o => { if (!o) chiudi(); }}>
    <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-3 overflow-y-auto rounded-none sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-lg">
      <DialogHeader><DialogTitle className="break-words">{nomeContatto(c)}</DialogTitle><DialogDescription>{puoGestire ? "Modifica i dati del referente." : "Dati del referente."}</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (puoGestire) salva.mutate(); }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{campo("nome", "Nome *")}{campo("cognome", "Cognome")}</div>
        {puoGestire ? <RuoloSelect value={m.ruolo} onChange={v => set("ruolo", v)} /> : <div className="space-y-1"><Label>Ruolo</Label><p className="text-sm">{m.ruolo || "—"}</p></div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{campo("email", "Email", "email")}{campo("cellulare", "Cellulare", "tel")}{campo("telefono", "Telefono", "tel")}</div>
        <label className="flex min-h-10 items-center gap-2 text-sm"><Checkbox checked={m.principale} disabled={!puoGestire} onCheckedChange={v => set("principale", v === true)} />Contatto principale</label>
        {puoGestire && <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center">
          <Button type="button" variant="outline" className="min-h-10 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConferma(true)}><Unlink className="size-4" />Scollega</Button>
          <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row"><Button type="button" variant="outline" className="min-h-10" onClick={chiudi}>Annulla</Button><Button type="submit" className="min-h-10" disabled={salva.isPending}>{salva.isPending ? "Salvataggio…" : "Salva"}</Button></div>
        </div>}
      </form>
      <AlertDialog open={conferma} onOpenChange={setConferma}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Scollegare {nomeContatto(c)}?</AlertDialogTitle><AlertDialogDescription>{testoConfermaScollega(c)}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction disabled={scollega.isPending} onClick={e => { e.preventDefault(); scollega.mutate(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{c.cliente_id || c.lead_id ? "Scollega" : "Scollega ed elimina"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  </Dialog>;
}

function CollegaContattoDialog({ fornitoreId, chiudi }: { fornitoreId: string; chiudi: () => void }) {
  const qc = useQueryClient();
  const [testo, setTesto] = useState("");
  const [cerca, setCerca] = useState("");
  useEffect(() => { const t = setTimeout(() => setCerca(testo), 300); return () => clearTimeout(t); }, [testo]);
  const risultati = useQuery({ queryKey: ["contatti-collegabili", fornitoreId, cerca], queryFn: () => cercaContattiCollegabili(fornitoreId, cerca), enabled: cerca.trim().length === 0 || cerca.trim().length >= 2 });
  const collega = useMutation({
    mutationFn: (id: string) => collegaContattoFornitore(id, fornitoreId),
    onSuccess: () => { toast.success("Contatto collegato al fornitore"); void qc.invalidateQueries({ queryKey: chiaveContattiFornitore(fornitoreId) }); void qc.invalidateQueries({ queryKey: ["contatti-collegabili", fornitoreId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const righe = risultati.data ?? [];
  return <Dialog open onOpenChange={o => { if (!o) chiudi(); }}>
    <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-3 overflow-hidden rounded-none sm:h-auto sm:max-h-[85vh] sm:max-w-xl sm:rounded-lg">
      <DialogHeader><DialogTitle>Collega contatto esistente</DialogTitle><DialogDescription>La persona resta una sola: compare anche qui, con la sua privacy.</DialogDescription></DialogHeader>
      <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Cerca contatti" autoComplete="off" className="min-h-10 pl-9" placeholder="Nome, cognome, email, telefono o azienda…" value={testo} onChange={e => setTesto(e.target.value)} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {risultati.isFetching && !righe.length ? <p role="status" className="py-4 text-sm text-muted-foreground">Ricerca…</p>
          : risultati.error ? <p role="alert" className="py-4 text-sm text-destructive">{risultati.error.message}</p>
          : !righe.length ? <p className="py-4 text-sm text-muted-foreground">{cerca.trim() ? "Nessun contatto trovato." : "Il cliente collegato non ha contatti da proporre: scrivi almeno 2 lettere per cercare."}</p>
          : <ul className="divide-y">{righe.map(r => <li key={r.id} className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 break-words text-sm font-medium">{nomeContatto(r)}{r.del_cliente_collegato && <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Cliente collegato</Badge>}</p>
              <p className="break-words text-xs text-muted-foreground">{[r.ruolo, r.azienda].filter(Boolean).join(" · ") || "—"}</p>
              <p className="break-all text-xs text-muted-foreground">{[r.email, r.cellulare || r.telefono].filter(Boolean).join(" · ")}</p>
            </div>
            <Button variant="outline" className="min-h-10 shrink-0" disabled={collega.isPending} onClick={() => collega.mutate(r.id)}><Link2 className="size-4" />Collega</Button>
          </li>)}</ul>}
      </div>
    </DialogContent>
  </Dialog>;
}
