// Endpoint HTTP per l'invio di notifiche Web Push (RFC 8291 + VAPID RFC 8292).
//
// Nota: in questo progetto (TanStack Start) non si creano nuove edge function
// Supabase: la logica sta in un server route, con la STESSA struttura di
// autorizzazione a doppio binario usata da `supabase/functions/send-email`.
//   - ramo SERVER: header `x-internal-secret` = INTERNAL_EMAIL_SECRET
//     -> può inviare a qualsiasi userId (job Inngest / server).
//   - ramo UTENTE: JWT reale (role authenticated)
//     -> può inviare SOLO a se stesso ("invia prova a me stesso").
//
// La cifratura/firma è delegata a @block65/webcrypto-web-push (WebCrypto,
// compatibile con il runtime Worker). Nessuna crittografia scritta a mano.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { buildPushPayload } from "@block65/webcrypto-web-push";

// ---------------------------------------------------------------------------
// CORS (stesso schema di send-email/index.ts)
// ---------------------------------------------------------------------------
function getAllowedOrigins(): string[] {
  const raw = process.env["APP_URL"] ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function buildCorsHeaders(originHeader: string | null): Record<string, string> {
  const allowlist = getAllowedOrigins();
  const origin =
    originHeader && allowlist.includes(originHeader) ? originHeader : allowlist[0] ?? "";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-internal-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// Confronto costante nel tempo per evitare timing attack sul secret.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type AuthEsito =
  | { ok: true; server: true }
  | { ok: true; server: false; userId: string }
  | { ok: false; status: number; error: string; authDebug?: string };

async function authorizeRequest(request: Request): Promise<AuthEsito> {
  // Ramo SERVER.
  const providedSecret = request.headers.get("x-internal-secret");
  const expectedSecret = process.env["INTERNAL_EMAIL_SECRET"] ?? "";
  if (providedSecret && expectedSecret && safeEqual(providedSecret, expectedSecret)) {
    return { ok: true, server: true };
  }

  // Ramo UTENTE.
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing authorization" };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, status: 401, error: "Missing token" };

  const url = process.env["SUPABASE_URL"] ?? "";
  const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
  const anon = process.env["SUPABASE_ANON_KEY"] ?? "";
  const key = publishable || anon;
  const keyVar = publishable ? "SUPABASE_PUBLISHABLE_KEY" : anon ? "SUPABASE_ANON_KEY" : "(nessuna)";
  console.log("[invia-push] auth utente, chiave usata:", keyVar);
  if (!url || !key) return { ok: false, status: 500, error: "Server misconfigured" };

  // Funziona con entrambi i formati di chiave (legacy "eyJ..." e nuovo "sb_...").
  const supabase = createClient(url, key, {
    global: {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  console.log("[invia-push] getUser esito:", error ? `ko: ${error.message}` : "ok");
  if (error || !data?.user) {
    return {
      ok: false,
      status: 401,
      error: "Invalid token",
      authDebug: `${keyVar}: ${error?.message ?? "nessun utente restituito"}`,
    };
  }
  if (data.user.role !== "authenticated" || !data.user.id) {
    return { ok: false, status: 401, error: "Anonymous tokens not allowed" };
  }
  return { ok: true, server: false, userId: data.user.id };
}

interface PushPayloadInput {
  userId?: string;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
}

export const Route = createFileRoute("/api/public/invia-push")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response("ok", { headers: buildCorsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const corsHeaders = buildCorsHeaders(request.headers.get("origin"));
        const json = (status: number, obj: unknown) =>
          new Response(JSON.stringify(obj), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });

        const auth = await authorizeRequest(request);
        if (!auth.ok) {
          console.log("[invia-push] auth fallita:", auth.error, auth.authDebug ?? "");
          return json(auth.status, { ok: false, error: auth.error, authDebug: auth.authDebug });
        }
        console.log("[invia-push] chiamata ricevuta, ramo auth:", auth.server ? "server" : "user");

        try {
          const payload = (await request.json()) as PushPayloadInput;
          const userId = String(payload?.userId ?? "").trim();
          const title = String(payload?.title ?? "").trim();

          if (!userId || !title) {
            return json(400, { ok: false, error: "userId e title sono obbligatori" });
          }
          if (!auth.server && userId !== auth.userId) {
            return json(403, { ok: false, error: "Forbidden: can only push to yourself" });
          }

          const vapid = {
            subject: process.env["VAPID_SUBJECT"],
            publicKey: process.env["VAPID_PUBLIC_KEY"],
            privateKey: process.env["VAPID_PRIVATE_KEY"],
          };
          if (!vapid.subject || !vapid.publicKey || !vapid.privateKey) {
            return json(500, { ok: false, error: "Configurazione VAPID incompleta" });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: subs, error: subsErr } = await supabaseAdmin
            .from("push_subscriptions")
            .select("id, endpoint, p256dh, auth")
            .eq("user_id", userId);

          if (subsErr) {
            console.error("[invia-push] lettura push_subscriptions fallita", subsErr);
            return json(500, { ok: false, error: "Subscription lookup failed" });
          }
          if (!subs || subs.length === 0) {
            return json(200, { ok: true, sent: 0, failed: 0, removed: 0 });
          }

          const message = {
            data: {
              title,
              body: payload.body ?? "",
              url: payload.url || "/",
              tag: payload.tag || "fidimanager",
              icon: payload.icon || "/icons/made-any.png",
            },
            options: { ttl: 2419200, urgency: "normal" as const },
          };

          let sent = 0;
          let failed = 0;
          let removed = 0;

          for (const s of subs) {
            try {
              const subscription = {
                endpoint: s.endpoint,
                expirationTime: null,
                keys: { p256dh: s.p256dh, auth: s.auth },
              };
              const req = await buildPushPayload(message, subscription, vapid);
              const res = await fetch(s.endpoint, {
                method: req.method,
                headers: req.headers,
                body: req.body as unknown as BodyInit,
              });

              if (res.ok) {
                sent++;
                await supabaseAdmin
                  .from("push_subscriptions")
                  .update({ last_used_at: new Date().toISOString() })
                  .eq("id", s.id);
              } else if (res.status === 404 || res.status === 410) {
                await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
                removed++;
                console.log(`[invia-push] subscription rimossa (${res.status}) ${s.endpoint}`);
              } else {
                failed++;
                const txt = await res.text().catch(() => "");
                console.error(
                  `[invia-push] errore endpoint=${s.endpoint} status=${res.status} body=${txt}`,
                );
              }
            } catch (e) {
              // Un dispositivo morto non deve bloccare gli altri.
              failed++;
              console.error(`[invia-push] eccezione endpoint=${s.endpoint}`, e);
            }
          }

          return json(200, { ok: true, sent, failed, removed });
        } catch (err) {
          console.error("[invia-push] errore generale", err);
          return json(500, { ok: false, error: String(err) });
        }
      },
    },
  },
});
