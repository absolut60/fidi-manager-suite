// Rendering PURO delle email delle Richieste interne (Strato 5).
// Nessun import di supabase, nessun side-effect. Costruisce il CORPO
// dell'evento (banda colorata + messaggio + box dettagli + CTA) e lo
// passa a wrapEmailHtml(..., { senzaBande: true, useCid }) che aggiunge
// header MADE, firma e footer sede (SENZA banda/box/IBAN del credito).

import {
  escapeHtml,
  wrapEmailHtml,
  type DatiMittente,
  type DatiSede,
} from "@/lib/template-email-render";

// ============================================================================
// EVENTI
// ============================================================================
export type RichiestaEvent =
  | "new_request"
  | "resp_approved"
  | "resp_forwarded"
  | "resp_rejected"
  | "dir_approved"
  | "dir_rejected"
  | "sollecito"
  | "info_request"
  | "messaggio_interno";

type EventCfg = { emoji: string; label: string; color: string };

export const EVENT_CFG: Record<RichiestaEvent, EventCfg> = {
  new_request: { emoji: "📋", label: "Nuova richiesta", color: "#0d1f3c" },
  resp_approved: { emoji: "✅", label: "Approvata - Resp. Generale", color: "#1a9e3a" },
  resp_forwarded: { emoji: "→", label: "Inoltrata alla Direzione", color: "#1d4ed8" },
  resp_rejected: { emoji: "❌", label: "Rifiutata - Resp. Generale", color: "#d42b2b" },
  dir_approved: { emoji: "🎉", label: "Approvata definitivamente", color: "#1a9e3a" },
  dir_rejected: { emoji: "❌", label: "Rifiutata - Direzione", color: "#d42b2b" },
  sollecito: { emoji: "⏰", label: "Sollecito approvazione", color: "#b45309" },
  info_request: { emoji: "💬", label: "Richiesta informazioni", color: "#6366f1" },
  messaggio_interno: { emoji: "💬", label: "Nuovo messaggio", color: "#0d1f3c" },
};

const TIPO_LABEL: Record<string, string> = {
  preventivo: "Approvazione preventivo",
  attivita: "Richiesta attivita",
  acquisto: "Acquisto materiali/servizi",
};

const DEST_LABEL_MSG: Record<string, string> = {
  tutti: "tutti i partecipanti",
  richiedente: "il richiedente",
  resp_generale: "il Responsabile Generale",
  direzione: "la Direzione",
  amministrativo: "l'Amministrazione",
};

// ============================================================================
// DATI RICHIESTA (subset stabile richiesto dal render)
// ============================================================================
export type RichiestaDati = {
  id: string;
  title: string;
  type: string;              // preventivo | attivita | acquisto
  description: string | null;
  amount: number | null;
  fornitore: string | null;
  requester_name: string | null;
  sede_name: string | null;
  resp_approver_name?: string | null;
  dir_approver_name?: string | null;
  resp_note?: string | null;
  dir_note?: string | null;
};

// Payload aggiuntivo per eventi conversazionali.
export type RichiestaEventExtra = {
  by?: string | null;
  dest?: string | null;      // richiedente | resp_generale | direzione | amministrativo | tutti
  nota?: string | null;      // sollecito
  testo?: string | null;     // info_request / messaggio_interno
};

// ============================================================================
// HELPERS
// ============================================================================
function fmtEuro(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return `EUR ${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`;
}

function shortId(id: string): string {
  return (id || "").slice(0, 8).toUpperCase();
}

function bandaHtml(cfg: EventCfg): string {
  return `
      <div style="background:${cfg.color};color:#ffffff;padding:10px 14px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;margin-bottom:16px;">
        <span style="font-size:16px;margin-right:6px;">${cfg.emoji}</span>${escapeHtml(cfg.label)}
      </div>`;
}

function boxDettagliHtml(r: RichiestaDati): string {
  const rows: Array<[string, string]> = [
    ["Titolo", escapeHtml(r.title || "-")],
    ["Tipo", escapeHtml(TIPO_LABEL[r.type] ?? r.type ?? "-")],
    ["Richiedente", escapeHtml(r.requester_name || "-")],
    ["Sede", escapeHtml(r.sede_name || "-")],
    ["Importo", escapeHtml(fmtEuro(r.amount))],
    ["Fornitore", escapeHtml(r.fornitore || "-")],
  ];
  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 8px;color:#6b7280;font-weight:600;width:120px;vertical-align:top;">${k}</td><td style="padding:4px 8px;color:#111827;">${v}</td></tr>`,
    )
    .join("");
  const descHtml = r.description
    ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #e5e7eb;color:#374151;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(r.description)}</div>`
    : "";
  return `
      <div style="background:#f9fafb;border:1px solid #e2e6ec;border-radius:6px;padding:12px 14px;margin:16px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;">
        <div style="color:#6b7280;font-weight:700;font-size:11px;letter-spacing:0.5px;margin-bottom:8px;">RICHIESTA #${shortId(r.id)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
        ${descHtml}
      </div>`;
}

function ctaHtml(appUrl: string, id: string): string {
  const href = `${appUrl.replace(/\/+$/, "")}/richieste-interne/${id}`;
  return `
      <div style="margin:20px 0 4px;">
        <a href="${href}" style="display:inline-block;background:#0d1f3c;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;">
          Apri la richiesta &rarr;
        </a>
      </div>`;
}

function boxNotaSollecito(nota: string): string {
  return `
      <div style="background:#fef9ec;border-left:3px solid #b45309;padding:10px 12px;margin:12px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#78350f;">
        <div style="font-weight:700;font-size:11px;letter-spacing:0.5px;margin-bottom:4px;">NOTA DEL SOLLECITO</div>
        <div style="font-style:italic;">"${escapeHtml(nota)}"</div>
      </div>`;
}

function boxMessaggio(colore: "indigo" | "azzurro", testo: string): string {
  const cfg =
    colore === "indigo"
      ? { bg: "#eef2ff", border: "#6366f1", text: "#312e81" }
      : { bg: "#f0f9ff", border: "#0d1f3c", text: "#0d1f3c" };
  return `
      <div style="background:${cfg.bg};border:1px solid ${cfg.border};border-radius:4px;padding:10px 12px;margin:12px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${cfg.text};">
        <div style="font-weight:700;font-size:11px;letter-spacing:0.5px;margin-bottom:4px;">MESSAGGIO</div>
        <div style="white-space:pre-wrap;">${escapeHtml(testo)}</div>
      </div>`;
}

// ============================================================================
// TESTI PER EVENTO
// ============================================================================
function messaggioPrincipale(
  event: RichiestaEvent,
  r: RichiestaDati,
  extra: RichiestaEventExtra | undefined,
): string {
  const respName = r.resp_approver_name?.trim() || "il Responsabile Generale";
  const dirName = r.dir_approver_name?.trim() || "la Direzione";
  const notaResp = r.resp_note?.trim() ? `\n\nNota: ${r.resp_note.trim()}` : "";
  const notaDir = r.dir_note?.trim() ? `\n\nNota: ${r.dir_note.trim()}` : "";

  switch (event) {
    case "new_request":
      return "Una nuova richiesta attende la tua approvazione come Responsabile Generale.";
    case "resp_approved":
      return `La tua richiesta e stata approvata da ${respName}. Puoi procedere.${notaResp}`;
    case "resp_forwarded":
      return `La richiesta e stata approvata da ${respName} e inoltrata alla Direzione per approvazione finale.${notaResp}`;
    case "resp_rejected":
      return `La tua richiesta e stata rifiutata da ${respName}.${notaResp}`;
    case "dir_approved":
      return `La tua richiesta e stata approvata definitivamente da ${dirName}. Puoi procedere.${notaDir}`;
    case "dir_rejected":
      return `La tua richiesta e stata rifiutata da ${dirName}.${notaDir}`;
    case "sollecito": {
      const by = extra?.by?.trim() || "Il richiedente";
      const dest = extra?.dest === "direzione" ? "Direzione" : "Responsabile Generale";
      return `${by} ha inviato un sollecito di approvazione alla ${dest} per la richiesta indicata di seguito.`;
    }
    case "info_request": {
      const by = extra?.by?.trim() || "L'amministrativo";
      return `${by} ha inviato una richiesta di informazioni riguardo alla richiesta indicata di seguito.`;
    }
    case "messaggio_interno": {
      const by = extra?.by?.trim() || "Un utente";
      const dest = DEST_LABEL_MSG[extra?.dest ?? "tutti"] ?? "tutti i partecipanti";
      return `${by} ha inviato un messaggio a ${dest} riguardo alla richiesta indicata di seguito.`;
    }
  }
}

function corpoEvento(
  event: RichiestaEvent,
  r: RichiestaDati,
  extra: RichiestaEventExtra | undefined,
  appUrl: string,
): string {
  const cfg = EVENT_CFG[event];
  const testo = messaggioPrincipale(event, r, extra);
  const messaggioHtml = `<div style="font-size:14px;line-height:1.55;color:#1f2937;white-space:pre-wrap;">${escapeHtml(testo)}</div>`;

  let boxExtra = "";
  if (event === "sollecito" && extra?.nota?.trim()) {
    boxExtra = boxNotaSollecito(extra.nota.trim());
  } else if (event === "info_request" && extra?.testo?.trim()) {
    boxExtra = boxMessaggio("indigo", extra.testo.trim());
  } else if (event === "messaggio_interno" && extra?.testo?.trim()) {
    boxExtra = boxMessaggio("azzurro", extra.testo.trim());
  }

  return `${bandaHtml(cfg)}${messaggioHtml}${boxExtra}${boxDettagliHtml(r)}${ctaHtml(appUrl, r.id)}`;
}

// ============================================================================
// OGGETTO
// ============================================================================
export function buildOggetto(
  event: RichiestaEvent,
  title: string,
  id: string,
): string {
  const cfg = EVENT_CFG[event];
  const t = title || "(senza titolo)";
  const idShort = shortId(id);
  if (event === "sollecito") return `⏰ Sollecito approvazione — ${t} [#${idShort}]`;
  if (event === "info_request") return `💬 Richiesta informazioni — ${t} [#${idShort}]`;
  return `${cfg.emoji} ${cfg.label} — ${t} [#${idShort}]`;
}

// ============================================================================
// ENTRY POINT
// ============================================================================
export type BuildRichiestaEmailInput = {
  event: RichiestaEvent;
  richiesta: RichiestaDati;
  sede: DatiSede | null;
  mittente: DatiMittente;
  extra?: RichiestaEventExtra;
  appUrl: string;
  useCid: boolean;
};

export type BuildRichiestaEmailResult = { oggetto: string; html: string };

export function buildRichiestaEmail(
  input: BuildRichiestaEmailInput,
): BuildRichiestaEmailResult {
  const corpo = corpoEvento(input.event, input.richiesta, input.extra, input.appUrl);
  const html = wrapEmailHtml(corpo, input.sede, input.mittente, {
    useCid: input.useCid,
    senzaBande: true,
  });
  return { oggetto: buildOggetto(input.event, input.richiesta.title, input.richiesta.id), html };
}
