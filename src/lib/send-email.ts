import { supabase } from "@/integrations/supabase/client";
import { LOGO_MADE_BASE64 } from "@/lib/logo-made-base64";

function escHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: options,
    });
    if (error) {
      console.error("Errore sendEmail:", error);
      return false;
    }
    return (data as { ok?: boolean } | null)?.ok ?? false;
  } catch (err) {
    console.error("Errore sendEmail:", err);
    return false;
  }
}

// Template base email FidiManager
export function buildEmailTemplate(options: {
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}): string {
  const { title, body, ctaText, ctaUrl } = options;
  const cta =
    ctaText && ctaUrl
      ? `<div style="margin:24px 0;">
           <a href="${ctaUrl}" style="display:inline-block;background:#1e3a8a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">
             ${ctaText} →
           </a>
         </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
            <tr>
              <td style="background:#0f1e3d;padding:20px 24px;color:#ffffff;">
                <img src="data:image/png;base64,${LOGO_MADE_BASE64}" alt="MADE" width="140" style="display:block;height:auto;filter:brightness(0) invert(1);margin-bottom:6px;" />
                <div style="font-size:12px;opacity:.8;">FidiManager · Gruppo MADE</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                <h1 style="margin:0 0 12px;font-size:20px;color:#0f1e3d;">${title}</h1>
                <div style="font-size:14px;line-height:1.6;color:#374151;">${body}</div>
                ${cta}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
                Email generata automaticamente da FidiManager — Gruppo MADE.<br/>
                Non rispondere a questa email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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

  const dataFirmaFormatted = new Date(dataFirma).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return sendEmail({
    to: toEmail,
    subject: `Informativa Privacy GDPR — ${ragioneSociale}`,
    html: buildEmailTemplate({
      title: "Informativa Privacy GDPR firmata",
      body: `
        <p>Gentile ${escHtml(toName)},</p>
        <p>in allegato trova copia dell'informativa sulla privacy (GDPR Rev.06) firmata in data <strong>${escHtml(dataFirmaFormatted)}</strong> per conto di <strong>${escHtml(ragioneSociale)}</strong>.</p>
        <p>Il documento è conservato nei nostri archivi. Per qualsiasi informazione o per esercitare i suoi diritti ai sensi del GDPR, può contattarci all'indirizzo <a href="mailto:gdpr-md@madepoint.it">gdpr-md@madepoint.it</a>.</p>
      `,
    }),
    ...(pdfBase64
      ? {
          attachments: [
            {
              filename: `Privacy_GDPR_${ragioneSociale.replace(/[^a-zA-Z0-9]/g, "_")}_${dataFirmaFormatted.replace(/\s/g, "_")}.pdf`,
              content: pdfBase64,
              contentType: "application/pdf",
            },
          ],
        }
      : {}),
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
