import { describe, it, expect } from "bun:test";
import { etichettaScoreCerved, coloreSemaforo, statoAttivitaAnomalo, formattaPdCerved, formattaAggiornatoIl } from "@/lib/cerved-presentazione";

describe("cerved-presentazione", () => {
  it("etichette semplici e fallback alla descrizione", () => {
    expect(etichettaScoreCerved({ codice_score: "PAY", descrizione_score: "x" })).toBe("Come paga gli altri fornitori");
    expect(etichettaScoreCerved({ codice_score: "CGS", descrizione_score: null })).toBe("Affidabilità Cerved");
    expect(etichettaScoreCerved({ codice_score: "ZZZ", descrizione_score: "Altro score" })).toBe("Altro score");
  });
  it("semaforo V/G/R e neutro", () => {
    expect(coloreSemaforo("V").tono).toBe("verde");
    expect(coloreSemaforo("g").classe).toContain("bg-warning");
    expect(coloreSemaforo("R").classe).toContain("bg-destructive");
    expect(coloreSemaforo("X").tono).toBe("neutro");
    expect(coloreSemaforo(null).tono).toBe("neutro");
  });
  it("stato attività: A normale, altro anomalo", () => {
    expect(statoAttivitaAnomalo("A")).toBe(false);
    expect(statoAttivitaAnomalo("C")).toBe(true);
    expect(statoAttivitaAnomalo(null)).toBe(false);
  });
  it("pd frazione → percentuale con 2 decimali", () => {
    expect(formattaPdCerved(0.0123)).toBe("1,23%");
    expect(formattaPdCerved(null)).toBeNull();
  });
  it("aggiornato il in ora di Roma", () => {
    expect(formattaAggiornatoIl("2026-11-05T15:04:00Z")).toBe("05/11/2026 alle 16:04");
  });
});
