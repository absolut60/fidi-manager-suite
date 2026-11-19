import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Esegue il vero acquistaLightReport senza rete: i soli confini esterni sostituiti sono
// fetch (cattura del corpo inviato) e il client privilegiato per il registro cerved_chiamate.
const fonte = readFileSync(new URL("../src/lib/cerved/cerved.server.ts", import.meta.url), "utf8");
const js = ts.transpileModule(
  fonte.replace('import("@/integrations/supabase/client.server")', "Promise.resolve({supabaseAdmin: admin})"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

type ChiamataHttp = { url: string; metodo: string; corpo: Record<string, unknown> | undefined };

function scenario(risposta: Record<string, unknown> = { request_id: "req-1", delivery_status: "DELIVERED" }) {
  const http: ChiamataHttp[] = [];
  const scritture: { tabella: string; dati: any }[] = [];
  const admin = {
    from(tabella: string) {
      const q: any = {
        insert: (dati: any) => { scritture.push({ tabella, dati }); return q; },
        select: () => q,
        single: async () => ({ data: { id: "chiamata-1" }, error: null }),
      };
      return q;
    },
  };
  const fetchFinta = async (url: string, opts: any) => {
    http.push({
      url,
      metodo: opts?.method ?? "GET",
      corpo: opts?.body ? JSON.parse(opts.body) : undefined,
    });
    return { ok: true, status: 200, text: async () => JSON.stringify(risposta) };
  };
  const processFinto = { env: { CERVED_API_KEY: "chiave-di-prova" } };
  const mod: any = {};
  new Function("exports", "admin", "fetch", "process", js)(mod, admin, fetchFinta, processFinto);
  return { mod, http, scritture };
}

describe("FM79 corpo di acquisto Light Report", () => {
  it("DEFERRED restituisce subito il request_id senza recuperi", async () => {
    const s = scenario({ request_id: "4839611059", delivery_status: "DEFERRED" });
    const r = await s.mod.acquistaLightReport("42", "XML", null, { utenteId: null, clienteId: null });
    expect(r.request_id).toBe("4839611059");
    expect(r.delivery_status).toBe("DEFERRED");
    expect(s.http).toHaveLength(1);
  });
  it("il registro non contiene content ma conserva la lunghezza", async () => {
    const s = scenario({ request_id: "req", content: "YWJj", delivery_status: "DELIVERED" });
    const r = await s.mod.acquistaLightReport("42", "XML", null, { utenteId: null, clienteId: null });
    expect(s.scritture[0]?.dati.risposta).toEqual({ request_id: "req", delivery_status: "DELIVERED", lunghezza_base64: 4 });
    expect(r.risposta.content).toBe("YWJj");
  });
  it("invia subject_type COMPANY con gli altri campi invariati", async () => {
    const { mod, http, scritture } = scenario();
    const esito = await mod.acquistaLightReport("382485168", "XML", "12345", { utenteId: "op", clienteId: "cli" });
    expect(esito.esito).toBe("ok");
    expect(http).toHaveLength(1);
    expect(http[0]!.url).toBe("https://api.cerved.com/cervedApiB2B/v1/purchase");
    expect(http[0]!.metodo).toBe("POST");
    expect(http[0]!.corpo).toEqual({
      format: "XML",
      subject_type: "COMPANY",
      product_id: 52015,
      subject_id: 382485168,
      language: "ITALIAN",
      reference: "12345",
    });
    // Il registro conserva il corpo realmente inviato.
    expect(scritture[0]!.tabella).toBe("cerved_chiamate");
    expect(scritture[0]!.dati.parametri.corpo.subject_type).toBe("COMPANY");
  });

  it("senza reference il corpo resta completo di subject_type", async () => {
    const { mod, http } = scenario();
    await mod.acquistaLightReport("7883047", "PDF", null, { utenteId: null, clienteId: null });
    expect(http[0]!.corpo).toEqual({
      format: "PDF",
      subject_type: "COMPANY",
      product_id: 52015,
      subject_id: 7883047,
      language: "ITALIAN",
    });
  });
});
