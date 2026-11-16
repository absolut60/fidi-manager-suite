import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Esegue il vero handler senza rete e senza mock globali che contaminerebbero gli altri test.
// Le sole sostituzioni sono i confini esterni (builder RPC, moduli Cerved/client privilegiato).
const fonte = readFileSync(new URL("../src/lib/cerved/cerved-cliente.functions.ts", import.meta.url), "utf8");
const js = ts.transpileModule(fonte
  .replace(/^import .*;\n/gm, "")
  .replace('import("./cerved.server")', "Promise.resolve(server)")
  .replace('import("@/integrations/supabase/client.server")', "Promise.resolve({supabaseAdmin: admin})"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function scenario({ collegato = true, valido = true, permesso = true, erroreAcquisto = false, erroriRecupero = [] as string[], erroreRicerca = false } = {}) {
  const scritture: { tabella: string; azione: string; dati: any }[] = [];
  const chiamate: string[] = [];
  const filtri: { campo: string; valore: any }[] = [];
  const cliente = { id: "19b28888-8928-4ec3-9e6a-811e97113b4f", partita_iva: "14475121001", codice_gestionale: "123" };
  const report = { id: "report", cliente_id: cliente.id, id_soggetto: 42, request_id: "richiesta", scade_il: "2099-01-01T00:00:00Z" };
  const admin = {
    from(tabella: string) {
      let azione = "lettura";
      const q: any = {
        select: () => q, eq: () => q, order: () => q, limit: () => q,
        gt: (campo: string, valore: any) => { filtri.push({ campo, valore }); return q; },
        insert: (dati: any) => { azione = "insert"; scritture.push({ tabella, azione, dati }); return q; },
        update: (dati: any) => { azione = "update"; scritture.push({ tabella, azione, dati }); return q; },
        upsert: (dati: any, opzioni: any) => { azione = "upsert"; scritture.push({ tabella, azione, dati: { ...dati, opzioni } }); return q; },
        maybeSingle: async () => ({ data: tabella === "cerved_soggetti" ? collegato ? { id_soggetto: 42, denominazione_cerved: "BUILD" } : null : valido ? report : null, error: null }),
        single: async () => ({ data: report, error: null }),
        then: (risolvi: any) => Promise.resolve({ data: null, error: null }).then(risolvi),
      };
      return q;
    },
  };
  const server: any = {
    cercaSoggettoPerPiva: async (piva: string) => { chiamate.push(`ricerca:${piva}`); return erroreRicerca ? { esito: "errore", errore: "403" } : { esito: "ok", risposta: {}, chiamata_id: "ricerca" }; },
    scegliAziendaPerPiva: () => ({}),
    normalizzaAziendaCerved: () => ({ id_soggetto: 42, denominazione: "BUILD" }),
    PRODOTTO_LIGHT_REPORT: "light_report",
    acquistaLightReport: async () => { chiamate.push("acquisto"); return erroreAcquisto ? { esito: "errore", errore: "403" } : { esito: "ok", request_id: "richiesta", chiamata_id: "acquisto" }; },
    recuperaESalvaLightReport: async (rep: any) => {
      chiamate.push(`recupero:${rep.request_id}`);
      // Il contratto di recupero comprende fotografia XML e PDF: il chiamante delega senza duplicare.
      scritture.push({ tabella: "recupero_light_report", azione: "delega", dati: rep });
      return { xml_ok: erroriRecupero.length === 0, pdf_ok: true, errori: erroriRecupero };
    },
  };
  for (const nome of ["leggiProfilo", "leggiScore", "elencoBilanciCerved", "bilancioCerved", "eventiNegativiFlag"]) {
    server[nome] = () => { chiamate.push(nome); throw new Error(`Chiamata granulare vietata: ${nome}`); };
  }
  const builder = () => {
    const b: any = { middleware: () => b, inputValidator: () => b, handler: (h: any) => h };
    return b;
  };
  const exports: any = {};
  new Function("exports", "server", "admin", "createServerFn", "requireSupabaseAuth", "z", js)(exports, server, admin, builder, {}, {});
  const esegui = () => exports.aggiornaCervedCliente({ data: { clienteId: cliente.id }, context: {
    userId: "operatore", supabase: { rpc: async () => ({ data: permesso, error: null }), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cliente }) }) }) }) },
  } });
  return { esegui, chiamate, scritture, filtri };
}

describe("FM79 aggiornamento solo Light Report", () => {
  it("fotografie esistenti mai aggiornate/eliminate; recupero delegato conserva XML e PDF", () => {
    const ast = ts.createSourceFile("cerved-cliente.functions.ts", fonte, ts.ScriptTarget.Latest, true);
    const mutazioni: string[] = [];
    const visita = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const metodo = n.expression.name.text;
        if (["delete", "update", "upsert"].includes(metodo) && n.expression.expression.getText(ast).includes('from("cerved_fotografie")')) mutazioni.push(metodo);
      }
      ts.forEachChild(n, visita);
    };
    visita(ast);
    expect(mutazioni).toEqual([]);
    const server = readFileSync(new URL("../src/lib/cerved/cerved.server.ts", import.meta.url), "utf8");
    const recupero = server.slice(server.indexOf("export async function recuperaESalvaLightReport("));
    expect(recupero).toContain('recuperaDocumentoFormato(report.request_id, "XML", ctx)');
    expect(recupero).toContain('recuperaDocumentoFormato(report.request_id, "PDF", ctx)');
    expect(recupero).toContain('tipo: "light_report"');
    expect(recupero).toContain('dati: normalizzaLightReportXml(doc.contenuto_xml)');
    expect(recupero).toContain('.upload(dest, byte, { contentType: "application/pdf", upsert: true })');
  });
  it("cliente collegato: nessuna ricerca, fotografia granulare o acquisto se il report è valido", async () => {
    const s = scenario(); const r = await s.esegui();
    expect(s.chiamate).toEqual(["recupero:richiesta"]);
    expect(s.scritture.map(x => [x.tabella, x.azione])).toEqual([["cerved_soggetti", "update"], ["recupero_light_report", "delega"]]);
    expect(s.scritture[0].dati.aggiornato_da).toBe("operatore");
    expect(Number.isNaN(Date.parse(s.scritture[0].dati.ultimo_aggiornamento))).toBe(false);
    expect(s.filtri[0].campo).toBe("scade_il");
    expect(Number.isNaN(Date.parse(s.filtri[0].valore))).toBe(false);
    expect(r).toEqual({ nuovo_collegamento: false, id_soggetto: 42, denominazione_cerved: "BUILD", light_report_acquistato: false, light_report_recuperato: true, errori: [] });
  });
  it("primo collegamento: ricerca per PIVA e sola fotografia ricerca prima del Light Report", async () => {
    const s = scenario({ collegato: false, valido: false }); const r = await s.esegui();
    expect(s.chiamate).toEqual(["ricerca:14475121001", "acquisto", "recupero:richiesta"]);
    expect(s.scritture.filter(x => x.tabella === "cerved_fotografie").flatMap(x => x.dati.map((f: any) => f.tipo))).toEqual(["ricerca"]);
    expect(s.scritture.find(x => x.tabella === "cerved_soggetti")?.azione).toBe("insert");
    const registrazione = s.scritture.find(x => x.tabella === "cerved_report")?.dati;
    expect(registrazione.opzioni).toEqual({ onConflict: "request_id" });
    expect(new Date(registrazione.scade_il).getUTCFullYear()).toBe(new Date(registrazione.acquistato_il).getUTCFullYear() + 1);
    expect(r.nuovo_collegamento).toBe(true); expect(r.light_report_acquistato).toBe(true);
  });
  it("collegato senza report valido: acquisto e recupero senza nuove fotografie granulari", async () => {
    const s = scenario({ valido: false }); await s.esegui();
    expect(s.chiamate).toEqual(["acquisto", "recupero:richiesta"]);
    expect(s.scritture.filter(x => x.tabella === "cerved_fotografie")).toEqual([]);
  });
  it("errore acquisto: restituisce errori e non recupera, nessuna scrittura granulare", async () => {
    const s = scenario({ valido: false, erroreAcquisto: true }); const r = await s.esegui();
    expect(s.chiamate).toEqual(["acquisto"]);
    expect(r.errori).toEqual(["Light Report: 403"]);
    expect(r.light_report_acquistato).toBe(false); expect(r.light_report_recuperato).toBe(false);
  });
  it("errori recupero mantenuti in uscita", async () => {
    const s = scenario({ erroriRecupero: ["XML: 403", "PDF: 403"] }); const r = await s.esegui();
    expect(r.errori).toEqual(["XML: 403", "PDF: 403"]); expect(r.light_report_recuperato).toBe(false);
    expect(s.chiamate).toEqual(["recupero:richiesta"]);
  });
  it("permesso negato: nessuna chiamata Cerved né scrittura", async () => {
    const s = scenario({ permesso: false }); await expect(s.esegui()).rejects.toThrow("Non hai il permesso");
    expect(s.chiamate).toEqual([]); expect(s.scritture).toEqual([]);
  });
  it("ricerca iniziale fallita: nessun collegamento o acquisto", async () => {
    const s = scenario({ collegato: false, erroreRicerca: true }); await expect(s.esegui()).rejects.toThrow("403");
    expect(s.chiamate).toEqual(["ricerca:14475121001"]); expect(s.scritture).toEqual([]);
  });
});