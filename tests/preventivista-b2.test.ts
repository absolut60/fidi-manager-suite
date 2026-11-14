import { describe, expect, it } from "bun:test";
import { è_preventivista, puoModificareRecordPreventivista } from "@/lib/permessi-preventivi";
import { puoAccedereLead, puoGestireLead } from "@/lib/lead-costanti";

describe("FM68 B2 preventivisti", () => {
  it("write e manage sono preventivisti, read no", () => {
    expect(è_preventivista(["preventivi_write"])).toBe(true);
    expect(è_preventivista(["preventivi_manage"])).toBe(true);
    expect(è_preventivista(["preventivi_read"])).toBe(false);
  });
  it("accedono ai lead senza gestione completa o eliminazione", () => {
    expect(puoAccedereLead(["preventivi_write"])).toBe(true);
    expect(puoAccedereLead(["preventivi_manage"])).toBe(true);
    expect(puoGestireLead(["preventivi_manage"])).toBe(false);
    expect(puoAccedereLead(["preventivi_read"])).toBe(false);
  });
  it("modifica propria, non altrui né senza autore", () => {
    expect(puoModificareRecordPreventivista(["preventivi_write"],"io","io",false)).toBe(true);
    expect(puoModificareRecordPreventivista(["preventivi_write"],"altro","io",false)).toBe(false);
    expect(puoModificareRecordPreventivista(["preventivi_manage"],null,"io",false)).toBe(false);
    expect(puoModificareRecordPreventivista(["preventivi_write"],null,null,false)).toBe(false);
  });
  it("preserva i permessi degli altri ruoli", () => {
    expect(puoModificareRecordPreventivista(["preventivi_write","marketing"],"altro","io",true)).toBe(true);
    expect(puoAccedereLead(["agente"])).toBe(true);
    expect(puoAccedereLead(["showroom"])).toBe(true);
    expect(puoGestireLead(["marketing"])).toBe(true);
  });
});