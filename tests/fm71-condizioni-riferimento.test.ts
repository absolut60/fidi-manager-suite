import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync("drizzle/migrations/0223_fm71_condizioni_riferimento.sql", "utf8");
const originale = readFileSync("drizzle/migrations/0198_fm65_motore_prezzi_preventivo.sql", "utf8");
const controlli = (testo: string) => testo.match(/  IF NOT public\.auth_ha_accesso_preventivi\(\) THEN[\s\S]*?USING ERRCODE = '22023';\s+END IF;/)?.[0];

describe("FM71 condizioni di riferimento: contratto del wrapper SQL", () => {
  test("conserva esattamente gate e limite massimo 500 del motore cliente", () => {
    expect(controlli(sql)).toBeDefined();
    expect(controlli(sql)).toBe(controlli(originale));
    expect(sql).toContain("cardinality(_codici), 0) > 500");
  });

  test("esclude sottocategoria e tutti gli accordi personali 50/60/90", () => {
    expect(sql).toMatch(/_listino, _store_id, _macrocategoria, _categoria,\s+NULL \/\* sottocategoria \*\/, NULL \/\* cliente_codice \*\/, NULL \/\* listino_piu_articoli \*\/,\s+_codici, _data/);
  });

  test("riusa il motore interno senza modificare motori o policy esistenti", () => {
    expect(sql.match(/CREATE (?:OR REPLACE )?FUNCTION/g)).toHaveLength(1);
    expect(sql).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION public\.(?:prezzi_preventivo_cliente|_prezzo_preventivo_articoli|_prezzo_vendita_articoli)\(/);
    expect(sql).not.toMatch(/(?:CREATE|ALTER|DROP) POLICY/i);
  });

  test("aggiunge solo tre condizioni facoltative e FK del listino", () => {
    expect(sql.match(/ADD COLUMN/g)).toHaveLength(3);
    expect(sql).toContain("listino_rif smallint NULL REFERENCES public.listini_gamma(codice)");
    expect(sql).toContain("macrocategoria_rif text NULL");
    expect(sql).toContain("categoria_rif text NULL");
    expect(sql).not.toMatch(/\bUPDATE public\.preventivi\b/);
  });
});