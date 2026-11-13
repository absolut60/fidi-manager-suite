import { cn } from "@/lib/utils";
import { computeEvasione, EVASIONE_LABEL, type StatoEvasione } from "@/lib/evasione";
import { STATI_LABEL, TIPI_DOC_LABEL, type PreventivoConDettagli, type StatoPreventivo, type TipoDoc } from "@/lib/preventivi-api";

const base = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold";
const TIPO: Record<TipoDoc, string> = {
  PREVENTIVO: "border-pv-azzurro-bordo bg-pv-azzurro text-pv-blu",
  PROPOSTA_RAPIDA: "border-pv-viola/30 bg-pv-viola-tenue text-pv-viola",
  LISTA_MATERIALI: "border-border bg-pv-grigio-tenue text-muted-foreground",
  LISTA_MAT_FORNITORE: "border-border bg-pv-grigio-tenue text-muted-foreground",
};
const STATO: Record<StatoPreventivo, string> = {
  bozza: "border-border bg-pv-grigio-tenue text-muted-foreground",
  inviato: "border-pv-verde/30 bg-pv-verde-tenue text-pv-verde",
  confermato: "border-pv-blu bg-pv-blu text-primary-foreground",
};
const EVASIONE: Record<StatoEvasione, string> = {
  aperto: "border-border bg-card text-muted-foreground",
  parziale: "border-pv-arancio/30 bg-pv-arancio-tenue text-pv-arancio",
  evaso: "border-pv-verde/30 bg-pv-verde-tenue text-pv-verde",
};

/** Badge colorati accanto al numero: tipo documento, stato, evasione (solo preventivi). */
export function BadgeTestata({ prev }: { prev: PreventivoConDettagli }) {
  const ev = prev.tipo === "preventivo" ? computeEvasione(prev.blocchi.flatMap((b) => b.righe)) : null;
  return <>
    <span className={cn(base, TIPO[prev.tipo_doc])}>{TIPI_DOC_LABEL[prev.tipo_doc]}</span>
    <span className={cn(base, STATO[prev.stato])}>{prev.stato === "bozza" && <span aria-hidden>●</span>}{STATI_LABEL[prev.stato]}</span>
    {ev && <span className={cn(base, EVASIONE[ev])}>{EVASIONE_LABEL[ev]}</span>}
  </>;
}
