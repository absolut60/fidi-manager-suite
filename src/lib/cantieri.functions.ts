// Server functions del modulo cantieri: geocodifica Google (chiave SERVER),
// calcolo sede più vicina su strada e consegna controllata della chiave mappa.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EsitoGeocodifica, EsitoSede } from "@/lib/cantieri-geo.server";

const inputGeo = z.object({ cantiere_id: z.string().uuid() });

export type { EsitoGeocodifica, EsitoSede };

/** Geocodifica un cantiere, salva lat/lng + stato e ricalcola la sede più vicina. */
export const geocodificaCantiere = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputGeo.parse(d))
  .handler(async ({ data, context }): Promise<EsitoGeocodifica> => {
    const { componiQuery, geocodificaIndirizzo, calcolaSedeVicina } = await import("@/lib/cantieri-geo.server");
    const supabase = context.supabase;

    const { data: cantiere, error } = await supabase
      .from("cantieri")
      .select("id, indirizzo, cap, citta, provincia")
      .eq("id", data.cantiere_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cantiere) throw new Error("Cantiere non trovato o non accessibile.");

    const c = cantiere as {
      indirizzo: string | null; cap: string | null; citta: string | null; provincia: string | null;
    };

    const salva = async (e: EsitoGeocodifica) => {
      await supabase
        .from("cantieri")
        .update({
          lat: e.lat,
          lng: e.lng,
          geocodifica_stato: e.stato,
          geocodifica_messaggio: e.messaggio,
          geocodificato_il: new Date().toISOString(),
        } as never)
        .eq("id", data.cantiere_id);
      if (e.stato === "ok") {
        try { await calcolaSedeVicina(supabase, data.cantiere_id); } catch { /* non blocca */ }
      }
      return e;
    };

    if (!c.indirizzo?.trim() && !c.citta?.trim()) {
      return salva({
        stato: "fallita", lat: null, lng: null,
        messaggio: "Indirizzo assente: inserisci almeno via o città.",
      });
    }

    return salva(
      await geocodificaIndirizzo(componiQuery(c), { cap: c.cap, citta: c.citta, provincia: c.provincia }),
    );
  });

/** Ricalcola la sede più vicina di un cantiere già posizionato. */
export const ricalcolaSedeVicina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputGeo.parse(d))
  .handler(async ({ data, context }): Promise<EsitoSede> => {
    const { calcolaSedeVicina } = await import("@/lib/cantieri-geo.server");
    return calcolaSedeVicina(context.supabase, data.cantiere_id);
  });

/** Geocodifica le sedi (stores) attive prive di coordinate. */
export const geocodificaSedi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: number; fallite: number; messaggi: string[] }> => {
    const { componiQuery, geocodificaIndirizzo } = await import("@/lib/cantieri-geo.server");
    const supabase = context.supabase;

    const { data, error } = await supabase
      .from("stores")
      .select("id, nome, indirizzo, cap, citta, provincia, lat, lng")
      .eq("attivo", true);
    if (error) throw new Error(error.message);

    const sedi = (data ?? []) as Array<{
      id: string; nome: string; indirizzo: string | null; cap: string | null;
      citta: string | null; provincia: string | null; lat: number | null; lng: number | null;
    }>;

    let ok = 0;
    let fallite = 0;
    const messaggi: string[] = [];

    for (const s of sedi) {
      if (s.lat != null && s.lng != null) continue;
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

/** Restituisce la chiave Google Maps al client autenticato (serve alla Maps JS API). */
export const getChiaveMappe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ key: string | null }> => {
    return { key: process.env["GOOGLE_MAPS_API_KEY"] ?? null };
  });
