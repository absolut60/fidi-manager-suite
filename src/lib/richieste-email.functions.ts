// Dispatcher: accoda l'invio email notifica su Inngest ("richieste/notifica").
// Tutta la logica (risoluzione destinatari, rendering, invio SMTP) vive nel
// job `inviaEmailRichiesta` (src/lib/inngest/richieste-email.server.ts) —
// fonte unica. Qui validiamo l'input e ritorniamo subito.
//
// Autorizzazione (FM41): richiede sessione utente (requireSupabaseAuth) e che
// l'utente VEDA la richiesta interna (lettura con il suo client, sotto RLS);
// altrimenti non si accoda nulla. Il mittente (actor) è SEMPRE l'utente della
// sessione, letto dal profilo sul server: l'actor inviato dal browser è ignorato.
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
  // ignorato: il mittente è sempre l'utente della sessione (FM41)
  actor: z
    .object({
      id: z.string().uuid().nullable().optional(),
      nome: z.string().max(200).optional().default(""),
      email: z.string().email().nullable().optional(),
    })
    .optional(),
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
  .handler(async ({ data, context }): Promise<{ ok: boolean; queued: boolean; err?: string }> => {
    try {
      // Accesso: l'utente deve vedere la richiesta (client utente, RLS).
      const { data: visibile, error: visErr } = await context.supabase
        .from("richieste_interne")
        .select("id")
        .eq("id", data.richiestaId)
        .maybeSingle();
      if (visErr || !visibile) {
        return { ok: false, queued: false, err: "non_autorizzato" };
      }

      // Mittente reale dal profilo dell'utente della sessione.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profilo } = await supabaseAdmin
        .from("profili")
        .select("id, nome, cognome, email")
        .eq("id", context.userId)
        .maybeSingle();
      if (!profilo) {
        return { ok: false, queued: false, err: "profilo_non_trovato" };
      }
      const actor = {
        id: context.userId,
        nome: [profilo.nome, profilo.cognome]
          .filter((v): v is string => typeof v === "string" && v.trim() !== "")
          .map((v) => v.trim())
          .join(" "),
        email: profilo.email ?? null,
      };

      await sendInngestEvent("richieste/notifica", {
        event: data.event,
        richiestaId: data.richiestaId,
        actor,
        extra: data.extra,
      });
      return { ok: true, queued: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[notifyRichiestaEvento] enqueue fallito:", msg);
      return { ok: false, queued: false, err: msg };
    }
  });
