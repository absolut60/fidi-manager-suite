// Dispatcher: accoda l'invio email notifica su Inngest ("richieste/notifica").
// Tutta la logica (risoluzione destinatari, rendering, invio SMTP) vive nel
// job `inviaEmailRichiesta` (src/lib/inngest/richieste-email.server.ts) —
// fonte unica. Qui validiamo l'input e ritorniamo subito.
//
// Autorizzazione: richiede sessione utente (requireSupabaseAuth).
// Il chiamante NON deve MAI bloccare l'azione principale sull'esito.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendInngestEvent } from "@/lib/inngest/client";

const EVENTS = [
  "new_request",
  "resp_approved",
  "resp_forwarded",
  "resp_rejected",
  "dir_approved",
  "dir_rejected",
  "sollecito",
  "info_request",
  "messaggio_interno",
] as const;

const InputSchema = z.object({
  event: z.enum(EVENTS),
  richiestaId: z.string().uuid(),
  actor: z.object({
    id: z.string().uuid().nullable().optional(),
    nome: z.string().max(200).optional().default(""),
    email: z.string().email().nullable().optional(),
  }),
  extra: z
    .object({
      by: z.string().max(200).nullable().optional(),
      dest: z.string().max(50).nullable().optional(),
      nota: z.string().max(4000).nullable().optional(),
      testo: z.string().max(8000).nullable().optional(),
    })
    .optional(),
});

export const notifyRichiestaEvento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof InputSchema>) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; queued: boolean; err?: string }> => {
    try {
      await sendInngestEvent("richieste/notifica", {
        event: data.event,
        richiestaId: data.richiestaId,
        actor: data.actor,
        extra: data.extra,
      });
      return { ok: true, queued: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[notifyRichiestaEvento] enqueue fallito:", msg);
      return { ok: false, queued: false, err: msg };
    }
  });
