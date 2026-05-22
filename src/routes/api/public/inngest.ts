import { createFileRoute } from "@tanstack/react-router";
import { serve } from "inngest/edge";
import { inngest } from "@/lib/inngest/client";
import { processAnagraficaImport } from "@/lib/inngest/functions.server";

// Serve endpoint Inngest. Inngest userà questa URL per:
// - sincronizzare le funzioni (PUT)
// - invocarle quando arriva un evento (POST)
// La verifica delle firme è gestita dall'SDK usando INNGEST_SIGNING_KEY.
const handler = serve({
  client: inngest,
  functions: [processAnagraficaImport],
});

export const Route = createFileRoute("/api/public/inngest")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
      PUT: ({ request }) => handler(request),
    },
  },
});
