import { describe, it, expect } from "vitest";
import { principaleDiAlternativa } from "@/lib/preventivi-api";
describe("principaleDiAlternativa", () => {
  it("da un principale restituisce il suo id", () => {
    expect(principaleDiAlternativa({ id: "p1", alternativa_di: null })).toBe("p1");
  });
  it("da un'alternativa restituisce il suo principale", () => {
    expect(principaleDiAlternativa({ id: "a2", alternativa_di: "p1" })).toBe("p1");
  });
});
