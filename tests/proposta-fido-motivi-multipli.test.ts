import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { motiviRigaProposta, motivoRigaProposta } from "@/lib/proposta-fido-visibilita";
import { etichetteRigaProposta } from "@/lib/proposta-fido-riga";

describe("motiviRigaProposta: tutti i motivi in ordine di priorità", () => {
  it("scaduto + ordini → [scaduto, ordini_oltre_fido]", () => {
    const x = { regola: "scaduto_non_incassato", segnalazioni: ["ordini_oltre_fido", "scaduto_non_incassato"] };
    expect(motiviRigaProposta(x)).toEqual(["scaduto", "ordini_oltre_fido"]);
    expect(motivoRigaProposta(x).motivo).toBe("scaduto");
    expect(etichetteRigaProposta(x).map((e) => e.testo)).toEqual(["Cliente con scaduto", "Ordini oltre il fido"]);
  });
  it("bloccato prima di tutto, nessun motivo → elenco vuoto", () => {
    expect(motiviRigaProposta({ regola: "cliente_bloccato", segnalazioni: ["oltre_normale", "scaduto_non_incassato"] }))
      .toEqual(["bloccato", "scaduto", "da_autorizzare"]);
    expect(motiviRigaProposta({ regola: "calcolo", segnalazioni: [] })).toEqual([]);
  });
});

describe("pagine", () => {
  const massiva = readFileSync("src/components/proposta-fido-massiva-dialog.tsx", "utf8");
  const alert = readFileSync("src/routes/_app/alert-fidi.tsx", "utf8");
  it("la massiva non usa più SegnalazioniFido nei dettagli", () => {
    expect(massiva).not.toContain("SegnalazioniFido");
    expect(massiva).toContain("<BadgeMotiviRiga");
  });
  it("Alert mostra tutti i badge, ordini in azzurro e ▸ dettagli", () => {
    expect(alert).toContain("<BadgeMotiviRiga");
    expect(alert).toContain("<DettagliRiga");
    expect(alert).toContain("text-motivo-ordini");
    expect(alert).not.toContain("text-xs text-warning");
  });
});
