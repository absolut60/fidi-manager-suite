import { useEffect, useState } from "react";

/**
 * Fonte unica JS del "tablet" (FM79): stessa media query della variante `tablet:` in src/styles.css.
 * Schermo touch senza mouse, da 768px, escluso il telefono in orizzontale.
 */
export const MEDIA_TABLET =
  "(pointer: coarse) and (hover: none) and (min-width: 768px) and (min-height: 501px)";

/** false al primo render (uguale al rendering lato server); il valore reale arriva in useEffect. */
export function useIsTablet(): boolean {
  const [tablet, setTablet] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MEDIA_TABLET);
    const aggiorna = () => setTablet(mq.matches);
    aggiorna();
    mq.addEventListener("change", aggiorna);
    return () => mq.removeEventListener("change", aggiorna);
  }, []);
  return tablet;
}
