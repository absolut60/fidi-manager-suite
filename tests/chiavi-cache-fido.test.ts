import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { chiaveRiferimentoRichiestaMassiva, chiaveRiferimentoRichiestaSingola } from "../src/lib/chiavi-cache-fido";

describe("chiavi cache riferimento richiesta", () => {
  it("vecchie chiavi: con un solo cliente la massiva leggeva il numero della singola", () => {
    const qc = new QueryClient();
    qc.setQueryData(["fido-teorico-per-richiesta", "u1", "c1"], 262000);
    const dato: any = qc.getQueryData(["fido-teorico-per-richiesta", "u1", ["c1"].sort().join(",")]);
    expect(typeof dato?.get).toBe("undefined");
  });
  it("nuove chiavi: un solo cliente non collide più", () => {
    const qc = new QueryClient();
    qc.setQueryData(chiaveRiferimentoRichiestaSingola("u1", "c1"), 262000);
    qc.setQueryData(chiaveRiferimentoRichiestaMassiva("u1", ["c1"]), new Map([["c1", 262000]]));
    expect(qc.getQueryData(chiaveRiferimentoRichiestaSingola("u1", "c1"))).toBe(262000);
    expect(qc.getQueryData<Map<string, number>>(chiaveRiferimentoRichiestaMassiva("u1", ["c1"]))?.get("c1")).toBe(262000);
  });
});
