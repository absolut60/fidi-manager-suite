import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Serve pubblicamente le immagini delle campagne email.
 * Il bucket "email-assets" e' privato (i bucket pubblici sono bloccati dalla policy
 * di workspace), quindi le immagini vengono esposte in sola lettura da questa route
 * pubblica, limitata al prefisso "campagne/". Serve perche' i client di posta
 * scaricano le immagini senza autenticazione.
 */
export const Route = createFileRoute("/api/public/email-img/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as { _splat?: string })._splat ?? "";
        const path = decodeURIComponent(raw);

        if (!path.startsWith("campagne/") || path.includes("..")) {
          return new Response("Not found", { status: 404 });
        }

        const { data, error } = await supabaseAdmin.storage.from("email-assets").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });

        const buf = await data.arrayBuffer();
        return new Response(buf, {
          headers: {
            "Content-Type": data.type || "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
