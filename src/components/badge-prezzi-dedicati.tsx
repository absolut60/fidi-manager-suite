import { Button } from "@/components/ui/button";
import { testoPrezziDedicati } from "@/lib/cantiere-listini-api";

const STILE_PREZZI_DEDICATI = "shrink-0 whitespace-nowrap rounded-full bg-pv-verde-tenue font-semibold text-pv-verde";

export function BadgePrezzoCantiere() {
  return <span className={`${STILE_PREZZI_DEDICATI} inline-block px-1.5 py-0.5 text-[11px]`}>Prezzo cantiere</span>;
}

/** Shared compact marker; only quote notices show the count in the label. */
export function BadgePrezziDedicati({ conteggio, onClick, mostraNumero = false }: { conteggio?: number; onClick?: () => void; mostraNumero?: boolean }) {
  if (!conteggio || conteggio < 1) return null;
  const titolo = testoPrezziDedicati(conteggio);
  const testo = mostraNumero ? titolo : "Prezzi dedicati";
  const stile = `${STILE_PREZZI_DEDICATI} px-2 py-0.5 text-xs`;
  return onClick
    ? <Button type="button" variant="ghost" className={`h-auto min-h-10 ${stile}`} title={titolo} aria-label={titolo} onClick={onClick}>{testo}</Button>
    : <span className={stile} title={titolo}>{testo}</span>;
}