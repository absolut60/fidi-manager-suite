// Server functions per la geolocalizzazione dei punti vendita (stores).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EsitoGeocodifica } from "@/lib/cantieri-geo.server";

const inputIndirizzo = z.object({
  indirizzo: z.string().trim().max(200).optional().nullable(),
  cap: z.string().trim().max(10).optional().nullable(),
  citta: z.string().trim().max(100).optional().nullable(),
  provincia: z.string().trim().max(5).optional().nullable(),
});

/** Geocodifica un indirizzo dal form sede (non salva nulla). */
export const geocodificaIndirizzoSede = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputIndirizzo.parse(d))
  .handler(async ({ data }): Promise<EsitoGeocodifica> => {
    const { componiQuery, geocodificaIndirizzo } = await import("@/lib/cantieri-geo.server");
    if (!data.indirizzo?.trim() && !data.citta?.trim()) {
      return {
        stato: "fallita", lat: null, lng: null,
        messaggio: "Indirizzo assente: inserisci almeno via o città.",
      };
    }
    return geocodificaIndirizzo(componiQuery(data), {
      cap: data.cap ?? null,
      citta: data.citta ?? null,
      provincia: data.provincia ?? null,
    });
  });

/** Geocodifica le sedi attive: solo quelle senza coordinate, oppure tutte se forza=true. */
export const geocodificaTutteLeSedi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ forza: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ ok: number; fallite: number; messaggi: string[] }> => {
    const { componiQuery, geocodificaIndirizzo } = await import("@/lib/cantieri-geo.server");
    const supabase = context.supabase;

    const { data: rows, error } = await supabase
      .from("stores")
      .select("id, nome, indirizzo, cap, citta, provincia, lat, lng, geocodifica_stato")
      .eq("attivo", true);
    if (error) throw new Error(error.message);

    const sedi = (rows ?? []) as Array<{
      id: string; nome: string; indirizzo: string | null; cap: string | null;
      citta: string | null; provincia: string | null; lat: number | null; lng: number | null;
      geocodifica_stato: string | null;
    }>;

    let ok = 0;
    let fallite = 0;
    const messaggi: string[] = [];

    for (const s of sedi) {
      if (!data.forza && s.lat != null && s.lng != null) continue;
      if (s.geocodifica_stato === "manuale" && !data.forza) continue;
      const esito = await geocodificaIndirizzo(componiQuery(s), {
        cap: s.cap, citta: s.citta, provincia: s.provincia,
      });
      await supabase
        .from("stores")
        .update({
          lat: esito.lat,
          lng: esito.lng,
          geocodifica_stato: esito.stato,
          geocodificato_il: new Date().toISOString(),
        } as never)
        .eq("id", s.id);
      if (esito.stato === "ok") ok++;
      else { fallite++; messaggi.push(`${s.nome}: ${esito.messaggio ?? "geocodifica fallita"}`); }
    }

    return { ok, fallite, messaggi };
  });
