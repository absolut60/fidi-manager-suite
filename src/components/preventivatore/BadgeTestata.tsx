import { etichetteDocumento } from '@/lib/etichette-documento';
import { cn } from "@/lib/utils";
import { statoEvasionePreventivo, etichettaEvasioneDocumento, type StatoEvasioneDocumento } from "@/lib/evasione";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  ordinato: "border-pv-azzurro-bordo bg-pv-azzurro text-pv-blu",
};
const EVASIONE: Record<StatoEvasioneDocumento, string> = {
  aperto: "border-border bg-card text-muted-foreground",
  parziale: "border-pv-arancio/30 bg-pv-arancio-tenue text-pv-arancio",
  evaso: "border-pv-verde/30 bg-pv-verde-tenue text-pv-verde",
  chiuso: "border-border bg-card text-muted-foreground",
};

/** Pezzi condivisi con l'elenco preventivi: stessa resa della scheda. */
export function BadgeTipoDoc({ tipoDoc, className, tipoDocumento }: { tipoDoc: TipoDoc; className?: string; tipoDocumento?: string }) {
  return <span className={cn(base, TIPO[tipoDoc], className)}>{etichetteDocumento(tipoDocumento).testo(TIPI_DOC_LABEL[tipoDoc])}</span>;
}
export function BadgeStato({ stato, className }: { stato: StatoPreventivo; className?: string }) {
  return <span className={cn(base, STATO[stato], className)}>{stato === "bozza" && <span aria-hidden>●</span>}{STATI_LABEL[stato]}</span>;
}
export function BadgeEvasione({ stato, evaso_in_parte = false, className }: { stato: StatoEvasioneDocumento; evaso_in_parte?: boolean; className?: string }) {
  const { etichetta, sottotesto } = etichettaEvasioneDocumento({ stato, evaso_in_parte });
  return <span className={cn("inline-flex shrink-0 flex-col items-start gap-0.5 text-xs", className)}><span className={cn(base, "text-[length:inherit]", EVASIONE[stato])}>{etichetta}</span>{sottotesto && <span className="whitespace-nowrap text-xs text-muted-foreground">{sottotesto}</span>}</span>;
}

/** Badge colorati accanto al numero: tipo documento, stato, evasione (solo preventivi). */
export function BadgeTestata({ prev }: { prev: PreventivoConDettagli }) {
  const ev = prev.tipo === "preventivo" ? statoEvasionePreventivo({ righe: prev.blocchi.flatMap((b) => b.righe), chiuso_at: prev.chiuso_at }) : null;
  const { data: autore } = useQuery({ queryKey: ['preventivo-chiuso-da', prev.chiuso_da], enabled: !!ev && !!prev.chiuso_at && !!prev.chiuso_da,
    queryFn: async () => {
      if (!prev.chiuso_da) return null;
      const { data, error } = await supabase.from('profili').select('nome,cognome').eq('id', prev.chiuso_da).maybeSingle();
      if (error) throw error;
      return data ? `${data.nome} ${data.cognome}`.trim() : null;
    } });
  const badge = ev ? <BadgeEvasione {...ev} /> : null;
  return <>
    <BadgeTipoDoc tipoDocumento={prev.tipo} tipoDoc={prev.tipo_doc} />
    <BadgeStato stato={prev.stato} />
    {ev && prev.chiuso_at ? <TooltipProvider><Tooltip><TooltipTrigger asChild><span tabIndex={0}>{badge}</span></TooltipTrigger>
      <TooltipContent>Chiuso il {new Date(prev.chiuso_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })} da {autore || 'collaboratore non disponibile'}</TooltipContent>
    </Tooltip></TooltipProvider> : badge}
  </>;
}
