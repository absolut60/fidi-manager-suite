import { createFileRoute } from "@tanstack/react-router";
import { serve } from "inngest/edge";
import { inngest } from "@/lib/inngest/client";
import {
  processAnagraficaImport,
  processAnagraficaChunk,
  finalizeAnagraficaImport,
  processRischioImport,
  processScadenziarioImport,
  processScadenziarioChunk,
  finalizeScadenziarioImport,
  processScadAssicImport,
  processBloccoFidoImport,
} from "@/lib/inngest/functions.server";
import { invioMassivoSolleciti } from "@/lib/inngest/sollecito-massivo.server";
import { snapshotMensile } from "@/lib/inngest/snapshot.server";
import { remindRatePianoRientro } from "@/lib/inngest/piano-rientro-reminder.server";
import { promemoriaScadenzaAutomatico } from "@/lib/inngest/promemoria-scadenza.server";
import { promemoriaScadenzaRetention } from "@/lib/inngest/promemoria-scadenza-retention.server";



const handler = serve({
  client: inngest,
  functions: [
    processAnagraficaImport,
    processAnagraficaChunk,
    finalizeAnagraficaImport,
    processRischioImport,
    processScadenziarioImport,
    processScadenziarioChunk,
    finalizeScadenziarioImport,
    processScadAssicImport,
    processBloccoFidoImport,
    invioMassivoSolleciti,
    snapshotMensile,
    remindRatePianoRientro,
    promemoriaScadenzaAutomatico,

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
