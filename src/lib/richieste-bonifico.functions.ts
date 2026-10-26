// Bonifico di acconto delle richieste interne (FM48).
// segnaBonificoEseguito: la tesoreria (o l'amministratore) registra il bonifico.
// - Guardia server con puoGestireTesoreria (fonte unica src/lib/tesoreria-permessi.ts).
// - La scrittura passa SOLO dalla RPC registra_bonifico_acconto, chiamata con il
//   client dell'utente: vale anche la guardia SQL auth_puo_gestire_tesoreria().
// - Se riesce, accoda l'evento "bonifico_eseguito" per il richiedente.
// L'upload del CRO (allegato tipo 'cro_bonifico') lo fa la UI.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendInngestEvent } from "@/lib/inngest/client";
import { puoGestireTesoreria } from "@/lib/tesoreria-permessi";

function oggiRoma(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const InputSchema = z.object({
  richiestaId: z.string().uuid(),
  eseguitoIl: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida")
    .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Data non valida")
    .refine((d) => d <= oggiRoma(), "La data del bonifico non può essere futura"),
  note: z.string().trim().max(2000, "Note troppo lunghe (max 2000 caratteri)").optional(),
});

// Messaggi della RPC già in italiano; qui li normalizziamo per l'utente.
function erroreLeggibile(msg: string): string {
  const noti = [
    "Solo la tesoreria può registrare il bonifico",
    "Richiesta non trovata",
    "La richiesta non prevede un bonifico di acconto",
    "La richiesta non è approvata: il bonifico non si può registrare",
    "Il bonifico risulta già eseguito",
  ];
  const trovato = noti.find((n) => msg.includes(n));
  return trovato ?? "Non è stato possibile registrare il bonifico. Riprova.";
}

export const segnaBonificoEseguito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof InputSchema>) => InputSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; err?: string }> => {
    const { data: ruoli, error: rErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rErr) return { ok: false, err: "Non è stato possibile verificare i permessi." };
    if (!puoGestireTesoreria((ruoli ?? []).map((r) => r.role))) {
      return { ok: false, err: "Solo la tesoreria può registrare il bonifico" };
    }

    const { error } = await context.supabase.rpc("registra_bonifico_acconto", {
      _richiesta_id: data.richiestaId,
      _eseguito_il: data.eseguitoIl,
      _note: data.note && data.note !== "" ? data.note : (null as unknown as string),
    });
    if (error) {
      console.error("[segnaBonificoEseguito] RPC:", error.message);
      return { ok: false, err: erroreLeggibile(error.message) };
    }

    // Avviso al richiedente: best-effort, il bonifico resta registrato.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profilo } = await supabaseAdmin
        .from("profili")
        .select("nome, cognome, email")
        .eq("id", context.userId)
        .maybeSingle();
      const actor = {
        id: context.userId,
        nome: [profilo?.nome, profilo?.cognome]
          .filter((v): v is string => typeof v === "string" && v.trim() !== "")
          .map((v) => v.trim())
          .join(" "),
        email: profilo?.email ?? null,
      };
      await sendInngestEvent("richieste/notifica", {
        event: "bonifico_eseguito",
        richiestaId: data.richiestaId,
        actor,
      });
    } catch (e) {
      console.error("[segnaBonificoEseguito] avviso non accodato:", e instanceof Error ? e.message : String(e));
      return { ok: true, err: "Bonifico registrato, avviso al richiedente non inviato" };
    }
    return { ok: true };
  });
