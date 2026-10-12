// Fonte unica del testo dell'avviso di fine import (notifica in app + email).
// Modulo PURO: nessun accesso al database. Usato dal job Inngest
// `importazioni-esito-notifica` (src/lib/inngest/esito-import.server.ts).
import { buildEmailTemplate, escHtml } from "@/lib/email-template";

export type LivelloEsitoImport = "completato" | "da_verificare";

export type DatiEsitoImport = {
  nomeFile: string | null;
  fonte: string | null;
  stato: string | null;
  righeTotali: number | null;
  righeCreate: number | null;
  righeAggiornate: number | null;
  righeErrore: number | null;
  righeSaltate: number | null;
  problemi: string[];
  scadenzeTolte: number;
  createdAt: string | null;
  completataAt: string | null;
};

const ETICHETTE_FONTE: Record<string, string> = {
  scadenziario: "Scadenziario",
  anagrafica: "Anagrafica clienti",
  blocco_fido_assicurazione: "Blocco fido e assicurazione",
  analisi_rischio: "Analisi rischio",
  eventi_partecipanti: "Partecipanti evento",
};

export function etichettaFonteImport(fonte: string | null): string {
  if (!fonte) return "sconosciuto";
  return ETICHETTE_FONTE[fonte] ?? fonte;
}

export function livelloEsitoImport(d: Pick<DatiEsitoImport, "problemi" | "stato">): LivelloEsitoImport {
  return d.problemi.length > 0 || d.stato === "fallita" ? "da_verificare" : "completato";
}

const n = (v: number | null) => new Intl.NumberFormat("it-IT").format(v ?? 0);

function scartate(d: DatiEsitoImport): number {
  return (d.righeSaltate ?? 0) + (d.righeErrore ?? 0);
}

export function titoloEsitoImport(d: DatiEsitoImport): string {
  const et = etichettaFonteImport(d.fonte);
  return livelloEsitoImport(d) === "da_verificare"
    ? `⚠️ Import ${et}: da verificare`
    : `Import ${et}: completato`;
}

export function messaggioEsitoImport(d: DatiEsitoImport): string {
  const parti = [
    `Righe lette ${n(d.righeTotali)}, create ${n(d.righeCreate)}, aggiornate ${n(d.righeAggiornate)}, scartate ${n(scartate(d))}`,
  ];
  if (d.scadenzeTolte > 0) parti.push(`${n(d.scadenzeTolte)} scadenze tolte perché non più nel file`);
  if (livelloEsitoImport(d) === "da_verificare") {
    parti.push(d.problemi[0] ?? "Import fallito");
  }
  return parti.join(" · ");
}

function dataOraRoma(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function durata(inizio: string | null, fine: string | null): string {
  if (!inizio || !fine) return "—";
  const ms = new Date(fine).getTime() - new Date(inizio).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

export function emailEsitoImport(d: DatiEsitoImport, appUrl: string): { subject: string; html: string } {
  const subject = titoloEsitoImport(d);
  const riga = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${escHtml(k)}</td><td style="padding:4px 0;font-weight:600;">${escHtml(v)}</td></tr>`;
  const tabella = `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:12px 0;">
${riga("File", d.nomeFile ?? "—")}
${riga("Inizio", dataOraRoma(d.createdAt))}
${riga("Fine", dataOraRoma(d.completataAt))}
${riga("Durata", durata(d.createdAt, d.completataAt))}
${riga("Righe lette", n(d.righeTotali))}
${riga("Create", n(d.righeCreate))}
${riga("Aggiornate", n(d.righeAggiornate))}
${riga("Scartate", n(scartate(d)))}
${riga("Scadenze tolte perché non più nel file", n(d.scadenzeTolte))}
</table>`;
  const elencoProblemi = d.problemi.length
    ? d.problemi
    : livelloEsitoImport(d) === "da_verificare"
      ? ["Import fallito"]
      : [];
  const riquadro = elencoProblemi.length
    ? `<div style="margin:16px 0;padding:12px 16px;border:1px solid #fca5a5;background:#fef2f2;border-radius:6px;color:#991b1b;">
<p style="margin:0 0 8px 0;font-weight:700;">Problemi rilevati</p>
<ul style="margin:0 0 8px 18px;padding:0;">${elencoProblemi.map((p) => `<li>${escHtml(p)}</li>`).join("")}</ul>
<p style="margin:0;font-weight:600;">Ripeti l'import o verifica il file.</p>
</div>`
    : "";
  const body = `<p>Import <strong>${escHtml(etichettaFonteImport(d.fonte))}</strong> concluso.</p>${tabella}${riquadro}`;
  const html = buildEmailTemplate({
    title: subject,
    body,
    ctaText: "Apri Import/Export",
    ctaUrl: `${appUrl.replace(/\/+$/, "")}/import-export`,
  });
  return { subject, html };
}
