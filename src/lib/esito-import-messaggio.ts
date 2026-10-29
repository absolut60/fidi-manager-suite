// Fonte unica del testo dell'avviso di fine import (notifica in app + email).
// Modulo PURO: nessun accesso al database. Usato dal job Inngest
// `importazioni-esito-notifica` (src/lib/inngest/esito-import.server.ts).
import { buildEmailTemplate, escHtml } from "@/lib/email-template";

export type LivelloEsitoImport = "completato" | "da_verificare";

export type RigaAnomaliaImport = {
  codice_gestionale: string | null;
  ragione_sociale: string | null;
  valore_attuale: string | null;
  valore_nuovo?: string | null;
};

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
  scartate: Array<{ codice: string; motivo: string; righe: number }>;
  anomalie: Array<{ tipo: string; totale: number; righe: RigaAnomaliaImport[] }>;
  scadenzeTolteElenco: RigaAnomaliaImport[];
  /** FM54 osservazione: 'scadenza_ricollegabile' (nulla è stato spostato). */
  ricollegabili?: number;
  ricollegabiliConCollegamenti?: number;
  ricollegabiliElenco?: RigaAnomaliaImport[];
  /** FM54 osservazione: 'scadenza_collegamenti_persi'. */
  collegamentiPersi?: number;
  collegamentiPersiElenco?: RigaAnomaliaImport[];
  createdAt: string | null;
  completataAt: string | null;
};

/** Conteggi della coda " | azioni N | piani N | ... | segno_promemoria si/no". */
function conteggiOsservazione(v: string | null | undefined) {
  const t = v ?? "";
  const num = (k: string) => Number(new RegExp(`(?:^|\\| )${k} (\\d+)`).exec(t)?.[1] ?? 0);
  return {
    azioni: num("azioni"), piani: num("piani"), promemoria: num("promemoria"),
    solleciti: num("solleciti"), reminder: num("reminder"),
    segno: /segno_promemoria si/.test(t),
  };
}

export function haCollegamentiOsservazione(v: string | null | undefined): boolean {
  const c = conteggiOsservazione(v);
  return c.segno || c.azioni + c.piani + c.promemoria + c.solleciti + c.reminder > 0;
}

function testoCollegamenti(v: string | null | undefined): string {
  const c = conteggiOsservazione(v);
  const p = (q: number, s: string, pl: string) => (q > 0 ? `${n(q)} ${q === 1 ? s : pl}` : null);
  const parti = [
    p(c.azioni, "azione", "azioni"), p(c.piani, "piano", "piani"),
    p(c.promemoria, "promemoria", "promemoria"), p(c.solleciti, "sollecito", "solleciti"),
    p(c.reminder, "reminder", "reminder"), c.segno ? "segno promemoria" : null,
  ].filter(Boolean);
  return parti.length ? parti.join(", ") : "nessuno";
}

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

const MOTIVO_CLIENTE = "Cliente non presente in anagrafica";
const FONT = "font-family:Arial,Helvetica,sans-serif;";

function record(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

/** Normalizzazione pura dei report Gamma: nessuna selezione o scrittura di dati. */
export function dettaglioScartateImport(report: unknown, codici: string[] | null): DatiEsitoImport["scartate"] {
  const r = record(report);
  const clienti = record(r?.cliente_non_trovato);
  const scartate: DatiEsitoImport["scartate"] = clienti
    ? Object.entries(clienti).map(([codice, info]) => ({
        codice,
        motivo: MOTIVO_CLIENTE,
        righe: typeof record(info)?.count === "number" ? Number(record(info)?.count) : 1,
      }))
    : (codici ?? []).map((codice) => ({ codice, motivo: MOTIVO_CLIENTE, righe: 1 }));
  if (Array.isArray(r?.errori_riga)) {
    for (const errore of r.errori_riga) {
      const e = record(errore);
      if (typeof e?.errore !== "string") continue;
      scartate.push({ codice: typeof e.codice_gestionale === "string" ? e.codice_gestionale : "—", motivo: typeof e.riga === "number" ? `Riga ${n(e.riga)}: ${e.errore}` : e.errore, righe: 1 });
    }
  }
  return scartate;
}

function etichettaAnomalia(tipo: string): string {
  if (tipo === "perde_assicurazione") return "Perde l'assicurazione";
  if (tipo === "perde_gestione_legale") return "Esce dalla gestione legale";
  if (tipo === "email_corretta") return "Email corretta automaticamente";
  if (tipo === "email_da_verificare") return "Email da verificare in Gamma";
  return tipo.replace(/_/g, " ");
}

function valoreAnomalia(v: string | null | undefined): string {
  if (v === "true") return "Sì";
  if (v === "false") return "No";
  const data = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  return data ? `${data[3]}/${data[2]}/${data[1]}` : v || "—";
}

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
  const motivi: string[] = [];
  const clienti = d.scartate.filter((r) => r.motivo === MOTIVO_CLIENTE);
  if (clienti.length) {
    const codici = [...new Set(clienti.map((r) => r.codice))];
    const altri = codici.length > 5 ? ` e altri ${n(codici.length - 5)}` : "";
    motivi.push(`${n(clienti.reduce((tot, r) => tot + r.righe, 0))} scartate: clienti non in anagrafica (${codici.slice(0, 5).join(", ")}${altri})`);
  }
  const totaleAnomalie = d.anomalie.reduce((tot, a) => tot + a.totale, 0);
  if (totaleAnomalie) motivi.push(`${n(totaleAnomalie)} anomalie da controllare`);
  const errore = d.scartate.find((r) => r.motivo !== MOTIVO_CLIENTE);
  if (errore) motivi.push(errore.motivo.replace(/\s+/g, " ").slice(0, 160));
  parti.push(...motivi.slice(0, 2));
  const emailCorrette = d.anomalie.find((a) => a.tipo === "email_corretta")?.totale ?? 0;
  if (emailCorrette > 0) parti.push(`${n(emailCorrette)} ${emailCorrette === 1 ? "email corretta" : "email corrette"} automaticamente`);
  if (d.scadenzeTolte > 0) parti.push(`${n(d.scadenzeTolte)} scadenze tolte perché non più nel file`);
  if ((d.ricollegabiliConCollegamenti ?? 0) > 0) parti.push(`${n(d.ricollegabiliConCollegamenti ?? 0)} scadenze cambiate in Gamma con collegamenti da ricollegare`);
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
  const tabellaDettagli = (titoli: string[], righe: string[][]) =>
    `<table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px;">` +
    `<tr>${titoli.map((t) => `<td style="padding:6px;border-bottom:1px solid #e5e7eb;font-weight:700;">${escHtml(t)}</td>`).join("")}</tr>` +
    righe.map((r) => `<tr>${r.map((v) => `<td style="padding:6px;border-bottom:1px solid #e5e7eb;overflow-wrap:anywhere;">${escHtml(v)}</td>`).join("")}</tr>`).join("") + "</table>";
  const titoloSezione = (t: string) => `<h2 style="font-size:17px;margin:24px 0 10px;">${escHtml(t)}</h2>`;
  const righeScartate = d.scartate.length
    ? titoloSezione("Righe scartate") + tabellaDettagli(["Codice cliente", "Motivo", "Righe"], d.scartate.slice(0, 30).map((r) => [r.codice, r.motivo, n(r.righe)])) +
      (d.scartate.length > 30 ? `<p>e altre ${n(d.scartate.length - 30)} voci (${n(d.scartate.slice(30).reduce((tot, r) => tot + r.righe, 0))} righe)</p>` : "")
    : "";
  const anomalie = d.anomalie.length
    ? titoloSezione("Anomalie da controllare") + d.anomalie.map((a) =>
        `<h3 style="font-size:15px;margin:16px 0 8px;">${escHtml(etichettaAnomalia(a.tipo))} (${n(a.totale)})</h3>` +
        tabellaDettagli(["Codice", "Ragione sociale", "Prima", "Dopo"], a.righe.slice(0, 30).map((r) => [r.codice_gestionale ?? "—", r.ragione_sociale ?? "—", valoreAnomalia(r.valore_attuale), valoreAnomalia(r.valore_nuovo)])) +
        (a.totale > 30 ? `<p>e altre ${n(a.totale - 30)}</p>` : "")
      ).join("")
    : "";
  const dataScadenza = (v: string) => {
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/.exec(v);
    return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : v || "—";
  };
  const importo = (v: string) => {
    const normalizzato = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
    const valore = Number(normalizzato);
    return v && Number.isFinite(valore) ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(valore) : v || "—";
  };
  const scadenze = d.scadenzeTolteElenco.length
    ? titoloSezione("Scadenze tolte perché non più nel file") + tabellaDettagli(["Cliente", "Documento", "Scadenza", "Importo", "Stato"], d.scadenzeTolteElenco.slice(0, 30).map((r) => {
        const [documento = "", , data = "", valore = "", stato = ""] = (r.valore_attuale ?? "").split(" | ").map((v) => v.trim());
        return [[r.codice_gestionale, r.ragione_sociale].filter(Boolean).join(" — ") || "—", documento || "—", dataScadenza(data), importo(valore), stato || "—"];
      })) + (d.scadenzeTolte > 30 ? `<p>e altre ${n(d.scadenzeTolte - 30)}</p>` : "")
    : "";
  const cliente = (r: RigaAnomaliaImport) => [r.codice_gestionale, r.ragione_sociale].filter(Boolean).join(" — ") || "—";
  const parti5 = (v: string | null | undefined) => (v ?? "").split(" | ").map((x) => x.trim());
  const ricollegabiliElenco = d.ricollegabiliElenco ?? [];
  const ricollegabili = ricollegabiliElenco.length
    ? titoloSezione("Scadenze cambiate in Gamma — collegamenti da ricollegare (osservazione, nulla è stato spostato)") +
      tabellaDettagli(["Cliente", "Documento", "Variazione", "Collegamenti"], ricollegabiliElenco.map((r) => {
        const [doc = "", , dataO = "", impO = ""] = parti5(r.valore_attuale);
        const [, , dataN = "", impN = ""] = parti5(r.valore_nuovo);
        return [cliente(r), doc || "—", `dal ${dataScadenza(dataO)} ${importo(impO)} al ${dataScadenza(dataN)} ${importo(impN)}`, testoCollegamenti(r.valore_nuovo)];
      })) + ((d.ricollegabili ?? 0) > 30 ? `<p>e altre ${n((d.ricollegabili ?? 0) - 30)}</p>` : "")
    : "";
  const persiElenco = d.collegamentiPersiElenco ?? [];
  const persi = persiElenco.length
    ? titoloSezione("Collegamenti persi (documento non più nel file)") +
      tabellaDettagli(["Cliente", "Documento", "Scadenza", "Collegamenti"], persiElenco.map((r) => {
        const [doc = "", , dataO = "", impO = ""] = parti5(r.valore_attuale);
        return [cliente(r), doc || "—", `dal ${dataScadenza(dataO)} ${importo(impO)}`, testoCollegamenti(r.valore_nuovo)];
      })) + ((d.collegamentiPersi ?? 0) > 30 ? `<p>e altre ${n((d.collegamentiPersi ?? 0) - 30)}</p>` : "")
    : "";
  const body = `<p>Import <strong>${escHtml(etichettaFonteImport(d.fonte))}</strong> concluso.</p>${tabella}${righeScartate}${anomalie}${scadenze}${ricollegabili}${persi}${riquadro}`;
  const template = buildEmailTemplate({
    title: subject,
    body,
    ctaText: "Apri Import/Export",
    ctaUrl: `${appUrl.replace(/\/+$/, "")}/import-export`,
  });
  // Solo questa email: font esplicito anche nelle celle/header/footer del wrapper,
  // che Outlook non sempre eredita dal body. Il wrapper contiene già charset UTF-8.
  const html = template.replace(/<(td|th|p|li|h[1-6]|a|div|strong)\b([^>]*)>/gi, (_tag, nome: string, attributi: string) => {
    const attrs = /style="/.test(attributi)
      ? attributi.replace(/style="/, `style="${FONT}`)
      : `${attributi} style="${FONT}"`;
    return `<${nome}${attrs}>`;
  });
  return { subject, html };
}
