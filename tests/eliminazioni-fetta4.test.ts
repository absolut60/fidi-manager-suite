import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { eliminaConEsito } from "../src/lib/esito-eliminazione";
const leggi = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
function client(count: number, calls: string[]) {
  const query = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ error: null, count })), eq: (k: string, v: string) => { calls.push(`eq:${k}:${v}`); return query; }, not: (k: string) => { calls.push(`not:${k}`); return query; }, in: (_k: string, ids: string[]) => { calls.push(`ids:${ids.length}`); return query; } };
  return { from: (table: string) => { calls.push(table); return { delete: (options: { count: string }) => { calls.push(options.count); return query; } }; } } as unknown as SupabaseClient<Database>;
}
test("client server opzionale: count reale 2 su 3, filtro originale e nessuna riga restituita", async () => {
  const calls: string[] = [];
  const esito = await eliminaConEsito("reminder", { richiesti: 3, filtro: q => q.not("scadenza_id", "is", null) }, undefined, client(2, calls));
  expect(esito).toEqual({ tipo: "parziale", eliminati: 2, richiesti: 3 });
  expect(calls).toEqual(["reminder", "exact", "not:scadenza_id"]);
});
test("conteggio server completo 3 realmente eliminati e ids deduplicati", async () => {
  const calls: string[] = [];
  expect(await eliminaConEsito("azioni_recupero", ["a", "b", "c", "a"], undefined, client(3, calls))).toEqual({ tipo: "eliminato", eliminati: 3 });
  expect(calls).toEqual(["azioni_recupero", "exact", "ids:3"]);
});
test("cascata azione: esito allegati negato interrompe prima di Storage e padre", () => {
  const code = leggi("src/components/cliente-attivita-recupero-tab.tsx").split("export async function eliminaAzioneConAllegati")[1]?.split("export function ClienteAttivita")[0] ?? "";
  const stop = code.indexOf('if (esito.tipo !== "eliminato") return');
  expect(stop).toBeGreaterThan(code.indexOf('eliminaConEsito("allegati"'));
  expect(code.indexOf('.storage.from')).toBeGreaterThan(stop);
  expect(code.indexOf('eliminaConEsito("azioni_recupero"')).toBeGreaterThan(code.indexOf('.storage.from'));
});
test("server: conteggi da esito e cascate interrotte; filtri sollecito/reset invariati", () => {
  for (const path of ["sollecito-massivo", "cleanup-recupero", "scadenze-reset"]) {
    const code = leggi(`src/lib/${path}.functions.ts`);
    expect(code).not.toContain(".delete()"); expect(code).toContain('esito.tipo !== "eliminato"'); expect(code).toContain('esito.eliminati ?? 0');
  }
  expect(leggi("src/lib/sollecito-massivo.functions.ts")).toContain('q.eq("campagna_id", data.campagnaId)');
  expect(leggi("src/lib/scadenze-reset.functions.ts")).toContain('q.not("scadenza_id", "is", null)');
  expect(leggi("src/lib/cleanup-recupero.functions.ts")).toContain('q.eq("entita_tipo", "azione_recupero")');
});
