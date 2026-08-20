// Server functions del modulo cantieri: geocodifica Google (chiave SERVER) e
// consegna controllata della chiave per la mappa lato browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputGeo = z.object({ cantiere_id: z.string().uuid() });

export type EsitoGeocodifica = {
  stato: "ok" | "fallita";
  lat: number | null;
  lng: number | null;
  messaggio: string | null;
};

function componiQuery(c: {
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
}): string {
  const parti = [
    c.indirizzo?.trim(),
    [c.cap?.trim(), c.citta?.trim()].filter(Boolean).join(" "),
    c.provincia?.trim() ? `(${c.provincia.trim()})` : "",
    "Italia",
  ].filter((p) => p && p.length > 0);
  return parti.join(", ");
}

/** Geocodifica un cantiere e salva lat/lng + stato. Non lancia mai per errori di indirizzo. */
export const geocodificaCantiere = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputGeo.parse(d))
  .handler(async ({ data, context }): Promise<EsitoGeocodifica> => {
    const supabase = context.supabase;

    const { data: cantiere, error } = await supabase
      .from("cantieri")
      .select("id, indirizzo, cap, citta, provincia")
      .eq("id", data.cantiere_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cantiere) throw new Error("Cantiere non trovato o non accessibile.");

    const c = cantiere as {
      indirizzo: string | null;
      cap: string | null;
      citta: string | null;
      provincia: string | null;
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
      return e;
    };

    if (!c.indirizzo?.trim() && !c.citta?.trim()) {
      return salva({
        stato: "fallita",
        lat: null,
        lng: null,
        messaggio: "Indirizzo assente: inserisci almeno via o città.",
      });
    }

    const apiKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!apiKey) {
      return salva({
        stato: "fallita",
        lat: null,
        lng: null,
        messaggio: "Chiave Google Maps non configurata sul server (GOOGLE_MAPS_API_KEY).",
      });
    }

    const indirizzo = componiQuery(c);
    try {
      const url =
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(indirizzo)}` +
        `&region=it&language=it&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        console.error(`[geocodifica] HTTP ${res.status}: ${body}`);
        return salva({
          stato: "fallita",
          lat: null,
          lng: null,
          messaggio: `Errore chiamata Google Maps (HTTP ${res.status}).`,
        });
      }
      const json = (await res.json()) as {
        status: string;
        error_message?: string;
        results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
      };

      if (json.status === "OK" && json.results?.[0]?.geometry?.location) {
        const loc = json.results[0].geometry.location!;
        return salva({ stato: "ok", lat: loc.lat, lng: loc.lng, messaggio: null });
      }

      let messaggio: string;
      switch (json.status) {
        case "ZERO_RESULTS":
          messaggio = "Indirizzo non trovato (ZERO_RESULTS): verifica via/CAP/città o inserisci le coordinate a mano.";
          break;
        case "REQUEST_DENIED":
          messaggio =
            "Google ha rifiutato la richiesta (REQUEST_DENIED): la Geocoding API potrebbe non essere abilitata sulla chiave, oppure la chiave ha restrizioni. " +
            (json.error_message ?? "");
          break;
        case "OVER_QUERY_LIMIT":
          messaggio = "Quota Google Maps esaurita (OVER_QUERY_LIMIT): riprova più tardi.";
          break;
        case "INVALID_REQUEST":
          messaggio = "Richiesta non valida (INVALID_REQUEST): indirizzo incompleto.";
          break;
        default:
          messaggio = `Geocodifica non riuscita (${json.status}). ${json.error_message ?? ""}`;
      }
      return salva({ stato: "fallita", lat: null, lng: null, messaggio: messaggio.trim() });
    } catch (e) {
      console.error("[geocodifica] errore di rete", e);
      return salva({
        stato: "fallita",
        lat: null,
        lng: null,
        messaggio: "Errore di rete verso Google Maps: riprova.",
      });
    }
  });

/** Restituisce la chiave Google Maps al client autenticato (serve alla Maps JS API). */
export const getChiaveMappe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ key: string | null }> => {
    return { key: process.env["GOOGLE_MAPS_API_KEY"] ?? null };
  });
