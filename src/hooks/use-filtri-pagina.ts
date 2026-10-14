import { useCallback, useEffect, useState } from "react";

/**
 * Fonte unica per conservare i filtri delle pagine elenco (sessionStorage,
 * per utente e per scheda del browser). Non creare meccanismi paralleli.
 *
 * SSR: la lettura avviene nell'inizializzatore di useState. Va usato solo in
 * componenti montati dopo l'idratazione (es. pagine sotto `_app`, che
 * mostrano "Caricamento..." finché l'autenticazione non è pronta): così il
 * primo render ha già i filtri salvati, senza mismatch né doppia query.
 * Sul server (niente window) restituisce i defaults.
 */
type Aggiornamento<V> = V | ((prev: V) => V);

type Validatori<T> = { [K in keyof T]?: (v: unknown) => boolean };

function leggi<T extends Record<string, unknown>>(chiave: string, defaults: T, valida?: Validatori<T>): T {
  if (typeof window === "undefined") return { ...defaults };
  try {
    const raw = window.sessionStorage.getItem(chiave);
    if (!raw) return { ...defaults };
    const salvati = JSON.parse(raw) as unknown;
    if (!salvati || typeof salvati !== "object" || Array.isArray(salvati)) return { ...defaults };
    const out: Record<string, unknown> = { ...defaults };
    for (const k of Object.keys(defaults)) {
      const v = (salvati as Record<string, unknown>)[k];
      // Ignora valori assenti o di tipo diverso dal default
      if (v === undefined || v === null || typeof v !== typeof defaults[k]) continue;
      // Array salvati solo se anche il default è un array
      if (Array.isArray(defaults[k]) !== Array.isArray(v)) continue;
      // Oggetti/tuple: forma verificata dal validatore della pagina, altrimenti default
      const check = valida?.[k as keyof T];
      if (check && !check(v)) continue;
      out[k] = v;
    }
    return out as T;
  } catch {
    return { ...defaults };
  }
}

function scrivi<T extends Record<string, unknown>>(chiave: string, valori: T, defaults: T) {
  if (typeof window === "undefined") return;
  try {
    const tuttiDefault = Object.keys(defaults).every((k) => Object.is(valori[k], defaults[k]));
    if (tuttiDefault) window.sessionStorage.removeItem(chiave);
    else window.sessionStorage.setItem(chiave, JSON.stringify(valori));
  } catch {
    // storage bloccato: funziona senza memoria
  }
}

export function useFiltriPagina<T extends Record<string, unknown>>(
  chiavePagina: string,
  defaults: T,
  opzioni?: {
    userId?: string | null;
    /** Al montaggio parte dai defaults ignorando i salvati (es. link con filtri nell'URL). */
    partiDaiDefault?: boolean;
    /** Validatori di forma per oggetti/tuple/array salvati. */
    valida?: Validatori<T>;
  },
) {
  const chiave = `filtri:${opzioni?.userId ?? "anon"}:${chiavePagina}`;
  const [defaultsIniziali] = useState(defaults);
  const [valida] = useState(() => opzioni?.valida);
  const [stato, setStato] = useState(() => ({
    chiave,
    valori: opzioni?.partiDaiDefault ? { ...defaultsIniziali } : leggi(chiave, defaultsIniziali, valida),
  }));

  // Cambio utente/chiave: ricarica subito i valori della nuova chiave (durante il render).
  let corrente = stato;
  if (stato.chiave !== chiave) {
    corrente = { chiave, valori: leggi(chiave, defaultsIniziali, valida) };
    setStato(corrente);
  }

  useEffect(() => {
    if (stato.chiave === chiave) scrivi(chiave, stato.valori, defaultsIniziali);
  }, [chiave, stato, defaultsIniziali]);

  const setCampo = useCallback(<K extends keyof T>(campo: K, valore: Aggiornamento<T[K]>) => {
    setStato((s) => {
      const prev = s.valori[campo];
      const next = typeof valore === "function" ? (valore as (p: T[K]) => T[K])(prev) : valore;
      if (Object.is(prev, next)) return s;
      return { chiave: s.chiave, valori: { ...s.valori, [campo]: next } };
    });
  }, []);

  const setParziale = useCallback((parziale: Partial<T> | ((prev: T) => Partial<T>)) => {
    setStato((s) => ({
      chiave: s.chiave,
      valori: { ...s.valori, ...(typeof parziale === "function" ? parziale(s.valori) : parziale) },
    }));
  }, []);

  /** Torna ai defaults (con eventuali eccezioni) e cancella la memoria. */
  const reset = useCallback(
    (eccezioni?: Partial<T>) => {
      setStato((s) => ({ chiave: s.chiave, valori: { ...defaultsIniziali, ...eccezioni } }));
      if (typeof window !== "undefined") {
        try { window.sessionStorage.removeItem(chiave); } catch { /* ignora */ }
      }
    },
    [chiave, defaultsIniziali],
  );

  return { filtri: corrente.valori, setCampo, setParziale, reset };
}
