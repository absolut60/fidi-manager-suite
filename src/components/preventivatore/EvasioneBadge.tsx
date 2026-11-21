import { BadgeEvasione } from './BadgeTestata';
import type { StatoEvasioneDocumento } from '@/lib/evasione';

/**
 * Badge per lo stato di evasione di un preventivo.
 * - aperto    → neutro (outline)
 * - parziale  → arancione
 * - evaso     → verde
 */
export function EvasioneBadge({
  stato,
  className,
  evaso_in_parte = false,
}: {
  stato: StatoEvasioneDocumento;
  evaso_in_parte?: boolean;
  className?: string;
}) {
  return <BadgeEvasione stato={stato} evaso_in_parte={evaso_in_parte} {...(className ? { className } : {})} />;
}
