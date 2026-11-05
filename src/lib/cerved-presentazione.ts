/**
 * Presentazione dei dati Cerved (client-safe, nessun import da *.server.ts).
 * Fonte unica di etichette semplici, colori del semaforo e stato attività.
 */

export type ScoreCervedVista = {
  codice_score: string | null;
  descrizione_score: string | null;
  valore: number | null;
  categoria_codice: string | null;
  categoria_descrizione: string | null;
  pd: number | null;
  trend_codice: string | null;
  trend_descrizione: string | null;
};

export const ETICHETTE_SCORE_CERVED: Record<string, string> = {
  SEM_CGS: "Semaforo Cerved",
  CGS: "Affidabilità Cerved",
  PAY: "Come paga gli altri fornitori",
  NEG: "Eventi negativi (protesti, pregiudizievoli, procedure)",
  ECOFIN: "Solidità economico-finanziaria",
  GOV: "Struttura e amministrazione",
  CNSL: "Richieste di informazioni su questa azienda",
  IMMO: "Patrimonio immobiliare",
};

export const ALTRI_SCORE_CERVED = ["PAY", "NEG", "ECOFIN", "GOV", "CNSL", "IMMO"] as const;

export function etichettaScoreCerved(s: { codice_score: string | null; descrizione_score: string | null }): string {
  const c = s.codice_score?.toUpperCase() ?? "";
  return ETICHETTE_SCORE_CERVED[c] ?? s.descrizione_score ?? (c || "Valutazione");
}

export type ColoreSemaforo = { classe: string; etichetta: string; tono: "verde" | "giallo" | "rosso" | "neutro" };

export function coloreSemaforo(categoria: string | null | undefined): ColoreSemaforo {
  switch ((categoria ?? "").trim().toUpperCase()) {
    case "V": return { tono: "verde", etichetta: "Verde", classe: "bg-success text-success-foreground" };
    case "G": return { tono: "giallo", etichetta: "Giallo", classe: "bg-warning text-warning-foreground" };
    case "R": return { tono: "rosso", etichetta: "Rosso", classe: "bg-destructive text-destructive-foreground" };
    default: return { tono: "neutro", etichetta: "Non disponibile", classe: "bg-muted text-muted-foreground" };
  }
}

/** Stato attività Cerved: "A" = normale; ogni altro codice va evidenziato in rosso. */
export function statoAttivitaAnomalo(codice: string | null | undefined): boolean {
  const c = (codice ?? "").trim().toUpperCase();
  if (!c) return false;
  return c.charAt(0) !== "A";
}

/** pd Cerved è una frazione: 0.0123 → "1,23%". */
export function formattaPdCerved(pd: number | null | undefined): string | null {
  if (pd == null || !Number.isFinite(pd)) return null;
  return `${(pd * 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function trovaScore(scores: ScoreCervedVista[], codice: string): ScoreCervedVista | null {
  return scores.find((s) => s.codice_score?.toUpperCase() === codice) ?? null;
}

/** ISO timestamp → "GG/MM/AAAA alle HH:MM" (ora di Roma). */
export function formattaAggiornatoIl(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const data = d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });
  const ora = d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  return `${data} alle ${ora}`;
}
