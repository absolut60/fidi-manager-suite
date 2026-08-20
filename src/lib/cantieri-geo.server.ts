// Helper server-only del modulo cantieri: geocodifica Google e calcolo della
// sede più vicina su strada (haversine per le candidate + Distance Matrix).
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<any, any, any>;

export type EsitoGeocodifica = {
  stato: "ok" | "fallita";
  lat: number | null;
  lng: number | null;
  messaggio: string | null;
};

export function componiQuery(c: {
  indirizzo?: string | null;
  cap?: string | null;
  citta?: string | null;
  provincia?: string | null;
}): string {
  return [
    c.indirizzo?.trim(),
    [c.cap?.trim(), c.citta?.trim()].filter(Boolean).join(" "),
    c.provincia?.trim() ? `(${c.provincia.trim()})` : "",
    "Italia",
  ]
    .filter((p) => p && p.length > 0)
    .join(", ");
}

/** Vincoli `components` per evitare match su vie omonime in altri comuni. */
export type VincoliGeo = {
  cap?: string | null;
  citta?: string | null;
  provincia?: string | null;
};

export function componiComponents(v: VincoliGeo | undefined): string {
  const parti = ["country:IT"];
  if (v?.citta?.trim()) parti.push(`locality:${v.citta.trim()}`);
  if (v?.provincia?.trim()) parti.push(`administrative_area:${v.provincia.trim()}`);
  if (v?.cap?.trim()) parti.push(`postal_code:${v.cap.trim()}`);
  return parti.join("|");
}

/** Geocodifica un indirizzo testuale con la chiave SERVER. Non lancia mai. */
export async function geocodificaIndirizzo(
  indirizzo: string,
  vincoli?: VincoliGeo,
): Promise<EsitoGeocodifica> {
  const apiKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!apiKey) {
    return {
      stato: "fallita", lat: null, lng: null,
      messaggio: "Chiave Google Maps non configurata sul server (GOOGLE_MAPS_API_KEY).",
    };
  }
  try {
    const components = componiComponents(vincoli);
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(indirizzo)}` +
      `&components=${encodeURIComponent(components)}` +
      `&region=it&language=it&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      console.error(`[geocodifica] HTTP ${res.status}: ${body}`);
      return { stato: "fallita", lat: null, lng: null, messaggio: `Errore chiamata Google Maps (HTTP ${res.status}).` };
    }
    const json = (await res.json()) as {
      status: string;
      error_message?: string;
      results?: Array<{
        partial_match?: boolean;
        geometry?: { location?: { lat: number; lng: number }; location_type?: string };
      }>;
    };
    const primo = json.results?.[0];
    const loc = primo?.geometry?.location;
    if (json.status === "OK" && loc) {
      const approssimativo = primo?.partial_match === true || primo?.geometry?.location_type === "APPROXIMATE";
      return {
        stato: "ok",
        lat: loc.lat,
        lng: loc.lng,
        messaggio: approssimativo ? "Match approssimativo — verificare la posizione sulla mappa." : null,
      };
    }
    // Nessun risultato: allenta i vincoli un passo per volta (CAP spesso obsoleto),
    // mantenendo comune/provincia il più a lungo possibile.
    if (json.status === "ZERO_RESULTS") {
      const haCap = Boolean(vincoli?.cap?.trim());
      const haProv = Boolean(vincoli?.provincia?.trim());
      const haCitta = Boolean(vincoli?.citta?.trim());
      let successivo: VincoliGeo | undefined | false = false;
      if (haCap) successivo = { citta: vincoli?.citta ?? null, provincia: vincoli?.provincia ?? null };
      else if (haProv && haCitta) successivo = { citta: vincoli?.citta ?? null };
      else if (haCitta || haProv) successivo = undefined;
      if (successivo !== false) {
        // Se il CAP viene scartato come vincolo, va tolto anche dal testo:
        // un CAP obsoleto porta Google su comuni limitrofi.
        const cap = vincoli?.cap?.trim();
        const testo = haCap && cap ? indirizzo.replace(new RegExp(`\\b${cap}\\b\\s*`, "g"), "") : indirizzo;
        const esito = await geocodificaIndirizzo(testo, successivo);
        if (esito.stato === "ok") {
          return { ...esito, messaggio: "Match approssimativo — verificare la posizione sulla mappa." };
        }
        return esito;
      }
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
    return { stato: "fallita", lat: null, lng: null, messaggio: messaggio.trim() };
  } catch (e) {
    console.error("[geocodifica] errore di rete", e);
    return { stato: "fallita", lat: null, lng: null, messaggio: "Errore di rete verso Google Maps: riprova." };
  }
}

/** Distanza in linea d'aria (km). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type EsitoSede = {
  sede_id: string | null;
  sede_nome: string | null;
  km: number | null;
  minuti: number | null;
  messaggio: string | null;
};

/**
 * Calcola la sede attiva più vicina su strada: 3 candidate per distanza in
 * linea d'aria, poi Distance Matrix (chiave SERVER) solo su quelle. Salva su cantieri.
 */
export async function calcolaSedeVicina(supabase: Sb, cantiereId: string): Promise<EsitoSede> {
  const vuoto = (messaggio: string | null): EsitoSede => ({
    sede_id: null, sede_nome: null, km: null, minuti: null, messaggio,
  });

  const { data: cantiere } = await supabase
    .from("cantieri").select("id, lat, lng").eq("id", cantiereId).maybeSingle();
  const c = cantiere as { lat: number | null; lng: number | null } | null;
  if (!c?.lat || !c?.lng) return vuoto("Cantiere privo di coordinate.");

  const { data: sedi } = await supabase
    .from("stores").select("id, nome, lat, lng").eq("attivo", true)
    .not("lat", "is", null).not("lng", "is", null);
  const lista = (sedi ?? []) as Array<{ id: string; nome: string; lat: number; lng: number }>;
  if (lista.length === 0) return vuoto("Nessuna sede con coordinate: geocodifica prima le sedi.");

  const origine = { lat: c.lat, lng: c.lng };
  const candidate = lista
    .map((s) => ({ ...s, aria: haversineKm(origine, { lat: s.lat, lng: s.lng }) }))
    .sort((a, b) => a.aria - b.aria)
    .slice(0, 3);

  const apiKey = process.env["GOOGLE_MAPS_API_KEY"];
  let scelta: { id: string; nome: string; km: number; minuti: number } | null = null;
  let messaggio: string | null = null;

  if (!apiKey) {
    messaggio = "Chiave Google Maps non configurata sul server.";
  } else {
    try {
      const dest = candidate.map((s) => `${s.lat},${s.lng}`).join("|");
      const url =
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origine.lat},${origine.lng}` +
        `&destinations=${encodeURIComponent(dest)}&mode=driving&language=it&region=it&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) {
        messaggio = `Errore Distance Matrix (HTTP ${res.status}).`;
      } else {
        const json = (await res.json()) as {
          status: string;
          error_message?: string;
          rows?: Array<{ elements?: Array<{ status: string; distance?: { value: number }; duration?: { value: number } }> }>;
        };
        if (json.status !== "OK") {
          messaggio = `Distance Matrix non disponibile (${json.status}). ${json.error_message ?? ""}`.trim();
        } else {
          const el = json.rows?.[0]?.elements ?? [];
          el.forEach((e, i) => {
            const cand = candidate[i];
            if (!cand || e.status !== "OK" || !e.distance || !e.duration) return;
            const km = e.distance.value / 1000;
            if (!scelta || km < scelta.km) {
              scelta = { id: cand.id, nome: cand.nome, km, minuti: Math.round(e.duration.value / 60) };
            }
          });
          if (!scelta) messaggio = "Nessun percorso stradale trovato verso le sedi candidate.";
        }
      }
    } catch (e) {
      console.error("[sede-vicina] errore di rete", e);
      messaggio = "Errore di rete verso Google Distance Matrix.";
    }
  }

  const s = scelta as { id: string; nome: string; km: number; minuti: number } | null;
  await supabase
    .from("cantieri")
    .update({
      sede_piu_vicina_id: s?.id ?? null,
      sede_piu_vicina_km: s ? Number(s.km.toFixed(1)) : null,
      sede_piu_vicina_min: s?.minuti ?? null,
      sede_piu_vicina_calcolata_il: new Date().toISOString(),
    } as never)
    .eq("id", cantiereId);

  return s
    ? { sede_id: s.id, sede_nome: s.nome, km: Number(s.km.toFixed(1)), minuti: s.minuti, messaggio: null }
    : vuoto(messaggio);
}
