import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: EmailPayload = await req.json();
    const { to, subject, html, text, replyTo } = payload;

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "to, subject e html sono obbligatori" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const host = Deno.env.get("SMTP_HOST")!;
    const port = parseInt(Deno.env.get("SMTP_PORT") ?? "465");
    const user = Deno.env.get("SMTP_USER")!;
    const pass = Deno.env.get("SMTP_PASS")!;
    const from = Deno.env.get("SMTP_FROM") ?? `FidiManager MADE <${user}>`;

    const recipients = Array.isArray(to) ? to : [to];

    const client = new SMTPClient({
      connection: {
        hostname: host,
        port,
        tls: true,
        auth: {
          username: user,
          password: pass,
        },
      },
    });

    const results: { email: string; ok: boolean; err?: string }[] = [];

    for (const recipient of recipients) {
      try {
        await client.send({
          from,
          to: recipient,
          subject,
          content: text ?? "Apri l'email in un client che supporta HTML.",
          html,
          replyTo: replyTo ?? user,
          ...(payload.attachments?.length
            ? {
                attachments: payload.attachments.map((a) => ({
                  filename: a.filename,
                  content: a.content,
                  encoding: "base64",
                  contentType: a.contentType,
                })),
              }
            : {}),
        });
        results.push({ email: recipient, ok: true });
        console.log(`Email inviata a ${recipient}: ${subject}`);
      } catch (e) {
        results.push({ email: recipient, ok: false, err: String(e) });
        console.error(`Errore invio a ${recipient}:`, e);
      }
    }

    await client.close();

    const allOk = results.every((r) => r.ok);
    return new Response(
      JSON.stringify({ ok: allOk, results }),
      {
        status: allOk ? 200 : 207,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Errore Edge Function send-email:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
