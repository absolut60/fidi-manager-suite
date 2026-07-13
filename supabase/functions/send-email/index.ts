import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { LOGO_MADE_BASE64 } from "./logo-made.ts";

// Content-ID fisso usato dal template (<img src="cid:logoMade">).
// Senza trattini per evitare bug di parser legacy.
const LOGO_CID = "logoMade";

// Ruoli abilitati al ramo UTENTE (invio email dal frontend con JWT).
// I job Inngest usano il ramo SERVER (header x-internal-secret) e bypassano
// questa lista.
const RUOLI_AUTORIZZATI = new Set([
  "amministratore",
  "amministrazione",
  "direzione",
  "approvatore",
  "store_manager",
]);

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get("APP_URL") ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function buildCorsHeaders(originHeader: string | null): Record<string, string> {
  const allowlist = getAllowedOrigins();
  const origin =
    originHeader && allowlist.includes(originHeader)
      ? originHeader
      : allowlist[0] ?? "";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-internal-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Confronto costante nel tempo per evitare timing attack sul secret.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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

async function authorizeRequest(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  // Ramo SERVER: header segreto condiviso (job Inngest / server functions).
  const providedSecret = req.headers.get("x-internal-secret");
  const expectedSecret = Deno.env.get("INTERNAL_EMAIL_SECRET") ?? "";
  if (providedSecret && expectedSecret && safeEqual(providedSecret, expectedSecret)) {
    return { ok: true };
  }

  // Ramo UTENTE: JWT reale + ruolo abilitato.
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing authorization" };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, status: 401, error: "Missing token" };

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid token" };
  }
  const user = userData.user;
  // Rifiuta anon key (role: "anon" nel JWT). Un utente reale ha role "authenticated".
  if (user.role !== "authenticated" || !user.id) {
    return { ok: false, status: 401, error: "Anonymous tokens not allowed" };
  }

  // Verifica ruolo abilitato.
  const { data: roles, error: rolesErr } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (rolesErr) {
    console.error("Errore lettura user_roles:", rolesErr);
    return { ok: false, status: 500, error: "Role lookup failed" };
  }
  const abilitato = (roles ?? []).some((r: { role: string }) => RUOLI_AUTORIZZATI.has(r.role));
  if (!abilitato) {
    return { ok: false, status: 403, error: "Forbidden: role not allowed to send email" };
  }

  return { ok: true };
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Autorizzazione a doppio binario.
  const auth = await authorizeRequest(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
