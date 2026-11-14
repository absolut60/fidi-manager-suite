import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync("drizzle/migrations/0211_fm68_indicatore_cliente_preventivo.sql", "utf8");
const clienteSql = readFileSync("drizzle/migrations/0209_fm68_dati_cliente_preventivo_cf_tipo.sql", "utf8");
describe("FM68 indicatore cliente: contratto senza dettagli finanziari", () => {
  it("restituisce solo stadio e tre booleani", () => {
    expect(sql.match(/RETURNS TABLE\(([^)]+)\)/)?.[1]).toBe("stadio text, bloccato boolean, in_legale boolean, scaduto_presente boolean");
  });
  it("applica esattamente il gate e l'ambito di dati_cliente_preventivo", () => {
    expect(sql.match(/IF NOT[\s\S]*?END IF;/)?.[0]).toBe(clienteSql.match(/IF NOT[\s\S]*?END IF;/)?.[0]);
    const where = (s: string) => s.slice(s.indexOf("WHERE c.id=")).split(";", 1)[0].replace(/_cliente_id/g, "_id").replace(/\s+/g, " ");
    expect(where(sql)).toBe(where(clienteSql));
    expect(sql).toContain("ERRCODE='42501'");
  });
  it("legge stadio e scaduto dalle sole fonti canoniche", () => {
    expect(sql).toContain("public.calcola_semaforo_affidabilita_batch(ARRAY[_cliente_id]) sem");
    expect(sql).toContain("public.scaduto_semaforo_batch(ARRAY[_cliente_id]) sc");
    expect(sql).toContain("SELECT sem.stadio, coalesce(c.bloccato,false), coalesce(c.in_gestione_legale,false), coalesce(sc.eur_scaduto,0) > 0");
  });
  it("non apre l'esecuzione ad anon o PUBLIC", () => {
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.indicatore_cliente_preventivo(uuid) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.indicatore_cliente_preventivo(uuid) TO authenticated, service_role;");
  });
});