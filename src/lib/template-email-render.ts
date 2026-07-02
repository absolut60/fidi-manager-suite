// Helpers PURI per il rendering dei template email.
// NIENTE import di supabase: questo modulo deve poter girare sia nel browser
// sia nel worker Inngest. Mantieni questo file privo di side-effect.

export type PlaceholderKey =
  | "ragione_sociale"
  | "totale_scaduto"
  | "spese_insoluto"
  | "totale_da_pagare"
  | "n_riba"
  | "elenco_scadenze"
  | "data_oggi"
  | "nome_operatore";

export const PLACEHOLDERS: { key: PlaceholderKey; label: string; descr: string; soloCorpo?: boolean }[] = [
  { key: "ragione_sociale", label: "{{ragione_sociale}}", descr: "Denominazione del cliente" },
  { key: "totale_scaduto", label: "{{totale_scaduto}}", descr: "Somma delle scadenze in lettera (senza spese)" },
  { key: "spese_insoluto", label: "{{spese_insoluto}}", descr: "Spese di insoluto (nRiBa × importo unitario) — 0 € se nessuna RiBa" },
  { key: "totale_da_pagare", label: "{{totale_da_pagare}}", descr: "Totale scaduto + spese di insoluto RiBa" },
  { key: "n_riba", label: "{{n_riba}}", descr: "Numero di scadenze RiBa in lettera" },
  { key: "elenco_scadenze", label: "{{elenco_scadenze}}", descr: "Tabella HTML delle scadenze scadute (include righe spese/totale)", soloCorpo: true },
  { key: "data_oggi", label: "{{data_oggi}}", descr: "Data odierna", soloCorpo: true },
  { key: "nome_operatore", label: "{{nome_operatore}}", descr: "Nome dell'operatore", soloCorpo: true },
];

const fmtEuro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const fmtData = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

export function formatEuro(n: number | null | undefined): string {
  return fmtEuro.format(Number(n ?? 0));
}

export function formatDateIt(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return fmtData.format(date);
}

export type ScadenzaSollecito = {
  numero_documento: string | null;
  data_documento: string | null;
  data_scadenza: string | null;
  importo_scadenza: number | null;
  // Codice di pagamento della SINGOLA riga (fonte per il predicato isRiBa).
  // Popolato dai loader dei solleciti da public.scadenze.codice_pagamento.
  codice_pagamento?: string | null;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildElencoScadenzeHtml(
  scadenze: ScadenzaSollecito[],
  opts?: { labelTotale?: string; labelEmpty?: string },
): string {
  if (!scadenze.length) {
    return `<p style="margin:8px 0;color:#475569;">${escapeHtml(opts?.labelEmpty ?? "Nessuna scadenza scaduta al momento.")}</p>`;
  }
  const totale = scadenze.reduce((acc, s) => acc + Number(s.importo_scadenza ?? 0), 0);
  const labelTot = opts?.labelTotale ?? "Totale";
  const rows = scadenze
    .map(
      (s) => `<tr>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">${escapeHtml(s.numero_documento ?? "—")}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">${escapeHtml(formatDateIt(s.data_documento))}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">${escapeHtml(formatDateIt(s.data_scadenza))}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatEuro(s.importo_scadenza))}</td>
      </tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;border:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:13px;margin:8px 0;">
    <thead><tr style="background:#f1f5f9;">
      <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Documento</th>
      <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Data doc.</th>
      <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Scadenza</th>
      <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;">Importo</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#f8fafc;font-weight:600;">
      <td colspan="3" style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;">${escapeHtml(labelTot)}</td>
      <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatEuro(totale))}</td>
    </tr></tfoot>
  </table>`;
}

export type DatiTemplate = {
  ragione_sociale: string;
  scadenze: ScadenzaSollecito[];
  nome_operatore: string;
};

export type RenderedTemplate = { oggetto: string; corpo: string };

export function renderTemplate(
  template: { oggetto: string; corpo: string },
  dati: DatiTemplate,
  opts?: { tipo?: string | null },
): RenderedTemplate {
  const totale = dati.scadenze.reduce((a, s) => a + Number(s.importo_scadenza ?? 0), 0);
  const isPromemoria = opts?.tipo === "promemoria_scadenza";
  const elenco = buildElencoScadenzeHtml(dati.scadenze, {
    labelTotale: isPromemoria ? "Totale in scadenza" : "Totale",
    labelEmpty: isPromemoria
      ? "Nessuna scadenza in arrivo nel periodo selezionato."
      : "Nessuna scadenza scaduta al momento.",
  });
  const values: Record<PlaceholderKey, string> = {
    ragione_sociale: escapeHtml(dati.ragione_sociale ?? ""),
    totale_scaduto: formatEuro(totale),
    elenco_scadenze: elenco,
    data_oggi: formatDateIt(new Date()),
    nome_operatore: escapeHtml(dati.nome_operatore ?? ""),
  };
  return {
    oggetto: replaceAll(template.oggetto ?? "", values),
    corpo: replaceAll(template.corpo ?? "", values),
  };
}

function replaceAll(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key) => {
    const k = String(key).trim().toLowerCase();
    return k in values ? values[k] : "";
  });
}

// Replica della logica di `classificaScadenza` ma senza dipendenze esterne,
// per uso nel worker Inngest. Fonte di verita': SOLO stato_contabile +
// data_scadenza (allineata al gestionale). data_pagamento_effettiva e
// tempi_scadenza NON entrano nella classificazione.
export function isScaduto(s: {
  stato_contabile?: string | null;
  data_pagamento_effettiva?: string | null;
  data_scadenza?: string | null;
  giorni_ritardo?: number | null;
  tempi_scadenza?: string | null;
}): boolean {
  if (s.stato_contabile !== "Aperta") return false;
  if (s.data_scadenza) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(s.data_scadenza);
    d.setHours(0, 0, 0, 0);
    return d < today;
  }
  return Number(s.giorni_ritardo ?? 0) > 0;
}

// =============================================================================
// RIFERIMENTI BANCARI (fonte UNICA — modifica qui per aggiornarli ovunque)
// =============================================================================
// Vengono iniettati automaticamente in `wrapEmailHtml` per i template che
// riguardano un pagamento (promemoria + solleciti + messa in mora). Per i
// template "libero" o sconosciuti non vengono aggiunti.
export const RIFERIMENTI_BANCARI = {
  beneficiario: "Made Distribuzione S.p.A.",
  banca: "Intesa Sanpaolo",
  iban: "IT74Y0306902505100000005423",
} as const;

export function buildRiferimentiBancariHtml(): string {
  const { beneficiario, banca, iban } = RIFERIMENTI_BANCARI;
  return `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-collapse:separate;">
            <tr>
              <td style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0d1f3c;border-radius:4px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#1f2937;">
                <div style="font-weight:700;margin-bottom:8px;color:#0d1f3c;">Coordinate bancarie per il pagamento</div>
                <div><span style="color:#64748b;">Beneficiario:</span> <strong>${escapeHtml(beneficiario)}</strong></div>
                <div><span style="color:#64748b;">Banca:</span> ${escapeHtml(banca)}</div>
                <div style="margin-top:4px;"><span style="color:#64748b;">IBAN:</span> <strong style="font-family:'Courier New',Consolas,monospace;letter-spacing:0.5px;white-space:nowrap;word-break:keep-all;">${escapeHtml(iban)}</strong></div>
              </td>
            </tr>
          </table>`;
}

function tipoRichiedeRiferimentiBancari(tipo: string | null | undefined): boolean {
  return (
    tipo === "promemoria_scadenza" ||
    tipo === "sollecito_1" ||
    tipo === "sollecito_2" ||
    tipo === "messa_in_mora"
  );
}

// =============================================================================
// CORNICE HTML EMAIL (header con logo, footer con dati sede)
// =============================================================================

// Logo MADE servito dal CDN Lovable (URL stabile, immutabile, pubblico).
// Verificato 200 OK; usato nell'<img> dell'header email.
export const LOGO_EMAIL_URL =
  "https://fidi-manager-suite.lovable.app/__l5e/assets-v1/035e2dea-71e9-4ef5-a16d-94aee28def35/logo-made.png";

// Display name fisso del mittente (richiesto da branding).
// L'indirizzo email del from resta quello SMTP autenticato lato edge function;
// il Reply-To dinamico (email operatore) viene impostato dal chiamante.
export const FROM_NAME_ISTITUZIONALE = "Recupero Crediti MADE";

export type DatiSede = {
  nome: string | null;        // es. "SEDE DI LISSONE"
  insegna: string | null;     // es. "CMV | MADE"
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  telefono: string | null;
};

export type DatiMittente = {
  nome: string;   // "Andrea Giani"
  email?: string | null;
};

// Sede amministrativa di fallback (vedi memoria progetto)
export const SEDE_FALLBACK: DatiSede = {
  nome: "SEDE AMMINISTRATIVA",
  insegna: null,
  indirizzo: "Via G. Di Vittorio, 3",
  cap: "20003",
  citta: "Casorezzo",
  provincia: "MI",
  telefono: "02 90380000",
};

// Costruisce le due righe del footer-sede (nome in grassetto + insegna/indirizzo).
// Restituisce HTML pronto da inserire prima del blocco legale fisso.
function formatSedeBlock(s: DatiSede | null | undefined): string {
  const sede = s && (s.indirizzo || s.citta || s.telefono) ? s : SEDE_FALLBACK;
  const nome = (sede.nome ?? "").trim() || "SEDE AMMINISTRATIVA";
  const indir = sede.indirizzo ? sede.indirizzo.trim() : "";
  const cap = sede.cap ? sede.cap.trim() : "";
  const city = sede.citta ? sede.citta.trim() : "";
  const prov = sede.provincia ? `(${sede.provincia.trim()})` : "";
  const tel = sede.telefono ? sede.telefono.trim() : "";
  const insegna = sede.insegna ? sede.insegna.trim() : "";

  const indPart = [indir, [cap, city, prov].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  // RIGA 2: "<INSEGNA> - <indirizzo>" + opzionale " - Tel. <tel>"
  const r2Parts: string[] = [];
  if (insegna) r2Parts.push(insegna);
  if (indPart) r2Parts.push(indPart);
  let riga2 = r2Parts.join(" - ");
  if (tel) riga2 = riga2 ? `${riga2} - Tel. ${tel}` : `Tel. ${tel}`;

  return `
            <div style="color:#1f2937;font-weight:700;font-size:12px;letter-spacing:0.3px;">${escapeHtml(nome)}</div>
            ${riga2 ? `<div style="color:#374151;font-size:12px;margin-top:2px;">${escapeHtml(riga2)}</div>` : ""}`;
}

// =============================================================================
// ESCALATION VISIVA SOLLECITI — derivata dal `tipo` del template
// =============================================================================
// Livello 1 (blu/navy)    -> sollecito_1 / libero (default neutro)
// Livello 2 (arancione)   -> sollecito_2
// Livello 3 (rosso)       -> messa_in_mora
// La banda colorata sta TRA l'header MADE e il corpo; il box conseguenze sta
// SUBITO PRIMA della firma. Stili tutti inline (compatibilita Outlook).
export type TipoTemplate = "promemoria_scadenza" | "sollecito_1" | "sollecito_2" | "messa_in_mora" | "libero" | string;

/**
 * Mappa il "tipo" del template_email al livello di escalation del sollecito.
 * Restituisce null per i tipi che non partecipano all'escalation
 * (promemoria_scadenza, libero o sconosciuti).
 */
export function livelloSollecitoFromTipo(tipo: string | null | undefined): 1 | 2 | 3 | null {
  if (tipo === "sollecito_1") return 1;
  if (tipo === "sollecito_2") return 2;
  if (tipo === "messa_in_mora") return 3;
  return null;
}

type LivelloConfig = {
  livello: 0 | 1 | 2 | 3;
  livelloLabel: string; // es. "CORTESIA", "LIV. 1/3"
  bandBg: string;
  bandBorder: string;
  bandText: string;
  label: string;
  icon: string;
  uppercase: boolean;
  boxBg: string;
  boxBorder: string;
  boxTextColor: string;
  boxTitle: string;
  boxBody: string;
};

export function getLivelloConfig(tipo: string | null | undefined): LivelloConfig {
  switch (tipo) {
    case "promemoria_scadenza":
      return {
        livello: 0,
        livelloLabel: "CORTESIA",
        bandBg: "#ecfdf5",
        bandBorder: "#059669",
        bandText: "#065f46",
        label: "Promemoria di scadenza",
        icon: "&#128197;", // 📅
        uppercase: false,
        boxBg: "#ecfdf5",
        boxBorder: "#059669",
        boxTextColor: "#065f46",
        boxTitle: "Avviso di cortesia",
        boxBody:
          "Questa comunicazione ha valore di semplice promemoria sulle scadenze in arrivo. Nessun importo risulta ancora scaduto. Se ha gia provveduto al pagamento, La preghiamo di non tenere conto della presente.",
      };
    case "sollecito_2":
      return {
        livello: 2,
        livelloLabel: "LIV. 2/3",
        bandBg: "#fff7ed",
        bandBorder: "#fb923c",
        bandText: "#9a3412",
        label: "Secondo sollecito di pagamento",
        icon: "&#9888;",
        uppercase: false,
        boxBg: "#fff7ed",
        boxBorder: "#fb923c",
        boxTextColor: "#7c2d12",
        boxTitle: "Posizione ancora aperta",
        boxBody:
          "Nonostante il precedente sollecito, la Sua posizione contabile risulta ancora aperta. La invitiamo a provvedere con urgenza al saldo degli importi indicati per evitare l'aggravamento della procedura di recupero.",
      };
    case "messa_in_mora":
      return {
        livello: 3,
        livelloLabel: "LIV. 3/3",
        bandBg: "#dc2626",
        bandBorder: "#b91c1c",
        bandText: "#ffffff",
        label: "Messa in mora — Diffida ad adempiere",
        icon: "&#9940;",
        uppercase: true,
        boxBg: "#fef2f2",
        boxBorder: "#dc2626",
        boxTextColor: "#7f1d1d",
        boxTitle: "Diffida formale ad adempiere",
        boxBody:
          "Con la presente La costituiamo formalmente in mora ai sensi e per gli effetti dell'art. 1219 c.c. In mancanza di pagamento entro 7 giorni dal ricevimento, la pratica sara trasmessa al nostro Ufficio Legale per il recupero coattivo del credito, con addebito di interessi di mora ex D.Lgs 231/2002, spese di recupero ed oneri accessori, senza ulteriore preavviso.",
      };
    default:
      return {
        livello: 1,
        livelloLabel: "LIV. 1/3",
        bandBg: "#eff6ff",
        bandBorder: "#bfdbfe",
        bandText: "#1e3a8a",
        label: "Primo sollecito di pagamento",
        icon: "&#9432;",
        uppercase: false,
        boxBg: "#f8fafc",
        boxBorder: "#bfdbfe",
        boxTextColor: "#1e3a8a",
        boxTitle: "Invito al pagamento",
        boxBody:
          "La invitiamo cortesemente a regolarizzare la posizione provvedendo al pagamento degli importi indicati. Qualora avesse gia effettuato il pagamento, La preghiamo di considerare nulla la presente comunicazione.",
      };
  }
}

export function wrapEmailHtml(
  corpoRenderizzato: string,
  datiSede: DatiSede | null | undefined,
  datiMittente: DatiMittente,
  opts?: { useCid?: boolean; tipo?: TipoTemplate | null; senzaBande?: boolean },
): string {
  const sedeBlock = formatSedeBlock(datiSede);

  const operatore = escapeHtml(datiMittente.nome || "Operatore");
  const operatoreEmail = datiMittente.email
    ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(datiMittente.email)}</div>`
    : "";

  // In email reale (useCid=true) puntiamo all'allegato inline cid:logoMade
  // (id senza trattini: alcuni parser MIME legacy — Outlook desktop incluso —
  // hanno problemi con i trattini nel Content-ID). Bypassa i proxy aziendali
  // che bloccano immagini remote.
  // In anteprima (default) usiamo l'URL pubblico, perche cid: non viene risolto nel browser.
  const imgSrc = opts?.useCid ? "cid:logoMade" : LOGO_EMAIL_URL;

  const cfg = getLivelloConfig(opts?.tipo ?? null);
  const labelStyle = cfg.uppercase
    ? "text-transform:uppercase;letter-spacing:1px;font-weight:700;"
    : "font-weight:600;";

  const bandHtml = `
      <tr>
        <td style="background:${cfg.bandBg};border-bottom:2px solid ${cfg.bandBorder};padding:10px 24px;font-family:Arial,Helvetica,sans-serif;color:${cfg.bandText};font-size:13px;${labelStyle}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;width:24px;font-size:16px;line-height:1;">${cfg.icon}</td>
            <td style="vertical-align:middle;">${escapeHtml(cfg.label)}</td>
            <td align="right" style="vertical-align:middle;font-size:11px;font-weight:600;letter-spacing:0.5px;opacity:.85;">${cfg.livelloLabel}</td>
          </tr></table>
        </td>
      </tr>`;

  const boxHtml = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-collapse:separate;">
            <tr>
              <td style="background:${cfg.boxBg};border:1px solid ${cfg.boxBorder};border-left:4px solid ${cfg.boxBorder};border-radius:4px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:${cfg.boxTextColor};">
                <div style="font-weight:700;margin-bottom:6px;${cfg.uppercase ? "text-transform:uppercase;letter-spacing:0.5px;" : ""}">${escapeHtml(cfg.boxTitle)}</div>
                <div>${escapeHtml(cfg.boxBody)}</div>
              </td>
            </tr>
          </table>`;

  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Sollecito</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr>
        <td style="background:#0d1f3c;padding:18px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">
              <a href="https://www.gruppomade.eu" style="text-decoration:none;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:2px;">
                <img src="${imgSrc}" alt="MADE" width="160" height="22" style="display:block;border:0;outline:none;text-decoration:none;background:transparent;max-width:160px;height:auto;" />
              </a>
            </td>
            <td align="right" style="vertical-align:middle;color:#ffffff;font-size:11px;font-family:Arial,Helvetica,sans-serif;">
              <div style="opacity:.85;">Gruppo MADE</div>
              <div style="opacity:.6;font-size:10px;">Amministrazione &amp; Crediti</div>
            </td>
          </tr></table>
        </td>
      </tr>
      ${opts?.senzaBande ? "" : bandHtml}
      <tr>
        <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;">
          ${corpoRenderizzato}
          ${opts?.senzaBande ? "" : boxHtml}
          ${!opts?.senzaBande && tipoRichiedeRiferimentiBancari(opts?.tipo ?? null) ? buildRiferimentiBancariHtml() : ""}
          <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:13px;color:#374151;">
            <div style="font-weight:600;color:#0d1f3c;">${operatore}</div>
            ${operatoreEmail}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#6b7280;">
          ${sedeBlock}
          <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e5e7eb;font-size:10px;color:#9ca3af;line-height:1.45;">
            <strong style="color:#6b7280;">MADE DISTRIBUZIONE S.p.A.</strong><br/>
            Sede Legale: Corso di Porta Nuova 11, 20121 Milano (MI) — C.F. e P.IVA 10126430965 — REA Milano MI 2507310<br/>
            PEC: madedistribuzionesrl@pecplus.it — Capitale Sociale 2.593.000,00 € i.v.<br/>
            Società sotto la Direzione e il Coordinamento di MADE Italia S.p.A.
          </div>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
