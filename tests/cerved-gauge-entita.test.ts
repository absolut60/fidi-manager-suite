import { describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
mock.module("@/integrations/supabase/client", () => ({ supabase: {} }));
const { leggiEntitaConReportCerved, chiaveEntitaConReportCerved, chiaveClientiConReportCerved } = await import("../src/hooks/use-clienti-con-report-cerved");

function finto(soggetti: Record<string, unknown>[]) {
  const colonne: string[] = [];
  const q = (righe: Record<string, unknown>[]) => {
    const o: any = { select: () => o, eq: () => o, order: async () => ({ data: righe, error: null }),
      in: (col: string, vals: unknown[]) => { colonne.push(col); const r = righe.filter(x => vals.includes(x[col])); const p: any = Promise.resolve({ data: r, error: null }); p.eq = () => p; p.order = async () => ({ data: r, error: null }); p.in = () => p; return p; } };
    return o;
  };
  const client = { from: (t: string) => t === "cerved_soggetti" ? q(soggetti)
    : t === "cerved_report" ? q([{ id_soggetto: 7 }])
    : q([{ id_soggetto: 7, letta_il: "2026-01-01", cgs_codice: null, cgs_valore: "41" }]) };
  return { client, colonne };
}

describe("FM90 gauge per entità", () => {
  it("lead passa da lead_id e poi id_soggetto", async () => {
    const f = finto([{ lead_id: "l1", id_soggetto: 7 }, { lead_id: "l2", id_soggetto: 8 }]);
    const m = await leggiEntitaConReportCerved("lead", ["l1", "l2"], f.client);
    expect([...m.keys()]).toEqual(["l1"]);
    expect(m.get("l1")?.score).toBe(41);
    expect(f.colonne).toEqual(["lead_id", "id_soggetto", "id_soggetto"]);
  });
  it("cliente invariato: cliente_id e chiave v3", async () => {
    const f = finto([{ cliente_id: "c1", id_soggetto: 7 }]);
    const m = await leggiEntitaConReportCerved("cliente", ["c1"], f.client);
    expect(m.get("c1")?.score).toBe(41);
    expect(f.colonne[0]).toBe("cliente_id");
    expect(chiaveEntitaConReportCerved("cliente", ["b", "a"])).toEqual(chiaveClientiConReportCerved(["a", "b"]));
    expect(chiaveClientiConReportCerved(["a"])[1]).toBe("v3");
  });
  it("useClientiConReportCerved è involucro", () => {
    const s = readFileSync(new URL("../src/hooks/use-clienti-con-report-cerved.ts", import.meta.url), "utf8");
    expect(s).toMatch(/export function useClientiConReportCerved\(ids: string\[\], enabled = true\) \{\n  return useEntitaConReportCerved\("cliente", ids, enabled\);\n\}/);
  });
});
