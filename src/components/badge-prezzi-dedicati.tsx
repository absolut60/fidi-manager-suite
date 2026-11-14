import { Button } from "@/components/ui/button";
import { testoPrezziDedicati } from "@/lib/cantiere-listini-api";

/** Shared compact marker; only quote notices show the count in the label. */
export function BadgePrezziDedicati({ conteggio, onClick, mostraNumero = false }: { conteggio?: number; onClick?: () => void; mostraNumero?: boolean }) {
  if (!conteggio || conteggio < 1) return null;
  const titolo = testoPrezziDedicati(conteggio);
  const testo = mostraNumero ? titolo : "Prezzi dedicati";
  const stile = "shrink-0 whitespace-nowrap rounded-full bg-pv-verde-tenue px-2 py-0.5 text-xs font-semibold text-pv-verde";
  return onClick
    ? <Button type="button" variant="ghost" className={`h-auto min-h-10 ${stile}`} title={titolo} aria-label={titolo} onClick={onClick}>{testo}</Button>
    : <span className={stile} title={titolo}>{testo}</span>;
}