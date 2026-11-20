import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const fonte = readFileSync(new URL("../src/lib/cerved/cerved.server.ts", import.meta.url), "utf8");
const js = ts.transpileModule(fonte.replaceAll('import("@/integrations/supabase/client.server")', "Promise.resolve({supabaseAdmin: admin})"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function scenario(xml: boolean, erroreFoto = false) {
  const eventi: any[] = [];
  const admin = {
    rpc: async (nome: string, dati: unknown) => { eventi.push({ rpc: nome, dati }); return { error: null }; },
    from: (tabella: string) => {
      let payload: any;
      const filtri: any[] = [];
      const q: any = {
        insert: (dati: any) => { payload = dati; eventi.push({ tabella, dati }); return q; },
        update: (dati: any) => { payload = dati; eventi.push({ tabella, dati, filtri }); return q; },
        select: () => q,
        single: async () => ({ data: { id: "call" }, error: null }),
        eq: (k: string, v: unknown) => { filtri.push([k, v]); return q; },
        is: (k: string, v: unknown) => { filtri.push([k, v]); return q; },
        then: (resolve: any) => Promise.resolve({ error: tabella === "cerved_fotografie" && erroreFoto ? { message: "prova" } : null }).then(resolve),
      };
      return q;
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };
  const fetch = async (url: string) => {
    eventi.push({ http: url });
    const pdf = url.endsWith("PDF");
    const body = xml ? { content: btoa(pdf ? "pdf" : "<Report />"), detailed_delivery_status: "DOCUMENT READY", delivery_status: "DELIVERED" }
      : { detailed_delivery_status: "DOCUMENT NOT READY", delivery_status: "DEFERRED" };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const mod: any = {};
  new Function("exports", "admin", "fetch", "process", js)(mod, admin, fetch, { env: { CERVED_API_KEY: "test" } });
  return { eventi, run: () => mod.recuperaESalvaLightReport({ id: "report", cliente_id: "cli", lead_id: null, id_soggetto: 42, request_id: "4839611059" }, { utenteId: "op", clienteId: "cli" }) };
}

describe("FM85 recupero e stato", () => {
  it("registra atomicamente il tentativo prima delle letture; DEFERRED non consegna", async () => {
    const s = scenario(false); const r = await s.run();
    expect(s.eventi[0]).toEqual({ rpc: "registra_tentativo_recupero_cerved", dati: { _report_id: "report" } });
    const aggiornamento = s.eventi.find(e => e.tabella === "cerved_report");
    expect(aggiornamento.dati.ultimo_esito_cerved).toBe("DOCUMENT NOT READY");
    expect(aggiornamento.dati.stato).toBeUndefined();
    expect(r.xml_ok).toBe(false);
    expect(r.errori).toEqual([]);
  });
  it("XML salvato consegna e scrive la prima data solo se ancora null", async () => {
    const s = scenario(true); const r = await s.run();
    expect(r.xml_ok).toBe(true);
    const aggiornamenti = s.eventi.filter(e => e.tabella === "cerved_report");
    expect(aggiornamenti[0].dati.stato).toBe("consegnato");
    expect(aggiornamenti[0].dati.ultimo_esito_cerved).toBe("DOCUMENT READY");
    expect(aggiornamenti[1].filtri).toContainEqual(["consegnato_il", null]);
    expect(Number.isNaN(Date.parse(aggiornamenti[1].dati.consegnato_il))).toBe(false);
  });
  it("fotografia non salvata non segna il report consegnato", async () => {
    const s = scenario(true, true); const r = await s.run();
    expect(r.xml_ok).toBe(false);
    expect(s.eventi.find(e => e.tabella === "cerved_report").dati.stato).toBeUndefined();
  });
});