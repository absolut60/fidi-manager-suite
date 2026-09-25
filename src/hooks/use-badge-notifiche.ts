import { useEffect } from "react";

// Prefisso "(n) " applicato al titolo della scheda.
const PREFISSO_RE = /^\(\d+\+?\)\s/;

function togliPrefisso(titolo: string): string {
  return titolo.replace(PREFISSO_RE, "");
}

/**
 * Riflette il numero di notifiche non lette (da `contaNonLette`, chiave
 * `notificheNonLetteQueryKey`) sul badge dell'icona app e sul titolo della
 * scheda. Da usare UNA sola volta per l'utente collegato (AppShell).
 */
export function useBadgeNotifiche(nonLette: number) {
  // Badge dell'icona app (PWA installata / browser che lo supportano).
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!("setAppBadge" in nav) || typeof nav.setAppBadge !== "function") return;
    try {
      const esito = nonLette > 0 ? nav.setAppBadge(nonLette) : nav.clearAppBadge?.();
      void esito?.catch(() => undefined);
    } catch {
      // Non supportato o negato: si ignora.
    }
  }, [nonLette]);

  // Prefisso "(n) " sul titolo della scheda, riapplicato quando le route cambiano titolo.
  useEffect(() => {
    if (typeof document === "undefined") return;

    const applica = () => {
      const base = togliPrefisso(document.title);
      const atteso = nonLette > 0 ? `(${nonLette}) ${base}` : base;
      if (document.title !== atteso) document.title = atteso;
    };

    applica();

    const osservatore = new MutationObserver(applica);
    const head = document.head;
    if (head) osservatore.observe(head, { subtree: true, childList: true, characterData: true });

    return () => {
      osservatore.disconnect();
      const base = togliPrefisso(document.title);
      if (document.title !== base) document.title = base;
    };
  }, [nonLette]);
}
