import { createFileRoute } from "@tanstack/react-router";
import { destinazioneConsentita } from "@/lib/tracking-clic";

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

function rimando(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/r/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const home = appUrl();
        const destinazione = urlValido(url.searchParams.get("u"));
        if (!destinazione) return rimando(home);

        // FM41: rimando solo per token esistente e host ammesso dalla campagna.
        let supabaseAdmin: typeof import("@/integrations/supabase/client.server").supabaseAdmin;
        try {
          ({ supabaseAdmin } = await import("@/integrations/supabase/client.server"));
          const { data, error } = await supabaseAdmin
            .from("campagne_email_destinatari")
            .select("id, campagna:campagne_email_marketing(corpo_html)")
            .eq("tracking_token", params.token)
            .maybeSingle();
          if (error) {
            console.error("[tracking-clic] lettura destinatario fallita", error);
            return rimando(home);
          }
          const corpo = data?.campagna?.corpo_html;
          if (!data || typeof corpo !== "string" || !destinazioneConsentita(destinazione, corpo, home)) {
            return rimando(home);
          }
        } catch (e) {
          console.error("[tracking-clic] lettura destinatario fallita", e);
          return rimando(home);
        }

        // Il tracciamento non deve mai bloccare il redirect.
        try {
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

        return rimando(destinazione);
      },
    },
  },
});
