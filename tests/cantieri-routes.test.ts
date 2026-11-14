import { afterEach, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcolaSedeVicina, distanzaStradale } from "../src/lib/cantieri-geo.server";

const originalFetch = globalThis.fetch;
const originalKey = process.env["GOOGLE_MAPS_API_KEY"];
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env["GOOGLE_MAPS_API_KEY"];
  else process.env["GOOGLE_MAPS_API_KEY"] = originalKey;
});
const origine = { lat: 45.5169976, lng: 8.9090398 };
const destinazione = { lat: 43.718027, lng: 10.949182 };
function routes(rows: unknown[], check?: (url: string, init?: RequestInit) => void) {
  process.env["GOOGLE_MAPS_API_KEY"] = "test-only-not-a-credential";
  globalThis.fetch = (async (url, init) => {
    check?.(String(url), init);
    return Response.json(rows);
  }) as typeof fetch;
}

test("Routes JSON indicizzato: 344711 metri, 12782 secondi e POST DRIVE italiano", async () => {
  routes([
    { originIndex: 0, destinationIndex: 1, condition: "ROUTE_EXISTS", status: {}, distanceMeters: 12000, duration: "2700s" },
    { originIndex: 0, destinationIndex: 0, condition: "ROUTE_EXISTS", status: {}, distanceMeters: 344711, duration: "12782s" },
  ], (url, init) => {
    expect(url).toBe("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-Goog-FieldMask")).toBe("originIndex,destinationIndex,distanceMeters,duration,status,condition");
    expect(JSON.parse(String(init?.body))).toEqual({ origins: [{ waypoint: { location: { latLng: { latitude: origine.lat, longitude: origine.lng } } } }], destinations: [destinazione, origine].map(c => ({ waypoint: { location: { latLng: { latitude: c.lat, longitude: c.lng } } } })), travelMode: "DRIVE", languageCode: "it" });
  });
  expect(await distanzaStradale(origine, [destinazione, origine])).toEqual([{ km: 344.711, minuti: 12782 / 60 }, { km: 12, minuti: 45 }]);
});
test("ROUTE_NOT_FOUND e status di errore diventano null", async () => {
  routes([{ originIndex: 0, destinationIndex: 0, condition: "ROUTE_NOT_FOUND" }, { originIndex: 0, destinationIndex: 1, condition: "ROUTE_EXISTS", status: { code: 7 }, distanceMeters: 1, duration: "1s" }]);
  expect(await distanzaStradale(origine, [destinazione, origine])).toEqual([null, null]);
});
test("HTTP errore: messaggio breve senza risposta del provider", async () => {
  process.env["GOOGLE_MAPS_API_KEY"] = "test-only-not-a-credential";
  globalThis.fetch = (async () => new Response("provider private detail", { status: 403 })) as typeof fetch;
  await expect(distanzaStradale(origine, [destinazione])).rejects.toThrow("Errore Routes API (HTTP 403).");
});
test("risposta non array e rete: errori brevi", async () => {
  process.env["GOOGLE_MAPS_API_KEY"] = "test-only-not-a-credential";
  globalThis.fetch = (async () => Response.json({ error: "detail" })) as typeof fetch;
  await expect(distanzaStradale(origine, [destinazione])).rejects.toThrow("Risposta Routes API non valida.");
  globalThis.fetch = (async () => { throw new Error("private network detail"); }) as typeof fetch;
  await expect(distanzaStradale(origine, [destinazione])).rejects.toThrow("Errore di rete verso Routes API: riprova.");
});
test("sede vicina: tre candidate, minimo stradale, stessi campi e arrotondamenti", async () => {
  const calls: unknown[][] = [];
  let written: Record<string, unknown> | undefined;
  const stores = [1, 2, 3, 4].map(n => ({ id: `s${n}`, nome: `Sede ${n}`, lat: 45 + n / 100, lng: 9 }));
  const sb = {
    from(table: string) {
      const chain = {
        select(cols: string) { calls.push([table, "select", cols]); return chain; },
        eq(col: string, value: unknown) { calls.push([table, "eq", col, value]); return chain; },
        not(col: string, op: string, value: unknown) { calls.push([table, "not", col, op, value]); return chain; },
        maybeSingle: async () => ({ data: { id: "c", lat: 45, lng: 9 } }),
        update(payload: Record<string, unknown>) { written = payload; return chain; },
        then(resolve: (value: unknown) => void) { resolve({ data: table === "stores" ? stores : null }); },
      };
      return chain;
    },
  };
  routes([0, 1, 2].map((i) => ({ originIndex: 0, destinationIndex: i, condition: "ROUTE_EXISTS", status: {}, distanceMeters: [20000, 12345, 30000][i], duration: "2731s" })), (_url, init) => {
    expect(JSON.parse(String(init?.body)).destinations).toHaveLength(3);
  });
  const result = await calcolaSedeVicina(sb as unknown as SupabaseClient, "c");
  expect(result).toEqual({ sede_id: "s2", sede_nome: "Sede 2", km: 12.3, minuti: 46, messaggio: null });
  expect(written).toEqual({ sede_piu_vicina_id: "s2", sede_piu_vicina_km: 12.3, sede_piu_vicina_min: 46, sede_piu_vicina_calcolata_il: expect.any(String) });
  expect(calls).toEqual([["cantieri", "select", "id, lat, lng"], ["cantieri", "eq", "id", "c"], ["stores", "select", "id, nome, lat, lng"], ["stores", "eq", "attivo", true], ["stores", "not", "lat", "is", null], ["stores", "not", "lng", "is", null], ["cantieri", "eq", "id", "c"]]);
});