import { afterAll, beforeEach, expect, mock, test } from "bun:test";

const fetchOriginale = globalThis.fetch;
afterAll(() => { globalThis.fetch = fetchOriginale; });

let rpcRisposta: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const rpcChiamate: Array<{ nome: string; args: unknown }> = [];
const ordine: string[] = [];

const catena = (): Record<string, unknown> => {
  const c: Record<string, unknown> = {};
  c.select = (cols?: string) => (cols === "fonte" ? Promise.resolve({ data: [{ fonte: "anagrafica" }], error: null }) : c);
  c.update = () => { ordine.push("chiusura"); return c; };
  c.eq = () => c;
  c.single = async () => ({ data: { righe_totali: 1, righe_create: 1, righe_aggiornate: 0, righe_errore: 0, righe_saltate: 0, log_errori: [] }, error: null });
  return c;
};

mock.module("../src/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (nome: string, args: unknown) => { rpcChiamate.push({ nome, args }); return rpcRisposta; },
    from: () => catena(),
    storage: { from: () => ({ list: async () => ({ data: [] }), remove: async () => ({}) }) },
  },
}));

const { riconciliaLeadDopoImport } = await import("../src/lib/inngest/lead-riconciliazione.server");
const { finalizeAnagraficaImport } = await import("../src/lib/inngest/functions.server");

type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
function logger() {
  const righe: Record<"info" | "warn" | "error", string[]> = { info: [], warn: [], error: [] };
  const l: Logger = { info: (m) => righe.info.push(m), warn: (m) => righe.warn.push(m), error: (m) => righe.error.push(m) };
  return { l, righe };
}
const step = { run: async (id: string, fn: () => unknown) => { ordine.push(id); return await fn(); } };
const esegui = (f: unknown, ctx: object) => (f as { fn: (c: object) => Promise<unknown> }).fn(ctx);

beforeEach(() => { rpcChiamate.length = 0; ordine.length = 0; });

test("il job è configurato su evento, 2 tentativi e mai due esecuzioni insieme", () => {
  const o = (riconciliaLeadDopoImport as unknown as { opts: Record<string, unknown> }).opts;
  expect(o["id"]).toBe("lead-riconciliazione-clienti");
  expect(o["retries"]).toBe(2);
  expect(o["concurrency"]).toEqual({ limit: 1 });
  expect(o["triggers"]).toEqual([{ event: "lead/riconciliazione.rileva" }]);
});

test("errori per singolo lead: solo avviso nel logger, nessun throw", async () => {
  rpcRisposta = { data: { collegati: 2, da_riconciliare: 1, chiusi: 0, errori: [{ lead_id: "x", errore: "boom" }] }, error: null };
  const { l, righe } = logger();
  const r = await esegui(riconciliaLeadDopoImport, { event: { data: { importazioneId: "imp-1" } }, step, logger: l });
  expect(rpcChiamate).toEqual([{ nome: "riconcilia_lead_clienti", args: { _importazione_id: "imp-1", _operatore: null } }]);
  expect(r).toEqual({ collegati: 2, da_riconciliare: 1, chiusi: 0, errori: 1 });
  expect(righe.warn.length).toBe(1);
  expect(righe.warn[0]).toContain("boom");
  expect(righe.info[0]).toContain("collegati=2");
});

test("errore della chiamata al database: throw, così Inngest ritenta", async () => {
  rpcRisposta = { data: null, error: { message: "timeout" } };
  const { l } = logger();
  await expect(esegui(riconciliaLeadDopoImport, { event: { data: { importazioneId: "imp-1" } }, step, logger: l })).rejects.toThrow("timeout");
});

function simulaGateway(fallisciRiconciliazione: boolean) {
  const eventi: string[] = [];
  process.env["LOVABLE_API_KEY"] = "k";
  process.env["INNGEST_API_KEY"] = "k";
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    const corpo = JSON.parse(init?.body ?? "[]") as Array<{ name: string }> | { name: string };
    const nomi = (Array.isArray(corpo) ? corpo : [corpo]).map((e) => e.name);
    if (fallisciRiconciliazione && nomi.includes("lead/riconciliazione.rileva")) {
      return new Response("errore", { status: 500 });
    }
    eventi.push(...nomi);
    ordine.push(...nomi.map((n) => `evento:${n}`));
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  return eventi;
}

test("finalize anagrafica emette la riconciliazione dopo la chiusura e prima della pulizia", async () => {
  const eventi = simulaGateway(false);
  const { l } = logger();
  await esegui(finalizeAnagraficaImport, { event: { data: { importazioneId: "imp-2" } }, step, logger: l });
  expect(eventi).toContain("lead/riconciliazione.rileva");
  const iChiusura = ordine.indexOf("chiusura");
  const iStep = ordine.indexOf("emetti-riconciliazione-lead");
  const iEvento = ordine.indexOf("evento:lead/riconciliazione.rileva");
  const iPulizia = ordine.indexOf("cleanup-staging");
  expect(iChiusura).toBeGreaterThanOrEqual(0);
  expect(iChiusura).toBeLessThan(iStep);
  expect(iStep).toBeLessThan(iEvento);
  expect(iEvento).toBeLessThan(iPulizia);
});

test("un errore di emissione della riconciliazione non fa fallire il finalize", async () => {
  simulaGateway(true);
  const { l, righe } = logger();
  const r = (await esegui(finalizeAnagraficaImport, { event: { data: { importazioneId: "imp-3" } }, step, logger: l })) as { stato: string };
  expect(r.stato).toBe("completata");
  expect(righe.error.some((m) => m.includes("riconciliazione lead"))).toBe(true);
  expect(ordine).toContain("cleanup-staging");
});
