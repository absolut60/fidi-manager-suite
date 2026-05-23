// Classificazione unica per scadenze, basata su "Tempi Scadenza" del gestionale
// con fallback su stato_contabile + giorni_ritardo.
// Priorità ASSOLUTA a tempi_scadenza: se presente, decide da solo.

export type CategoriaScadenza = "scaduto" | "a_scadere" | "pagato";

export function classificaScadenza(s: {
  tempi_scadenza?: string | null;
  stato_contabile?: string | null;
  giorni_ritardo?: number | null;
}): CategoriaScadenza {
  const tempi = (s.tempi_scadenza ?? "").toLowerCase().trim();

  // 1. tempi_scadenza ha priorità assoluta
  if (tempi) {
    if (tempi.includes("a scadere")) return "a_scadere";
    if (tempi.includes("scadut")) return "scaduto";
    if (tempi.includes("pagat")) return "pagato";
  }

  // 2. Fallback su stato_contabile + giorni_ritardo
  const aperta = s.stato_contabile === "Aperta";
  const gg = Number(s.giorni_ritardo ?? 0);
  if (aperta && gg > 0) return "scaduto";
  if (aperta && gg <= 0) return "a_scadere";
  return "pagato";
}
