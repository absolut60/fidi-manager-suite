import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { motivoRigaProposta } from "@/lib/proposta-fido-visibilita";
import { CLASSI_MOTIVO_RIGA, LEGENDA_MOTIVI, etichettaRigaProposta } from "@/lib/proposta-fido-riga";

describe("FM55 fetta 5bis — motivoRigaProposta (fonte unica colore/etichetta/spunta)", () => {
  test("un motivo solo", () => {
    expect(motivoRigaProposta({ regola: "scaduto_non_incassato", segnalazioni: [] }).motivo).toBe("scaduto");
    expect(motivoRigaProposta({ regola: "calcolo", segnalazioni: ["scaduto_non_incassato"] }).motivo).toBe("scaduto");
    expect(motivoRigaProposta({ regola: "cliente_bloccato", segnalazioni: [] }).motivo).toBe("bloccato");
    expect(motivoRigaProposta({ regola: "calcolo", segnalazioni: ["bloccato"] }).motivo).toBe("bloccato");
    expect(motivoRigaProposta({ regola: "gestione_legale", segnalazioni: [] }).motivo).toBe("legale");
    expect(motivoRigaProposta({ regola: "calcolo", segnalazioni: ["oltre_normale"] }).motivo).toBe("da_autorizzare");
    expect(motivoRigaProposta({ regola: "calcolo", segnalazioni: ["ordini_oltre_fido"] }).motivo).toBe("ordini_oltre_fido");
    expect(motivoRigaProposta({ regola: "calcolo", segnalazioni: ["uso_pieno"] }).motivo).toBeNull();
    expect(motivoRigaProposta({ regola: "calcolo" }).motivo).toBeNull();
  });

  test("priorità: bloccato/legale > scaduto > da autorizzare > ordini", () => {
    expect(motivoRigaProposta({ regola: "cliente_bloccato", segnalazioni: ["scaduto_non_incassato", "oltre_normale"] }).motivo).toBe("bloccato");
    expect(motivoRigaProposta({ regola: "gestione_legale", segnalazioni: ["scaduto_non_incassato"] }).motivo).toBe("legale");
    expect(motivoRigaProposta({ regola: "calcolo", segnalazioni: ["scaduto_non_incassato", "ordini_oltre_fido"] }).motivo).toBe("scaduto");
    expect(motivoRigaProposta({ regola: "calcolo", segnalazioni: ["ordini_oltre_fido", "oltre_normale"] }).motivo).toBe("da_autorizzare");
  });

  test("etichette e toni per motivo", () => {
    expect(etichettaRigaProposta({ regola: "scaduto_non_incassato" })).toEqual({ tono: "rossa", testo: "Scaduto non pagato" });
    expect(etichettaRigaProposta({ regola: "cliente_bloccato" })).toEqual({ tono: "rosso_scuro", testo: "Bloccato" });
    expect(etichettaRigaProposta({ regola: "gestione_legale" })).toEqual({ tono: "rosso_scuro", testo: "In legale" });
    expect(etichettaRigaProposta({ regola: "calcolo", segnalazioni: ["oltre_normale"] })).toEqual({ tono: "viola", testo: "Da autorizzare: compra molto più del solito" });
    expect(etichettaRigaProposta({ regola: "calcolo", segnalazioni: ["ordini_oltre_fido"] })).toEqual({ tono: "arancione", testo: "Ordini oltre il fido" });
  });

  test("ogni motivo ha classi colore dai token del tema e la legenda copre i quattro motivi", () => {
    for (const m of ["scaduto", "bloccato", "legale", "da_autorizzare", "ordini_oltre_fido"] as const) {
      expect(CLASSI_MOTIVO_RIGA[m].bordo).toContain("border-l-motivo-");
      expect(CLASSI_MOTIVO_RIGA[m].sfondo).toContain("bg-motivo-");
    }
    expect(LEGENDA_MOTIVI.map((l) => l.motivo)).toEqual(["bloccato", "scaduto", "da_autorizzare", "ordini_oltre_fido"]);
    // Bloccato/legale: rosso scuro pieno, mai grigio.
    expect(CLASSI_MOTIVO_RIGA.bloccato.badge).toContain("bg-motivo-bloccato ");
    expect(CLASSI_MOTIVO_RIGA.legale.badge).toContain("bg-motivo-bloccato ");
    // I colori vivono nei token del tema, non nel componente.
    const css = readFileSync("src/styles.css", "utf8");
    for (const t of ["--motivo-scaduto", "--motivo-autorizzare", "--motivo-ordini", "--motivo-bloccato"]) expect(css).toContain(t);
    const dialog = readFileSync("src/components/proposta-fido-massiva-dialog.tsx", "utf8");
    expect(dialog).not.toMatch(/border-l-destructive|bg-destructive\/15/);
    expect(dialog).toContain("data-legenda-motivi");
  });
});
