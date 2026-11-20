import { describe, expect, it, mock } from "bun:test";
mock.module("@/integrations/supabase/client", () => ({ supabase: {} }));
const { idSoggettiDiEntita, idSoggettoDiEntita, BLOCCO_LETTURE_CERVED } = await import("../src/lib/cerved/cerved-letture");
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function finto(righe: Record<string, string | number | null>[]) {
  const chiamate: { col: string; vals: string[] }[] = [];
  const client = { from: (t: string) => {
    expect(t).toBe("cerved_soggetti");
    return { select: () => ({
      in: async (col: string, vals: string[]) => { chiamate.push({ col, vals }); return { data: righe.filter(r => vals.includes(r[col] as string)), error: null }; },
      eq: (col: string, v: string) => ({ maybeSingle: async () => { chiamate.push({ col, vals: [v] }); return { data: righe.find(r => r[col] === v) ?? null, error: null }; } }),
    }) };
  } };
  return { client, chiamate };
}

describe("cerved-letture", () => {
  it("cliente usa cliente_id, lead usa lead_id", async () => {
    const f = finto([{ cliente_id: "c1", lead_id: null, id_soggetto: 11 }, { cliente_id: null, lead_id: "l1", id_soggetto: 11 }]);
    expect(await idSoggettoDiEntita("cliente", "c1", f.client)).toBe(11);
    expect(await idSoggettoDiEntita("lead", "l1", f.client)).toBe(11);
    expect(await idSoggettoDiEntita("lead", "c1", f.client)).toBeNull();
    expect(f.chiamate.map(c => c.col)).toEqual(["cliente_id", "lead_id", "lead_id"]);
  });
  it("Map a blocchi, solo entità collegate", async () => {
    const ids = Array.from({ length: 320 }, (_, i) => `c${i}`);
    const f = finto([{ cliente_id: "c0", id_soggetto: 10 }, { cliente_id: "c200", id_soggetto: 12 }]);
    const m = await idSoggettiDiEntita("cliente", [...ids, "c0"], f.client);
    expect([...m]).toEqual([["c0", 10], ["c200", 12]]);
    expect(f.chiamate.map(c => c.vals.length)).toEqual([BLOCCO_LETTURE_CERVED, BLOCCO_LETTURE_CERVED, 20]);
  });
});

describe("guardia FM90: schermate leggono per id_soggetto", () => {
  const file: string[] = [];
  const giro = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) giro(p); else if (/\.tsx?$/.test(n)) file.push(p); } };
  giro(join(import.meta.dir, "../src"));
  it("nessun filtro per cliente_id/lead_id su cerved_report/cerved_fotografie fuori dal server", () => {
    const violazioni: string[] = [];
    for (const p of file) {
      if (/src\/lib\/cerved\/.*\.(server|functions)\.ts$/.test(p)) continue;
      const s = readFileSync(p, "utf8");
      const re = /from\(\s*["'](cerved_report|cerved_fotografie)["']\s*\)([\s\S]*?)(?:;|\n\s*\n)/g;
      for (const m of s.matchAll(re)) if (/\.(eq|in|match|or|filter)\(\s*["'`](cliente_id|lead_id)/.test(m[2] ?? "")) violazioni.push(p);
    }
    expect(violazioni).toEqual([]);
  });
});
