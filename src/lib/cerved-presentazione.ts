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

/** "PAY_2" → 2; senza numero dopo "_" → null. */
export function livelloCategoria(categoria_codice: string | null | undefined): number | null {
  const m = /_(\d+)$/.exec((categoria_codice ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}

export type EsitoScore = "verde" | "ambra" | "rosso" | "neutro";

export const sigleEcofin = ["S1", "S2", "S3", "S4", "V1", "V2", "R1", "R2", "R3", "R4"] as const;

/** Fasce colore per score Cerved (livello da categoria_codice, es. "PAY_3"). */
export function esitoScore(codice_score: string | null | undefined, categoria_codice: string | null | undefined): EsitoScore {
  const liv = livelloCategoria(categoria_codice);
  if (liv == null) return "neutro";
  switch ((codice_score ?? "").trim().toUpperCase()) {
    case "PAY": return liv <= 2 ? "verde" : liv === 3 ? "ambra" : "rosso";
    case "NEG": return liv === 1 ? "verde" : liv <= 3 ? "ambra" : "rosso";
    case "GOV": return liv === 1 ? "verde" : liv === 2 ? "ambra" : "neutro";
    case "ECOFIN": return liv <= 4 ? "verde" : liv <= 6 ? "ambra" : liv <= 10 ? "rosso" : "neutro";
    case "CNSL": return liv === 1 ? "verde" : liv === 2 ? "ambra" : "rosso";
    default: return "neutro";
  }
}

/** 2419063 → "2,42 mln €"; 519363 → "519 mila €"; sotto 1.000 il valore intero. */
export function formattaEuroCompatto(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mln €`;
  if (a >= 1_000) return `${Math.round(n / 1_000).toLocaleString("it-IT")} mila €`;
  return `${Math.round(n).toLocaleString("it-IT")} €`;
}

/** Variazione % rispetto al precedente; null se precedente 0 o mancante. */
export function variazionePercentuale(attuale: number | null | undefined, precedente: number | null | undefined): number | null {
  if (attuale == null || precedente == null || !Number.isFinite(attuale) || !Number.isFinite(precedente) || precedente === 0) return null;
  return ((attuale - precedente) / Math.abs(precedente)) * 100;
}

/**
 * Gauge del Cerved Group Score come nel Light Report: arco di 270° in 8 settori uguali,
 * dal rosso (0) al verde salvia (100). Ogni settore ha tinta pastello (non attivo) e piena (attivo).
 */
export const SETTORI_GAUGE_CERVED = [
  { pastello: "#E8A39E", pieno: "#D2554E" },
  { pastello: "#F3E2A6", pieno: "#D9A928" },
  { pastello: "#E7EBC6", pieno: "#A8B144" },
  { pastello: "#DCE8C4", pieno: "#86A24E" },
  { pastello: "#BFE0C3", pieno: "#4FA866" },
  { pastello: "#C4E6D6", pieno: "#3A9E78" },
  { pastello: "#AEDCC8", pieno: "#2F8E6C" },
  { pastello: "#A9CFBF", pieno: "#2A7A61" },
] as const;

/** Settore attivo (0–7) del gauge: min(7, floor(valore / 12,5)); null se valore assente. */
export function settoreGaugeCerved(valore: number | null | undefined): number | null {
  if (valore == null || !Number.isFinite(valore)) return null;
  const v = Math.min(100, Math.max(0, valore));
  return Math.min(7, Math.floor(v / 12.5));
}

// ===== Light Report (dati da normalizzaLightReportXml) =====

const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"] as const;

/** "AAAA-MM-GG…" → "GG/MM/AAAA" (solo stringa, niente new Date). */
export function dataIsoIt(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Mese "11", anno "2025" → "nov 25". */
export function meseBreveIt(mese: string | null | undefined, anno: string | null | undefined): string {
  const n = Number(mese);
  const m = n >= 1 && n <= 12 ? MESI_BREVI[n - 1] : (mese ?? "?");
  return anno ? `${m} ${String(anno).slice(-2)}` : m;
}

export function formattaGiorniCerved(n: number | null | undefined): string | null {
  return n == null || !Number.isFinite(n) ? null : `${Math.round(n).toLocaleString("it-IT")} gg`;
}

/** Incidenza dello scaduto già espressa in percentuale da Cerved (es. 12,5 → "12,5%"). */
export function formattaPercentualeCerved(n: number | null | undefined): string | null {
  return n == null || !Number.isFinite(n) ? null : `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
}

export const ETICHETTE_LIGHT_REPORT = {
  fidoCertificato: "Fido certificato Cerved",
  payline: "Come paga gli altri fornitori (Payline)",
  richieste: "Richieste di informazioni (ultimi 12 mesi)",
  richiesteAiuto: "Quante volte banche e aziende hanno chiesto informazioni su questo cliente",
  immobili: "Patrimonio immobiliare",
  eventiStraordinari: "Eventi straordinari",
  omonimia: "Possibili protesti per omonimia (da verificare)",
  serieRichieste: [["banche_finanziarie", "Banche e finanziarie"], ["aziende", "Aziende"], ["altri", "Altri"]] as const,
  conteggiEventi: [["cessioni", "Cessioni"], ["fusioni", "Fusioni"], ["variazioni", "Variazioni"], ["liquidazioni", "Liquidazioni"], ["pignoramenti", "Pignoramenti"]] as const,
};

/** "Paga in 113 gg · concordati 115 gg". */
export function testoGiorniPayline(effettivi: number | null | undefined, concordati: number | null | undefined): string | null {
  const e = formattaGiorniCerved(effettivi);
  const c = formattaGiorniCerved(concordati);
  if (!e && !c) return null;
  return [e ? `Paga in ${e}` : null, c ? `concordati ${c}` : null].filter(Boolean).join(" · ");
}

/** "Il fido MADE è il 25% di quello certificato"; null se il certificato manca o è zero. */
export function testoConfrontoFido(fidoMade: number | null | undefined, certificato: number | null | undefined): string | null {
  if (certificato == null || !Number.isFinite(certificato) || certificato <= 0) return null;
  const perc = Math.round(((fidoMade ?? 0) / certificato) * 100);
  return `Il fido MADE è il ${perc.toLocaleString("it-IT")}% di quello certificato`;
}

/** true se la data ISO dell'evento è negli ultimi 24 mesi rispetto a oggi (AAAA-MM-GG, confronto tra stringhe). */
export function eventoRecenteCerved(dataIso: string | null | undefined, oggiIso: string): boolean {
  const m = /^(\d{4})-(\d{2}-\d{2})/.exec(dataIso ?? "");
  const o = /^(\d{4})-(\d{2}-\d{2})/.exec(oggiIso);
  if (!m || !o) return false;
  const limite = `${Number(o[1]) - 2}-${o[2]}`;
  return `${m[1]}-${m[2]}` >= limite;
}
