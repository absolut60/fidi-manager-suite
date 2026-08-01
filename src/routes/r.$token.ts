import { createFileRoute } from "@tanstack/react-router";

const APP_URL = "https://fidi-manager-suite.lovable.app";

function appUrl(): string {
  return process.env['VITE_APP_URL'] ?? APP_URL;
}

/** Accetta solo URL http/https (anti open-redirect verso schemi pericolosi). */
function urlValido(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/r/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const destinazione = urlValido(url.searchParams.get("u")) ?? appUrl();

        // Il tracciamento non deve mai bloccare il redirect.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const ip =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            null;
          await supabaseAdmin.rpc("registra_clic_campagna", {
            _token: params.token,
            _url: destinazione,
            _ua: request.headers.get("user-agent"),
            _ip: ip,
          } as never);
        } catch (e) {
          console.error("[tracking-clic] registrazione fallita", e);
        }

        return new Response(null, {
          status: 302,
          headers: { Location: destinazione, "Cache-Control": "no-store" },
        });
      },
    },
  },
});
