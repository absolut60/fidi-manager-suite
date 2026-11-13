import { useEffect, useState } from "react";

/**
 * FM68: barra blu in alto a scomparsa sul telefono in orizzontale.
 *
 * Regola di comportamento (unica fonte):
 * - `nascosta` diventa true scorrendo verso il basso quando scrollY > 56;
 * - torna false scorrendo verso l'alto di almeno 8 px (accumulati), oppure
 *   quando scrollY torna sotto 56;
 * - è sempre false se `disattiva` (es. menu mobile aperto).
 *
 * Lo stato viene calcolato su ogni dispositivo: l'effetto visivo lo decide
 * solo il CSS con la variante `pv-orizzontale` (src/styles.css), così
 * telefono verticale, tablet e PC restano identici a prima.
 */
const SOGLIA_INIZIO = 56;
const PASSO_RITORNO = 8;

export function useBarraAScomparsa(disattiva: boolean): boolean {
  const [nascosta, setNascosta] = useState(false);

  useEffect(() => {
    if (disattiva) {
      setNascosta(false);
      return;
    }

    let ultimo = window.scrollY;
    let accumuloSu = 0;
    let inCoda = false;

    const applica = () => {
      inCoda = false;
      const attuale = window.scrollY;
      const scarto = attuale - ultimo;
      ultimo = attuale;

      if (attuale < SOGLIA_INIZIO) {
        accumuloSu = 0;
        setNascosta(false);
        return;
      }
      if (scarto > 0) {
        accumuloSu = 0;
        setNascosta(true);
        return;
      }
      if (scarto < 0) {
        accumuloSu += -scarto;
        if (accumuloSu >= PASSO_RITORNO) {
          accumuloSu = 0;
          setNascosta(false);
        }
      }
    };

    const sulScroll = () => {
      if (inCoda) return;
      inCoda = true;
      requestAnimationFrame(applica);
    };

    window.addEventListener("scroll", sulScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", sulScroll);
      if (inCoda && typeof cancelAnimationFrame === "function") {
        // niente di grave se il frame non parte: la funzione è idempotente
      }
    };
  }, [disattiva]);

  return nascosta;
}
