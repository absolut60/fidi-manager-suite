// Fonte UNICA per il calcolo e il rendering delle "spese di insoluto" RiBa
// nei solleciti (email + lettera + PDF). Modifica qui e cambia ovunque.
//
// Regola: per ogni scadenza il cui codice di pagamento inizia con "RB"
// (case-insensitive) si aggiunge una spesa fissa (configurabile in
// Impostazioni, default 3,00 €). Il TOTALE DA PAGARE mostrato nel sollecito
// è pari a somma di TUTTE le scadenze in lettera + spese.

import { escapeHtml, formatEuro, type ScadenzaSollecito } from "@/lib/template-email-render";

/** Predicato canonico "codice di pagamento RiBa" — regola dinamica startsWith. */
export function isRiBa(cod: string | null | undefined): boolean {
  if (!cod) return false;
  return /^rb/i.test(cod.trim());
}

export type SpeseInsolutoTotals = {
  totaleScaduto: number;      // somma di TUTTE le scadenze (RiBa e non)
  nRiba: number;              // numero di scadenze con codice RB*
  importoUnitario: number;    // €/RiBa configurato in Impostazioni
  speseInsoluto: number;      // nRiba * importoUnitario
  totaleDaPagare: number;     // totaleScaduto + speseInsoluto
};

/**
 * Calcolo unico dei totali del sollecito (scaduto + spese + da pagare).
 * `importoUnitario` deve provenire dalla configurazione `spese_insoluto_riba_eur`.
 */
export function calcolaSpeseInsoluto(
  scadenze: ScadenzaSollecito[],
  importoUnitario: number,
): SpeseInsolutoTotals {
  const totaleScaduto = scadenze.reduce((a, s) => a + Number(s.importo_scadenza ?? 0), 0);
  const nRiba = scadenze.reduce((n, s) => n + (isRiBa(s.codice_pagamento) ? 1 : 0), 0);
  const unit = Number.isFinite(importoUnitario) && importoUnitario > 0 ? importoUnitario : 0;
  const speseInsoluto = nRiba * unit;
  return {
    totaleScaduto,
    nRiba,
    importoUnitario: unit,
    speseInsoluto,
    totaleDaPagare: totaleScaduto + speseInsoluto,
  };
}

/**
 * Righe HTML da appendere al `<tfoot>` della tabella scadenze.
 * Rende: Totale scaduto — Spese di insoluto (n × €X) — Totale da pagare.
 * Se non ci sono RiBa, ritorna SOLO la riga "Totale" (comportamento invariato).
 */
export function buildTotaliRowsHtml(
  totals: SpeseInsolutoTotals,
  opts?: { labelTotale?: string; colspan?: number },
): string {
  const cs = opts?.colspan ?? 3;
  const cellL = `padding:6px 10px;border:1px solid #e2e8f0;text-align:right;`;
  const cellR = `padding:6px 10px;border:1px solid #e2e8f0;text-align:right;`;
  if (totals.nRiba === 0) {
    const label = opts?.labelTotale ?? "Totale";
    return `<tr style="background:#f8fafc;font-weight:600;">
      <td colspan="${cs}" style="${cellL}">${escapeHtml(label)}</td>
      <td style="${cellR}">${escapeHtml(formatEuro(totals.totaleScaduto))}</td>
    </tr>`;
  }
  const speseLabel = `Spese di insoluto (${totals.nRiba} × ${formatEuro(totals.importoUnitario)})`;
  return `<tr style="background:#f8fafc;">
      <td colspan="${cs}" style="${cellL}">Totale scaduto</td>
      <td style="${cellR}">${escapeHtml(formatEuro(totals.totaleScaduto))}</td>
    </tr>
    <tr style="background:#f8fafc;">
      <td colspan="${cs}" style="${cellL}">${escapeHtml(speseLabel)}</td>
      <td style="${cellR}">${escapeHtml(formatEuro(totals.speseInsoluto))}</td>
    </tr>
    <tr style="background:#eff6ff;font-weight:700;">
      <td colspan="${cs}" style="${cellL};color:#0d1f3c;">Totale da pagare</td>
      <td style="${cellR};color:#0d1f3c;">${escapeHtml(formatEuro(totals.totaleDaPagare))}</td>
    </tr>`;
}

/** Blocco testuale (lettera cartacea/PDF) da appendere all'elenco scadenze. */
export function buildTotaliBloccoTesto(totals: SpeseInsolutoTotals): string {
  if (totals.nRiba === 0) {
    return `  TOTALE: ${formatEuro(totals.totaleScaduto)}`;
  }
  const speseLabel = `Spese di insoluto (${totals.nRiba} × ${formatEuro(totals.importoUnitario)})`;
  return [
    `  Totale scaduto: ${formatEuro(totals.totaleScaduto)}`,
    `  ${speseLabel}: ${formatEuro(totals.speseInsoluto)}`,
    `  TOTALE DA PAGARE: ${formatEuro(totals.totaleDaPagare)}`,
  ].join("\n");
}
