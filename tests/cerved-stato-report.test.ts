import { describe, expect, it } from "bun:test";
import { statoReportCerved } from "@/lib/cerved-presentazione";

describe("FM85 stato di consegna Cerved", () => {
  it("in attesa è uno stato informativo, non un errore", () => {
    const r = statoReportCerved({ stato: "in_attesa", request_id: "4839611059" });
    expect(r.stato).toBe("in_attesa");
    expect(r.tono).toBe("neutro");
  });
  it("bloccato è un avviso e mantiene il numero richiesta", () => {
    const r = statoReportCerved({ stato: "bloccato", request_id: "4839611059" });
    expect(r.stato).toBe("bloccato");
    expect(r.tono).toBe("avviso");
  });
  it("consegnato non richiede un avviso", () => {
    expect(statoReportCerved({ stato: "consegnato" }).messaggio).toBeNull();
    expect(statoReportCerved(null).messaggio).toBeNull();
  });
});