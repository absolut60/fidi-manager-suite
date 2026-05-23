// Classificazione unica per scadenze, basata su "Tempi Scadenza" del gestionale
// con fallback su stato_contabile + giorni_ritardo.

export type CategoriaScadenza = "scaduto" | "a_scadere" | "pagato";

export function classificaScadenza(s: {
  tempi_scadenza?: string | null;
  stato_contabile?: string | null;
  giorni_ritardo?: number | null;
}): CategoriaScadenza {
  const tempi = (s.tempi_scadenza ?? "").toLowerCase();
  const aperta = s.stato_contabile === "Aperta";
  const gg = Number(s.giorni_ritardo ?? 0);

  if (tempi.includes("scadut") || (aperta && gg > 0)) return "scaduto";
  if (tempi.includes("a scadere") || (aperta && gg === 0)) return "a_scadere";
  return "pagato";
}
