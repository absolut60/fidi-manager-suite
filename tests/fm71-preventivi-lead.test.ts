import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync("drizzle/migrations/0224_fm71_preventivi_lead.sql", "utf8");

describe("FM71 preventivi ai lead: regole database", () => {
  test("vieta cliente e lead insieme e conserva la provenienza con FK", () => {
    expect(sql).toContain("CHECK (cliente_id IS NULL OR lead_id IS NULL)");
    expect(sql).toContain("lead_id uuid NULL REFERENCES public.lead(id)");
    expect(sql).toContain("lead_origine_id uuid NULL REFERENCES public.lead(id)");
  });
  test("riaggancia solo da NULL al cliente e aggiorna solo i tre collegamenti", () => {
    const corpo = sql.match(/AS \$function\$([\s\S]*?)\$function\$/)?.[1];
    expect(corpo).toContain("OLD.cliente_id IS NULL AND NEW.cliente_id IS NOT NULL");
    expect(corpo).toMatch(/SET cliente_id = NEW.cliente_id, lead_origine_id = lead_id, lead_id = NULL\s+WHERE lead_id = NEW.id;/);
    expect(corpo?.match(/UPDATE public\./g)).toHaveLength(1);
    expect(corpo).not.toMatch(/righe_preventivo|prezzo|listino_rif/);
  });
  test("condizioni proposte nullable senza FK sul pagamento", () => {
    expect(sql).toContain("ADD COLUMN condizione_pagamento_cod text NULL,");
    expect(sql).toContain("ADD COLUMN listino_rif smallint NULL REFERENCES public.listini_gamma(codice)");
    expect(sql).toContain("ADD COLUMN macrocategoria_rif text NULL");
    expect(sql).toContain("ADD COLUMN categoria_rif text NULL");
  });
  test("visibilità passa il lead al gate canonico senza cambiare le scritture", () => {
    expect(sql).toContain("public.agente_vede_record(_agente_codice, NULL, _cliente_id, _lead_id, _cantiere_id)");
    expect(sql).toContain("public.auth_vede_preventivo(agente_codice, cliente_id, cantiere_id, lead_id)");
    expect(sql).not.toContain("auth_puo_scrivere_preventivo");
    expect(sql.match(/ALTER POLICY/g)).toHaveLength(1);
  });
});