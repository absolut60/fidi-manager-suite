import { describe, expect, it } from "bun:test";
import { classeCgsDaCodice, settoreGaugeDaClasseCgs } from "@/lib/cerved-presentazione";

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
});
