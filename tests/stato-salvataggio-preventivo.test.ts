import { describe, it, expect } from "vitest";
import { derivaStatoSalvataggio, ultimaScritturaInErrore } from "@/lib/use-stato-salvataggio-preventivo";

describe("derivaStatoSalvataggio", () => {
  it("errore vince su tutto", () => expect(derivaStatoSalvataggio({ errore: true, inCorso: true, caselleAperte: true })).toBe("errore"));
  it("salvataggio vince su modifiche", () => expect(derivaStatoSalvataggio({ errore: false, inCorso: true, caselleAperte: true })).toBe("salvataggio"));
  it("modifiche se casella aperta", () => expect(derivaStatoSalvataggio({ errore: false, inCorso: false, caselleAperte: true })).toBe("modifiche"));
  it("salvato altrimenti", () => expect(derivaStatoSalvataggio({ errore: false, inCorso: false, caselleAperte: false })).toBe("salvato"));
});
describe("ultimaScritturaInErrore", () => {
  it("errore seguito da riuscita non è errore", () => expect(ultimaScritturaInErrore([{ status: "error", submittedAt: 1 }, { status: "success", submittedAt: 2 }])).toBe(false));
  it("ultima in errore", () => expect(ultimaScritturaInErrore([{ status: "success", submittedAt: 1 }, { status: "error", submittedAt: 2 }])).toBe(true));
  it("in corso ignorata", () => expect(ultimaScritturaInErrore([{ status: "error", submittedAt: 1 }, { status: "pending", submittedAt: 2 }])).toBe(true));
  it("nessuna scrittura", () => expect(ultimaScritturaInErrore([])).toBe(false));
});
