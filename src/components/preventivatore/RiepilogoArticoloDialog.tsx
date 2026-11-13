import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Boxes, ExternalLink, FileText, ShoppingCart, Tag, Truck, X } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { RiquadroScheda } from "./RiquadroScheda";
import { fetchPrezzoClienteArticolo, fetchRiepilogoArticoloPreventivo } from "@/lib/preventivi-api";
import { formatScontiGamma, rigaInUnita, type ImportoRigaInput } from "@/lib/riga-preventivo";
import { prezzoConUnita, quantitaConUnita, unitaArticolo } from "@/lib/scheda-articolo";
import { fontePrezzoTesto, scontiAcquistoTesto, trasportoAcquistoTesto } from "@/lib/riepilogo-articolo";
import { formatNumeroIt } from "@/lib/numero-it";
import { cn } from "@/lib/utils";

type RigaRiepilogo = ImportoRigaInput & { incidenza?: number | null; costo?: number | null; um?: string | null; um_scelta?: string | null };

export type RiepilogoArticoloDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  codice: string;
  riga: RigaRiepilogo;
  calc: { importo: number; margine_perc: number };
};

const p4 = (v: number | null | undefined) => (v == null ? "—" : `${formatNumeroIt(v, { minDecimals: 4, maxDecimals: 4 })} €`);
const e2 = (v: number | null | undefined) => (v == null ? "—" : `€ ${formatNumeroIt(v, { minDecimals: 2, maxDecimals: 2 })}`);
const qt = (v: number | null | undefined, um: string | null | undefined) => (v == null ? "—" : quantitaConUnita(Number(v), um ?? null));

function Voce({ etichetta, valore, forte }: { etichetta: ReactNode; valore: ReactNode; forte?: boolean }) {
  return <div className={cn("flex items-baseline justify-between gap-3 py-1", forte && "border-t border-border/60 pt-2")}>
    <dt className={cn("min-w-0 break-words text-sm text-muted-foreground", forte && "font-semibold text-foreground")}>{etichetta}</dt>
    <dd className={cn("shrink-0 text-right font-mono text-sm tabular-nums", forte && "text-base font-bold")}>{valore}</dd>
  </div>;
}

/** FM65 punto 4: riepilogo dell'articolo di una riga, sola lettura. Dati: riepilogo_articolo_preventivo + prezzi_preventivo_cliente. */
export function RiepilogoArticoloDialog({ open, onOpenChange, clienteId, codice, riga, calc }: RiepilogoArticoloDialogProps) {
  const qRiep = useQuery({ queryKey: ["riepilogo-articolo-preventivo", clienteId, codice], queryFn: () => fetchRiepilogoArticoloPreventivo(clienteId, codice), enabled: open && !!clienteId && !!codice });
  const qPrezzo = useQuery({ queryKey: ["prezzo-cliente-articolo", clienteId, codice], queryFn: () => fetchPrezzoClienteArticolo(clienteId, codice), enabled: open && !!clienteId && !!codice });
  const a = qRiep.data, pr = qPrezzo.data;
  const caricamento = qRiep.isLoading || qPrezzo.isLoading;
  const errore = qRiep.error || qPrezzo.error;
  const u = a ? unitaArticolo(a) : null;
  const vista = rigaInUnita(riga, a ? { um: a.um, um2: a.um2, fattore_conversione: a.fattore_conversione } : null);
  const scontiVendita = pr ? formatScontiGamma([pr.sc1, pr.sc2, pr.sc3, pr.sc4, pr.sc5, pr.sc6]) : "";
  const statoClass = !a?.attivo ? "bg-destructive/15 text-destructive border-destructive/30" : a.stato_gamma === "in_esaurimento" ? "bg-warning/15 text-warning border-warning/30" : "bg-success/15 text-success border-success/30";

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-lg [&>button:last-child]:hidden">
      <div className="flex items-start gap-3 border-b p-4">
        <div className="min-w-0 flex-1">
          <p className="break-all font-mono text-xs text-muted-foreground">{codice}</p>
          <DialogTitle className="mt-0.5 break-words text-lg font-bold leading-snug">{a?.descrizione ?? (caricamento ? "Caricamento…" : "Riepilogo articolo")}</DialogTitle>
          <DialogDescription className="sr-only">Riepilogo dell'articolo per il cliente del preventivo</DialogDescription>
          {a && <div className="mt-2 flex flex-wrap items-center gap-2">
            {a.marca && <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-pv-azzurro-bordo bg-pv-azzurro px-2 py-0.5 text-xs font-semibold text-pv-blu"><Tag className="size-3.5 shrink-0" aria-hidden /><span className="min-w-0 break-words">{a.marca}</span></span>}
            <Badge variant="outline" className={statoClass}>{!a.attivo ? "Dismesso in Gamma" : a.stato_gamma === "in_esaurimento" ? "In esaurimento" : "In uso"}</Badge>
            <span className="text-xs text-muted-foreground">U.M. <span className="font-semibold text-foreground">{u?.um1 ?? "—"}</span>{u?.convertibile && <> · 1 {u.um2} = {formatNumeroIt(u.fattore, { maxDecimals: 4 })} {u.um1}</>}</span>
          </div>}
          {a && <p className="mt-1 break-words text-xs text-muted-foreground">{[a.famiglia, a.sottofamiglia].filter(Boolean).join(" › ") || "—"}</p>}
        </div>
        <DialogClose asChild><Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="Chiudi"><X className="size-5" /></Button></DialogClose>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {errore ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Impossibile caricare il riepilogo dell'articolo. Riprova tra poco.</p>
        : caricamento ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-[12px]" />)}</div>
        : !a ? <p className="text-sm text-muted-foreground">Articolo non trovato nel catalogo Gamma.</p>
        : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RiquadroScheda titolo="Prezzo di vendita" icona={Tag} tono="azzurro"><dl>
            <Voce etichetta={`Listino${a.listino_cliente != null ? ` ${a.listino_cliente}` : ""}`} valore={p4(pr?.prezzo_listino)} />
            <Voce etichetta="Sconti Gamma" valore={scontiVendita || "—"} />
            {Number(pr?.maggiorazione_perc ?? 0) !== 0 && <Voce etichetta="Maggiorazione" valore={`${formatNumeroIt(pr?.maggiorazione_perc, { maxDecimals: 4 })}%`} />}
            <Voce etichetta="Netto per il cliente" valore={p4(pr?.prezzo_netto)} forte />
          </dl><p className="mt-2 text-xs text-muted-foreground">{fontePrezzoTesto(pr?.fonte_prezzo, pr?.avvisi)}</p></RiquadroScheda>

          <RiquadroScheda titolo="Acquisto" icona={Truck} tono="arancio"><dl>
            <Voce etichetta="Listino fornitore" valore={p4(a.acq_prezzo)} />
            <Voce etichetta="Sconti" valore={scontiAcquistoTesto(a)} />
            <Voce etichetta="Trasporto" valore={trasportoAcquistoTesto(a)} />
            <Voce etichetta="Costo netto da listino fornitore" valore={p4(a.costo_acquisto)} />
            <Voce etichetta="Costo ultimo (usato nel preventivo)" valore={p4(a.costo_ultimo)} forte />
          </dl><p className="mt-2 text-xs text-muted-foreground">Condizioni del listino del cliente{a.sede_cliente_nome ? ` (${a.sede_cliente_nome.toLowerCase().startsWith("sede") ? a.sede_cliente_nome : `sede di ${a.sede_cliente_nome}`})` : ""}</p></RiquadroScheda>

          <RiquadroScheda titolo="Giacenze" icona={Boxes} tono="verde"><dl>
            <Voce etichetta={`Sede del cliente${a.sede_cliente_nome ? ` (${a.sede_cliente_nome})` : ""}`} valore={qt(a.giacenza_sede_cliente, a.um)} />
            <Voce etichetta="Logistica comune" valore={qt(a.giacenza_logistica, a.um)} />
            <Voce etichetta="Totale sedi" valore={qt(a.giacenza_totale_sedi, a.um)} />
            <Voce etichetta="Ordinato a fornitori" valore={qt(a.ordinato_fornitori, a.um)} />
          </dl></RiquadroScheda>

          <RiquadroScheda titolo="In questo preventivo" icona={FileText} tono="grigio"><dl>
            <Voce etichetta="Quantità" valore={qt(vista.quantita, vista.um)} />
            <Voce etichetta="Importo" valore={e2(calc.importo)} />
            <Voce etichetta="Margine" valore={<span className={cn("inline-flex rounded-full px-2 py-0.5 font-sans text-xs font-semibold", calc.margine_perc < 0 ? "bg-destructive/10 text-destructive" : "bg-pv-verde-tenue text-pv-verde")}>{formatNumeroIt(calc.margine_perc, { minDecimals: 1, maxDecimals: 1 })}%</span>} />
            <Voce etichetta="Prezzo netto per U.M." valore={prezzoConUnita(vista.netto, vista.um)} forte />
          </dl></RiquadroScheda>
        </div>}
      </div>

      <div className="border-t p-3 sm:flex sm:justify-end">
        <Button asChild className="min-h-10 w-full sm:w-auto">
          <Link to="/articoli/codice/$codice" params={{ codice }} search={{ tab: "panoramica", um: vista.secondaria ? 2 : 1 }}><ShoppingCart className="size-4" aria-hidden />Apri scheda articolo completa<ExternalLink className="size-4" aria-hidden /></Link>
        </Button>
      </div>
    </DialogContent>
  </Dialog>;
}
