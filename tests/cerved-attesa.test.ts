import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { RUOLI_AGGIORNANO_CERVED } from "../src/lib/permessi-cerved";

const leggi = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
function compila(fonte: string) {
  return ts.transpileModule(fonte.replace(/^import .*;\n/gm, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

function scenario({ stato = "in_attesa", ore = 49, consegna = false, errore = false } = {}) {
  const report = { id: "report", cliente_id: "cliente", id_soggetto: 42, request_id: "4839611059", stato };
  let recuperi = 0, avvisi = 0;
  const ctx: unknown[] = [];
  const admin = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: report, error: null }) }) }) }),
    rpc: async (nome: string, args: any) => {
      expect(nome).toBe("blocca_report_cerved_e_notifica");
      expect(args._ruoli).toEqual([...RUOLI_AGGIORNANO_CERVED]);
      const bloccato = report.stato === "in_attesa" && ore > 48;
      if (bloccato) { report.stato = "bloccato"; avvisi++; }
      return { data: bloccato, error: null };
    },
  };
  const recupera = async (r: any, c: unknown) => {
    expect(r.request_id).toBe("4839611059");
    recuperi++; ctx.push(c);
    if (errore) throw new Error("Errore temporaneo");
    if (consegna) report.stato = "consegnato";
    return { xml_ok: consegna, errori: [] };
  };
  const exports: any = {};
  new Function("exports", "supabaseAdmin", "recuperaESalvaLightReport", "RUOLI_AGGIORNANO_CERVED",
    compila(leggi("src/lib/cerved/cerved-attesa.server.ts")))(exports, admin, recupera, RUOLI_AGGIORNANO_CERVED);
  return { esegui: () => exports.recuperaReportCervedInAttesa("report"), report, ctx, conteggi: () => ({ recuperi, avvisi }) };
}

describe("FM85 recupero automatico", () => {
  it("in_attesa diventa consegnato: un solo recupero gratuito, operatore null", async () => {
    const s = scenario({ consegna: true }); await s.esegui();
    expect(s.report.stato).toBe("consegnato");
    expect(s.conteggi()).toEqual({ recuperi: 1, avvisi: 0 });
    expect(s.ctx).toEqual([{ utenteId: null, clienteId: "cliente" }]);
  });
  it("oltre 48 h diventa bloccato con un solo avviso, anche al secondo giro", async () => {
    const s = scenario(); await s.esegui(); await s.esegui();
    expect(s.report.stato).toBe("bloccato");
    expect(s.conteggi()).toEqual({ recuperi: 1, avvisi: 1 });
  });
  it("a 48 h esatte resta in attesa", async () => {
    const s = scenario({ ore: 48 }); await s.esegui();
    expect(s.report.stato).toBe("in_attesa"); expect(s.conteggi().avvisi).toBe(0);
  });
  it("bloccato non viene ritentato", async () => {
    const s = scenario({ stato: "bloccato" }); await s.esegui();
    expect(s.conteggi()).toEqual({ recuperi: 0, avvisi: 0 });
  });
  it("un recupero fallito oltre 48 h applica comunque il blocco", async () => {
    const s = scenario({ errore: true }); await s.esegui();
    expect(s.report.stato).toBe("bloccato"); expect(s.conteggi().avvisi).toBe(1);
  });
  it("cron orario, un report per step e un errore non blocca il successivo; nessun acquisto", async () => {
    const fonte = leggi("src/lib/inngest/functions.server.ts");
    const inizio = fonte.indexOf("export const recuperoOrarioCerved");
    const job = fonte.slice(inizio, fonte.indexOf("/*", inizio));
    const exports: any = {}, steps: string[] = [], recuperi: string[] = [];
    let handler: any, config: any;
    const q: any = { select: () => q, eq: (k: string, v: string) => { expect([k,v]).toEqual(["stato","in_attesa"]); return q; }, order: () => q, range: async () => ({ data: [{ id: "uno" }, { id: "due" }], error: null }) };
    new Function("exports", "inngest", "supabaseAdmin", "recuperaReportCervedInAttesa", compila(job))(
      exports, { createFunction: (c: any, h: any) => { config = c; handler = h; } }, { from: () => q },
      async (id: string) => { recuperi.push(id); if (id === "uno") throw new Error("fallito"); });
    await handler({ step: { run: async (nome: string, fn: any) => { steps.push(nome); return fn(); } }, logger: { error: () => {} } });
    expect(config.triggers).toEqual([{ cron: "0 * * * *" }]);
    expect(recuperi).toEqual(["uno", "due"]);
    expect(steps).toEqual(["report-in-attesa", "recupero-uno", "recupero-due"]);
    expect(job.includes("acquistaLightReport")).toBe(false);
  });
});

describe("FM85 Riprova ora", () => {
  function manuale(permesso: boolean, visibile = true) {
    let recuperi = 0, letture = 0;
    const report = { id: "report", cliente_id: "cliente", id_soggetto: "42", request_id: "4839611059", stato: "bloccato" };
    const server = { recuperaESalvaLightReport: async (r: any, ctx: any) => {
      recuperi++; expect(r.id_soggetto).toBe(42); expect(ctx).toEqual({ utenteId: "utente", clienteId: "cliente" });
      report.stato = "consegnato"; return { xml_ok: true, errori: [] };
    } };
    const b: any = { middleware: () => b, inputValidator: () => b, handler: (h: any) => h };
    const exports: any = {};
    new Function("exports", "server", "createServerFn", "requireSupabaseAuth", "z",
      compila(leggi("src/lib/cerved/cerved-attesa.functions.ts").replace('import("./cerved.server")', 'Promise.resolve(server)')))(exports, server, () => b, {}, {});
    const supabase = { rpc: async (nome: string) => { expect(nome).toBe("auth_puo_aggiornare_cerved"); return { data: permesso, error: null }; },
      from: () => { letture++; return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: visibile ? report : null, error: null }) }) }) }; } };
    return { esegui: () => exports.riprovaReportCerved({ data: { reportId: "report" }, context: { supabase, userId: "utente" } }), conteggi: () => ({ recuperi, letture }), report };
  }
  it("permesso negato: nessuna lettura privilegiata né recupero", async () => {
    const s = manuale(false); await expect(s.esegui()).rejects.toThrow("Non hai il permesso");
    expect(s.conteggi()).toEqual({ recuperi: 0, letture: 0 });
  });
  it("RLS nega il report: nessun recupero", async () => {
    const s = manuale(true, false); await expect(s.esegui()).rejects.toThrow("non trovato"); expect(s.conteggi().recuperi).toBe(0);
  });
  it("autorizzato recupera anche un bloccato senza acquisto", async () => {
    const s = manuale(true); expect((await s.esegui()).xml_ok).toBe(true);
    expect(s.report.stato).toBe("consegnato"); expect(s.conteggi().recuperi).toBe(1);
  });
});