import { describe, expect, it } from "bun:test";
import { classeCgsDaCodice, settoreGaugeCerved, settoreGaugeDaClasseCgs, settoreIconaCervedLista } from "@/lib/cerved-presentazione";

describe("FM84 classe CGS → settore gauge", () => {
  it("legge il numero di classe", () => {
    expect(classeCgsDaCodice("CGS_6")).toBe(6);
    expect(classeCgsDaCodice("CGS_9")).toBeNull();
    expect(classeCgsDaCodice(null)).toBeNull();
  });
  it("CGS_1 sul settore verde (7), CGS_8 sul rosso (0)", () => {
    expect(settoreGaugeDaClasseCgs(1)).toBe(7);
    expect(settoreGaugeDaClasseCgs(6)).toBe(2);
    expect(settoreGaugeDaClasseCgs(8)).toBe(0);
    expect(settoreGaugeDaClasseCgs(null)).toBeNull();
  });
  it("score 41 → settore 3, uguale al gauge della scheda", () => {
    expect(settoreGaugeCerved(41)).toBe(3);
    // Lista: lo score decide, quindi CGS_6 con score 41 va sul settore 3 della scheda, non sul 2 della classe.
    expect(settoreIconaCervedLista(41, 6)).toBe(3);
    expect(settoreIconaCervedLista(41, 6)).toBe(settoreGaugeCerved(41));
  });
  it("senza score la lista ripiega sulla classe; senza entrambi nessun settore", () => {
    expect(settoreIconaCervedLista(null, 6)).toBe(2);
    expect(settoreIconaCervedLista(null, null)).toBeNull();
    expect(settoreIconaCervedLista(undefined, undefined)).toBeNull();
  });
});
