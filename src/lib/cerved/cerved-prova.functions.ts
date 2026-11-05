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

    const { cercaSoggettoPerPiva, leggiProfilo, leggiScore, normalizzaAziendaCerved, normalizzaProfiloCerved, normalizzaScoreCerved } =
      await import("./cerved.server");
    const ctx = { utenteId: context.userId, clienteId: cli?.id ?? null };
    const r = await cercaSoggettoPerPiva(data.piva, ctx);

    const corpo = (r.risposta ?? {}) as { companies?: unknown[] };
    const aziende = Array.isArray(corpo.companies) ? corpo.companies : [];
    const prima = aziende.length > 0 ? normalizzaAziendaCerved(aziende[0]) : null;

    let profilo = null as null | { errore: string | null; dati: ReturnType<typeof normalizzaProfiloCerved> | null };
    let score = null as null | { errore: string | null; dati: ReturnType<typeof normalizzaScoreCerved> };
    if (prima?.id_soggetto) {
      const [p, s] = await Promise.all([leggiProfilo(prima.id_soggetto, ctx), leggiScore(prima.id_soggetto, ctx)]);
      profilo = p.esito === "ok"
        ? { errore: null, dati: normalizzaProfiloCerved(p.risposta) }
        : { errore: p.errore ?? "Errore nella lettura del profilo.", dati: null };
      score = s.esito === "ok"
        ? { errore: null, dati: normalizzaScoreCerved(s.risposta) }
        : { errore: s.errore ?? "Errore nella lettura dello score.", dati: [] };
    }

    return {
      http_status: r.http_status,
      esito: r.esito,
      errore: r.errore,
      numero_aziende: aziende.length,
      cliente_trovato: !!cli,
      prima,
      profilo,
      score,
    };
  });
