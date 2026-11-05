import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Prova di ricerca Cerved per partita IVA: solo amministratori. */
export const provaCercaCerved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { piva: string }) =>
    z.object({ piva: z.string().regex(/^\d{11}$/, "La partita IVA deve avere 11 cifre") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "amministratore",
    });
    if (!isAdmin) throw new Error("Operazione riservata agli amministratori");

    const { data: cli } = await context.supabase
      .from("clienti").select("id").eq("partita_iva", data.piva).limit(1).maybeSingle();

    const { cercaSoggettoPerPiva, normalizzaAziendaCerved } = await import("./cerved.server");
    const r = await cercaSoggettoPerPiva(data.piva, { utenteId: context.userId, clienteId: cli?.id ?? null });

    const corpo = (r.risposta ?? {}) as { companies?: unknown[] };
    const aziende = Array.isArray(corpo.companies) ? corpo.companies : [];

    return {
      http_status: r.http_status,
      esito: r.esito,
      errore: r.errore,
      numero_aziende: aziende.length,
      cliente_trovato: !!cli,
      prima: aziende.length > 0 ? normalizzaAziendaCerved(aziende[0]) : null,
    };
  });
