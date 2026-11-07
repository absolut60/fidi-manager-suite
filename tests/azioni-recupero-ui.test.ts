import { describe, expect, test } from "bun:test";
import { azioneInRitardo, ESITI_AZIONE, ESITO_AZIONE_COLORE, ESITO_AZIONE_LABEL } from "../src/lib/azioni-recupero-ui";

describe("FM60 esiti recupero", () => {
  test("etichette e colori canonici inclusi i piani non selezionabili", () => {
    const attesi = [
      ["da_fare", "Da fare", "bg-warning/20 text-warning-foreground border-warning/50"],
      ["in_ritardo", "In ritardo", "bg-destructive/10 text-destructive border-destructive/40"],
      ["fatto", "Fatto", "bg-info/20 text-info border-info/40"],
      ["pagato", "Pagato", "bg-success text-success-foreground border-success"],
      ["nessuna_risposta", "Nessuna risposta", "bg-muted text-muted-foreground border-border"],
      ["contestazione", "Contestazione", "bg-destructive/10 text-destructive border-destructive/40"],
      ["piano_rientro", "Piano di rientro", "bg-success/15 text-success border-success/30"],
    ];
    for (const [esito, label, colore] of attesi) {
      expect(ESITO_AZIONE_LABEL[esito]).toBe(label);
      expect(ESITO_AZIONE_COLORE[esito]).toBe(colore);
    }
    expect(ESITI_AZIONE.some((e) => String(e.value) === "piano_rientro")).toBe(false);
  });
  test("ritardo confrontato con l'istante corrente solo per azioni da fare", () => {
    const ora = Date.parse("2026-11-07T05:57:00Z");
    expect(azioneInRitardo({ esito: "da_fare", data_azione: "2026-11-07T05:56:59Z" }, ora)).toBe(true);
    expect(azioneInRitardo({ esito: "da_fare", data_azione: "2026-11-07T05:57:00Z" }, ora)).toBe(false);
    expect(azioneInRitardo({ esito: "fatto", data_azione: "2026-11-01T00:00:00Z" }, ora)).toBe(false);
  });
});