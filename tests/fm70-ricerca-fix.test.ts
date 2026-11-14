import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const prima = readFileSync("drizzle/migrations/0219_fm70_ricerca_articoli_fetta1.sql", "utf8");
const fix = readFileSync("drizzle/migrations/0220_fm70_ricerca_articoli_fix.sql", "utf8");
const ricerca = (sql: string) => sql.slice(sql.indexOf("FUNCTION public.cerca_articoli(testo"), sql.indexOf("END; $function$;", sql.indexOf("FUNCTION public.cerca_articoli(testo")));

describe("FM70 ricerca fix", () => {
  test("query senza varianti e pg_trgm qualificato: nessun altro cambio alla ricerca", () => {
    const attesa = ricerca(prima)
      .replace("normalizza_testo_ricerca(testo)", "normalizza_testo_ricerca(testo, false)")
      .replaceAll("THEN similarity(", "THEN extensions.similarity(");
    expect(ricerca(fix)).toBe(attesa);
    expect(fix.match(/extensions\.similarity\(/g)?.length).toBe(2);
    expect(fix).not.toMatch(/(?<!\.)\bsimilarity\(/);
  });
  test("varianti solo opzionali, mm verso cm e cm verso mm sui numeri interi", () => {
    expect(fix).toContain("_varianti boolean DEFAULT true");
    expect(fix).toContain("IF _varianti THEN");
    expect(fix).toContain("_n>=100 AND _p>=100 AND mod(_n,10)=0 AND mod(_p,10)=0");
    expect(fix).toContain("_n BETWEEN 10 AND 999 AND _p BETWEEN 10 AND 999");
    expect(fix).toContain("(?<![0-9.])([0-9]+)x([0-9]+)(?![0-9.])");
    expect(fix).toContain("UPDATE public.articoli_gamma SET testo_ricerca=public.normalizza_testo_ricerca(codice);");
  });
});