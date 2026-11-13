import { describe, expect, it } from "bun:test";
import { haAccessoPreventivi, preventivoModificabile, puoConsultarePreventivi, puoGestireAnagrafichePreventivi, puoScriverePreventivi, puoVedereFornitori } from "@/lib/permessi-preventivi";
import { puoGestireFornitori, puoVedereArticoliFornitori } from "@/lib/permessi-fornitori";

describe("FM63 consultazione preventivi per store manager", () => {
  const sm = ["store_manager"];
  it("lo store manager consulta preventivi, articoli e fornitori", () => {
    expect(puoConsultarePreventivi(sm)).toBe(true);
    expect(puoVedereFornitori(sm)).toBe(true);
    expect(puoVedereArticoliFornitori(sm)).toBe(true);
  });
  it("lo store manager non ha accesso pieno (ricerca clienti, numerazioni) né scrittura", () => {
    expect(haAccessoPreventivi(sm)).toBe(false);
    expect(puoScriverePreventivi(sm)).toBe(false);
    expect(puoGestireAnagrafichePreventivi(sm)).toBe(false);
    expect(puoGestireFornitori(sm)).toBe(false);
  });
  it("amministrazione vede i fornitori ma non consulta i preventivi", () => {
    expect(puoVedereFornitori(["amministrazione"])).toBe(true);
    expect(puoConsultarePreventivi(["amministrazione"])).toBe(false);
  });
  it("preventivi_read consulta ma non scrive", () => {
    expect(puoConsultarePreventivi(["preventivi_read"])).toBe(true);
    expect(puoScriverePreventivi(["preventivi_read"])).toBe(false);
  });
  it("agente senza ruoli preventivi non consulta", () => {
    expect(puoConsultarePreventivi(["agente"])).toBe(false);
  });
});

describe("FM63 2 bis consultazione per showroom", () => {
  const sh = ["showroom"];
  it("lo showroom consulta preventivi, articoli e fornitori", () => {
    expect(puoConsultarePreventivi(sh)).toBe(true);
    expect(puoVedereFornitori(sh)).toBe(true);
  });
  it("lo showroom non ha accesso pieno né scrittura", () => {
    expect(haAccessoPreventivi(sh)).toBe(false);
    expect(puoScriverePreventivi(sh)).toBe(false);
    expect(puoGestireAnagrafichePreventivi(sh)).toBe(false);
    expect(puoGestireFornitori(sh)).toBe(false);
  });
});
