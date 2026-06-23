import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.16";
import { LOGO_MADE_BASE64 } from "./logo-made.ts";

// Content-ID fisso usato dal template (<img src="cid:logoMade">).
// Senza trattini per evitare bug di parser legacy.
const LOGO_CID = "logoMade";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailAttachment {
  filename: string;
  content: string; // base64
  contentType: string;
}

interface EmailPayload {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  fromName?: string;
  attachments?: EmailAttachment[];
  inlineLogo?: boolean; // se true, allega il logo MADE come inline CID "logoMade"
}

function sanitizeDisplayName(s: string | undefined | null): string {
  if (!s) return "";
  return String(s).replace(/[\r\n"]/g, "").trim().slice(0, 80);
}

// Validazione email — fonte di verità: src/lib/email-validazione.ts.
// Replicata qui perché Deno edge non importa il modulo TS del bundle Vite.
// Se cambi la regex là, aggiornala anche qui.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isEmailValida(raw: unknown): boolean {
  if (raw == null) return false;
  const v = String(raw).trim();
  if (v === "") return false;
  return EMAIL_REGEX.test(v);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: EmailPayload = await req.json();
    const { to, cc, bcc, subject, html, text, replyTo, fromName } = payload;

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "to, subject e html sono obbligatori" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const host = Deno.env.get("SMTP_HOST")!;
    const port = parseInt(Deno.env.get("SMTP_PORT") ?? "465");
    const user = Deno.env.get("SMTP_USER")!;
    const pass = Deno.env.get("SMTP_PASS")!;
    const defaultFrom = Deno.env.get("SMTP_FROM") ?? `FidiManager MADE <${user}>`;

    const displayName = sanitizeDisplayName(fromName);
    const from = displayName ? `${displayName} <${user}>` : defaultFrom;

    const recipients = Array.isArray(to) ? to : [to];

    // Difesa in profondità: rifiuta payload con destinatari non validi
    // (indirizzi multipli in un campo, date Excel "43999", spazi, ecc.)
    // invece di passarli a nodemailer alla cieca.
    const invalidRecipients = recipients.filter((r) => !isEmailValida(r));
    if (invalidRecipients.length > 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Indirizzo email non valido o malformato",
          invalidRecipients,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Nodemailer: gestisce automaticamente multipart/related quando un
    // attachment ha `cid` impostato e `Content-Disposition: inline`.
    // Outlook desktop richiede questa struttura per renderizzare il CID
    // dentro l'header invece di mostrarlo come allegato separato.
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const inlineAttachments = payload.inlineLogo
      ? [{
          filename: "logo-made.png",
          content: LOGO_MADE_BASE64,
          encoding: "base64" as const,
          contentType: "image/png",
          cid: LOGO_CID, // -> Content-ID: <logoMade>
          contentDisposition: "inline" as const,
        }]
      : [];

    const fileAttachments = (payload.attachments ?? []).map((a) => ({
      filename: a.filename,
      content: a.content,
      encoding: "base64" as const,
      contentType: a.contentType,
    }));

    const attachments = [...inlineAttachments, ...fileAttachments];

    const results: { email: string; ok: boolean; err?: string; messageId?: string }[] = [];

    for (const recipient of recipients) {
      try {
        const info = await transporter.sendMail({
          from,
          to: recipient,
          ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
          ...(bcc ? { bcc: Array.isArray(bcc) ? bcc : [bcc] } : {}),
          subject,
          text: text ?? "Apri l'email in un client che supporta HTML.",
          html,
          replyTo: replyTo ?? user,
          ...(attachments.length ? { attachments } : {}),
        });
        results.push({ email: recipient, ok: true, messageId: info.messageId });
        console.log(`Email inviata a ${recipient}: ${subject} (id=${info.messageId})`);
      } catch (e) {
        results.push({ email: recipient, ok: false, err: String(e) });
        console.error(`Errore invio a ${recipient}:`, e);
      }
    }

    transporter.close();

    const allOk = results.every((r) => r.ok);
    return new Response(JSON.stringify({ ok: allOk, results }), {
      status: allOk ? 200 : 207,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Errore Edge Function send-email:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
