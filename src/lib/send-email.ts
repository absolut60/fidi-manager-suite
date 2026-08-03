import { supabase } from "@/integrations/supabase/client";
import {
  escHtml,
  buildEmailTemplate,
  buildPrivacyPdfEmailPayload,
} from "@/lib/email-template";

export { buildEmailTemplate, buildPrivacyPdfEmailPayload };
import {
  valutaEsitoEmail,
  type EsitoEmail,
  type CorpoRispostaEmail,
} from "@/lib/email-esito";

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  fromName?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    contentType: string;
  }>;
  inlineLogo?: boolean;
}

/**
 * Invio email con esito DETTAGLIATO: usa la valutazione centralizzata
 * (`valutaEsitoEmail`) — un 207 o un corpo con ok:false NON è successo.
 */
export async function sendEmailDetailed(options: SendEmailOptions): Promise<EsitoEmail> {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: options,
    });
    if (error) {
      // supabase-js incapsula la risposta HTTP non-2xx in error.context.
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.text === "function") {
        const txt = await ctx.text().catch(() => "");
        return valutaEsitoEmail(ctx.status ?? 0, null, txt);
      }
      console.error("Errore sendEmail:", error);
      return { ok: false, err: error.message ?? "Invio email fallito" };
    }
    // Risposta 2xx: 200 con ok:true è l'unico successo; 207 arriva qui con
    // ok:false / results[] contenenti il fallimento SMTP reale.
    const body = data as CorpoRispostaEmail | null;
    const status = body?.ok === true && !(body.results ?? []).some((r) => r?.ok === false) ? 200 : 207;
    return valutaEsitoEmail(status, body);
  } catch (err) {
    console.error("Errore sendEmail:", err);
    return { ok: false, err: err instanceof Error ? err.message : String(err) };
  }
}

/** Variante booleana retrocompatibile. */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  return (await sendEmailDetailed(options)).ok;
}

export async function sendPrivacyPdf(options: {
  toEmail: string;
  toName: string;
  ragioneSociale: string;
  dataFirma: string;
  pdfUrl: string;
}): Promise<boolean> {
  const { toEmail, toName, ragioneSociale, dataFirma, pdfUrl } = options;

  let pdfBase64: string | null = null;
  try {
    const res = await fetch(pdfUrl);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    pdfBase64 = btoa(binary);
  } catch (e) {
    console.error("Errore download PDF privacy:", e);
  }

  return sendEmail({
    to: toEmail,
    ...buildPrivacyPdfEmailPayload({ toName, ragioneSociale, dataFirma, pdfBase64 }),
  });
}

export async function sendNotificaComunicazione(options: {
  toEmail: string;
  toName: string;
  autoreNome: string;
  richiestaId: string;
  testo: string;
  appUrl: string;
}): Promise<boolean> {
  const { toEmail, toName, autoreNome, richiestaId, testo, appUrl } = options;
  const safeTesto = testo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  return sendEmail({
    to: toEmail,
    subject: `💬 Nuovo messaggio sulla richiesta fido`,
    html: buildEmailTemplate({
      title: "Nuovo messaggio sulla tua richiesta fido",
      body: `
        <p>Gentile ${escHtml(toName)},</p>
        <p><strong>${escHtml(autoreNome)}</strong> ha inviato un messaggio sulla richiesta fido:</p>
        <blockquote style="margin:16px 0;padding:12px 16px;background:#f3f4f6;border-left:3px solid #1e3a8a;border-radius:4px;color:#374151;font-style:italic;">
          ${safeTesto}
        </blockquote>
        <p>Accedi a FidiManager per rispondere.</p>
      `,
      ctaText: "Vai alla richiesta",
      ctaUrl: `${appUrl}/richieste/${richiestaId}`,
    }),
  });
}
