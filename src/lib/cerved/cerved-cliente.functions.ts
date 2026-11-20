import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { eseguiAggiornaCervedSoggetto, eseguiApriPdfReportCerved } from "./cerved-soggetto.functions";

/** Involucro della funzione unica (FM90) con entità "cliente": nessuna logica qui. */
export const aggiornaCervedCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clienteId: string }) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => eseguiAggiornaCervedSoggetto("cliente", data.clienteId, context));

/** Involucro della funzione unica (FM90) con entità "cliente": nessuna logica qui. */
export const apriPdfReportCervedCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clienteId: string }) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => eseguiApriPdfReportCerved("cliente", data.clienteId, context));
