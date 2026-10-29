/**
 * Fonte unica (FM52) per i filtri a scelta multipla dei segmenti marketing.
 * Gemello SQL: public._segmento_filtro_elenco(jsonb), usato da risolvi_pubblico_segmento.
 *
 * Formato vecchio (segmenti già salvati): stringa singola, "tutti"/"" = tutti.
 * Formato nuovo: elenco di stringhe, elenco vuoto = tutti.
 */
export const CHIAVI_SEGMENTO_MULTIPLE = [
  "storeFiltro",
  "filtroAgente",
  "macrocategoria",
  "categoria",
  "semaforo",
  "filtroTipoSoggetto",
  "filtroConsenso",
] as const;

export type ChiaveSegmentoMultipla = (typeof CHIAVI_SEGMENTO_MULTIPLE)[number];

/** Converte un singolo valore salvato (stringa vecchia o array nuovo) in elenco. */
export function elencoFiltroSegmento(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string" && x !== "" && x !== "tutti");
  }
  if (typeof v === "string" && v !== "" && v !== "tutti") return [v];
  return [];
}

/**
 * Normalizza un oggetto filtri letto da segmenti_marketing.filtri: le sette
 * chiavi multiple diventano elenchi, le altre restano invariate.
 * Le chiavi multiple assenti restano assenti (si applicano i default del chiamante).
 */
export function normalizzaFiltriSegmento(f: unknown): Record<string, unknown> {
  let obj: unknown = f;
  if (typeof obj === "string") {
    try { obj = JSON.parse(obj); } catch { return {}; }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  for (const k of CHIAVI_SEGMENTO_MULTIPLE) {
    if (k in out) out[k] = elencoFiltroSegmento(out[k]);
  }
  return out;
}
