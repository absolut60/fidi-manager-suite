import { createFileRoute } from "@tanstack/react-router";
import { serve } from "inngest/edge";
import { inngest } from "@/lib/inngest/client";
import {
  processAnagraficaImport,
  processRischioImport,
  processScadenziarioImport,
  processScadenziarioChunk,
  finalizeScadenziarioImport,
  processScadAssicImport,
  processBloccoFidoImport,
} from "@/lib/inngest/functions.server";

const handler = serve({
  client: inngest,
  functions: [
    processAnagraficaImport,
    processRischioImport,
    processScadenziarioImport,
    processScadenziarioChunk,
    finalizeScadenziarioImport,
    processScadAssicImport,
    processBloccoFidoImport,
  ],
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
