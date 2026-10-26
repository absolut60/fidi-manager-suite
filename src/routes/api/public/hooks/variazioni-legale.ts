// Hook chiamato dal trigger DB registra_variazione_legale() (via net.http_post)
// quando cambia clienti.in_gestione_legale: emette l'evento Inngest che invia
// gli avvisi nello stesso flusso delle variazioni di blocco.
// Autorizzazione SOLO ramo server: header x-internal-secret = INTERNAL_EMAIL_SECRET.
import { createFileRoute } from "@tanstack/react-router";
import { sendInngestEvent } from "@/lib/inngest/client";

// Confronto costante nel tempo (stesso schema di invia-push.ts).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/variazioni-legale")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-internal-secret");
        const expected = process.env["INTERNAL_EMAIL_SECRET"] ?? "";
        if (!provided || !expected || !safeEqual(provided, expected)) {
          return Response.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
        }
        try {
          await sendInngestEvent("clienti/blocco.variazioni.rileva", { importazioneId: null });
        } catch (e) {
          console.error(`[variazioni-legale] emissione evento fallita: ${e instanceof Error ? e.message : String(e)}`);
          return Response.json({ ok: false, error: "Emissione evento fallita" }, { status: 502 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
