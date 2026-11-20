import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { puoAccedereLead } from "@/lib/lead-costanti";
import { pivaCifre } from "@/lib/cerved/cerved-entita";
import { ricercaAnagraficaCerved } from "@/lib/cerved/cerved-anagrafica.functions";
import { anagraficaCampiLead, attivitaCervedNonAttiva, CAMPI_ANAGRAFICI_LABEL, compilaVuotiAnagrafica, differenzeAnagrafica,
  type CampiAnagraficiLead, type RisultatoAnagraficaCerved } from "@/lib/cerved/cerved-anagrafica";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ConfrontoProps = {
  risultato: RisultatoAnagraficaCerved; attuale: CampiAnagraficiLead;
  onApply: (patch: Partial<CampiAnagraficiLead>) => void; onClose: () => void;
};
/** Una sola finestra per nuovo lead e modifica; applica esclusivamente al form. */
export function ConfrontoAnagraficaCerved({ risultato, attuale, onApply, onClose }: ConfrontoProps) {
  const a = risultato.anagrafica;
  const differenze = a ? differenzeAnagrafica(attuale, anagraficaCampiLead(a)) : [];
  const [esclusi, setEsclusi] = useState<Set<keyof CampiAnagraficiLead>>(new Set());
  const duplicati = risultato.duplicati;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-2xl flex-col overflow-hidden p-0 [&>button]:min-h-10 [&>button]:min-w-10">
      <DialogHeader className="shrink-0 px-4 pt-5 pr-12 sm:px-6">
        <DialogTitle>Compila da P.IVA</DialogTitle>
        <DialogDescription>Confronto dei dati anagrafici Cerved</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto px-4 py-3 sm:px-6">
        {!risultato.trovata && <p role="status" className="mb-3 text-sm">Nessuna azienda trovata su Cerved con questa partita IVA</p>}
        {a && <div className="mb-3 rounded-md border border-l-4 border-l-primary bg-card p-3 text-sm">
          <p className="break-words font-medium">{a.denominazione ?? "—"}</p>
          <p className="mt-1 break-words text-muted-foreground">Forma giuridica: {a.forma_giuridica ?? "—"}</p>
          <p className="mt-1 break-words text-muted-foreground">ATECO: {[a.ateco_2025_codice, a.ateco_2025_descrizione].filter(Boolean).join(" · ") || "—"}</p>
        </div>}
        {a && attivitaCervedNonAttiva(a) && <div role="alert" className="mb-3 rounded-md border border-l-4 border-l-destructive bg-card p-3 text-sm text-destructive">
          <p className="flex items-start gap-2"><AlertTriangle className="size-4 shrink-0" />Attività non attiva: {a.stato_attivita_descrizione || "Non operativa secondo Cerved"}</p>
        </div>}
        {(duplicati.clienti.length > 0 || duplicati.lead.length > 0) && <div className="mb-3 rounded-md border border-l-4 border-l-primary bg-card p-3 text-sm">
          <p className="font-medium">Questa partita IVA esiste già:</p>
          <ul className="mt-1">
            {duplicati.clienti.map(c => <li key={c.id}><Link target="_blank" rel="noopener noreferrer" className="inline-block min-h-10 break-words py-2 text-primary underline" to="/clienti/$clienteId" params={{ clienteId: c.id }}>{c.ragione_sociale ?? "Cliente"}</Link></li>)}
            {duplicati.lead.map(l => <li key={l.id}><Link target="_blank" rel="noopener noreferrer" className="inline-block min-h-10 break-words py-2 text-primary underline" to="/lead/$leadId" params={{ leadId: l.id }}>{l.nome}</Link></li>)}
          </ul>
        </div>}
        <div className="divide-y divide-border">
          {differenze.map(d => <label key={d.campo} className="flex min-h-11 cursor-pointer items-start gap-3 py-3">
            <Checkbox className="mt-1 shrink-0" aria-label={`Applica ${CAMPI_ANAGRAFICI_LABEL[d.campo]}`} checked={!esclusi.has(d.campo)} onCheckedChange={v => setEsclusi(old => {
              return v === true ? new Set([...old].filter(campo => campo !== d.campo)) : new Set([...old, d.campo]);
            })} />
            <span className="min-w-0 flex-1 text-sm"><span className="block font-medium">{CAMPI_ANAGRAFICI_LABEL[d.campo]}</span>
              <span className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
                <span className="break-words text-muted-foreground">{d.attuale || "—"}</span><span aria-hidden>→</span><span className="break-words">{d.cerved}</span>
              </span>
            </span>
          </label>)}
          {a && !differenze.length && <p className="py-3 text-sm text-muted-foreground">I campi del form coincidono con i dati disponibili su Cerved.</p>}
        </div>
      </div>
      <DialogFooter className="shrink-0 border-t bg-card px-4 py-3 sm:px-6">
        <Button type="button" variant="outline" className="min-h-10" onClick={onClose}>Chiudi</Button>
        {differenze.length > 0 && <Button type="button" className="min-h-10" onClick={() => {
          onApply(Object.fromEntries(differenze.filter(d => !esclusi.has(d.campo)).map(d => [d.campo, d.cerved]))); onClose();
        }}>Applica</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function CompilaDaPiva({ form, onApply, creazione = false, leadId }: {
  form: CampiAnagraficiLead; onApply: (patch: Partial<CampiAnagraficiLead>) => void; creazione?: boolean; leadId?: string;
}) {
  const { roles } = useAuth();
  const fn = useServerFn(ricercaAnagraficaCerved);
  const qc = useQueryClient();
  const current = useRef(form); current.current = form;
  const [loading, setLoading] = useState(false);
  const [confronto, setConfronto] = useState<{ risultato: RisultatoAnagraficaCerved; attuale: CampiAnagraficiLead } | null>(null);
  if (!puoAccedereLead(roles)) return null;
  return <>
    <Button type="button" size="sm" variant="outline" className="min-h-10 shrink-0 gap-1.5" title="Dati anagrafici da Cerved (ricerca gratuita, non è il report)"
      disabled={pivaCifre(form.partita_iva).length !== 11 || loading} onClick={async () => {
        if (loading) return;
        setLoading(true);
        const richiestaPiva = pivaCifre(current.current.partita_iva);
        try {
          const risultato = await fn({ data: { partitaIva: richiestaPiva, ...(leadId ? { escludiLeadId: leadId } : {}) } });
          if (pivaCifre(current.current.partita_iva) !== richiestaPiva) {
            toast.info("La partita IVA è cambiata: ripeti la ricerca per i nuovi dati"); return;
          }
          let attuale = current.current;
          if (creazione && risultato.anagrafica) {
            const patch = compilaVuotiAnagrafica(attuale, anagraficaCampiLead(risultato.anagrafica));
            onApply(patch); attuale = { ...attuale, ...patch };
          }
          setConfronto({ risultato, attuale });
        } catch (e) { toast.error(e instanceof Error ? e.message : "Ricerca anagrafica non riuscita"); }
        finally { setLoading(false); void qc.invalidateQueries({ queryKey: ["cerved-ricerche-annuali"] }); }
      }}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}{loading ? "Ricerca…" : "Compila da P.IVA"}
    </Button>
    {confronto && <ConfrontoAnagraficaCerved {...confronto} onApply={onApply} onClose={() => setConfronto(null)} />}
  </>;
}