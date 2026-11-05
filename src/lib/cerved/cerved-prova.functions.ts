import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Azienda = Record<string, unknown>;
const testo = (v: unknown) => (v == null || v === "" ? null : String(v));

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

    const { cercaSoggettoPerPiva } = await import("./cerved.server");
    const r = await cercaSoggettoPerPiva(data.piva, { utenteId: context.userId, clienteId: cli?.id ?? null });

    const corpo = (r.risposta ?? {}) as { companies?: Azienda[] };
    const aziende = Array.isArray(corpo.companies) ? corpo.companies : [];
    const a = aziende[0];
    const info = (a?.["company_info"] ?? {}) as Azienda;
    const dati = (a?.["dati_anagrafici"] ?? {}) as Azienda;
    const atecoObj = (a?.["ateco_2025"] ?? info["ateco_2025"] ?? a?.["codice_ateco"] ?? null) as Azienda | string | null;
    const forma = (info["legal_form"] ?? a?.["forma_giuridica"] ?? null) as Azienda | string | null;

    return {
      http_status: r.http_status,
      esito: r.esito,
      errore: r.errore,
      numero_aziende: aziende.length,
      cliente_trovato: !!cli,
      prima: a
        ? {
            id_soggetto: testo(a["id_soggetto"] ?? dati["id_soggetto"]),
            denominazione: testo(dati["denominazione"] ?? a["denominazione"]),
            partita_iva: testo(info["partita_iva"] ?? dati["partita_iva"] ?? a["partita_iva"]),
            codice_stato_attivita: testo(info["codice_stato_attivita"] ?? a["codice_stato_attivita"]),
            forma_giuridica: typeof forma === "object" && forma ? testo(forma["description"] ?? forma["descrizione"] ?? forma["code"]) : testo(forma),
            ateco_2025: typeof atecoObj === "object" && atecoObj ? testo(atecoObj["code"] ?? atecoObj["codice"]) : testo(atecoObj),
          }
        : null,
    };
  });
