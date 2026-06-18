// Classificazione UNICA per scadenze.
// Fonte di verità: stato_contabile + data_pagamento_effettiva + data_scadenza.
// tempi_scadenza NON e' piu' usato per decidere lo stato: nel tracciato
// MADE_VISTASCADENZE indica la FASCIA DI ANZIANITA (es. "Scaduto oltre 120
// giorni") ed e' presente anche su righe gia' pagate.

export type CategoriaScadenza = "scaduto" | "a_scadere" | "pagato";

export function classificaScadenza(s: {
  stato_contabile?: string | null;
  data_pagamento_effettiva?: string | null;
  data_scadenza?: string | null;
  // legacy: ignorati, accettati solo per retro-compatibilita' di firma
  tempi_scadenza?: string | null;
  giorni_ritardo?: number | null;
}): CategoriaScadenza {
  // 1. Pagato: ha data di pagamento effettiva, oppure stato Chiusa.
  if (s.data_pagamento_effettiva) return "pagato";
  if (s.stato_contabile && s.stato_contabile !== "Aperta") return "pagato";

  // 2. Aperta: scaduto se data scadenza nel passato, altrimenti a scadere.
  if (s.stato_contabile === "Aperta") {
    if (s.data_scadenza) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const d = new Date(s.data_scadenza);
      d.setHours(0, 0, 0, 0);
      return d < today ? "scaduto" : "a_scadere";
    }
    // Senza data scadenza: usa giorni_ritardo come ultimo fallback.
    const gg = Number(s.giorni_ritardo ?? 0);
    return gg > 0 ? "scaduto" : "a_scadere";
  }

  // 3. Nessuna info utile: trattala come pagata (no rischio).
  return "pagato";
}

// Etichetta di anzianita' per UI/raggruppamento. Va applicata SOLO alle righe
// gia' classificate "scaduto" (cioe' Aperte e in ritardo). Per quelle Chiuse
// tempi_scadenza indica solo "con che ritardo sono state pagate" e non deve
// essere usato per raggruppamenti di scaduto/a-scadere correnti.
export function fasciaAnzianita(tempi_scadenza?: string | null): string | null {
  const t = (tempi_scadenza ?? "").toLowerCase();
  if (!t) return null;
  if (t.includes("oltre 120")) return "oltre 120 gg";
  if (t.includes("90-120") || t.includes("90 - 120")) return "90-120 gg";
  if (t.includes("60-90") || t.includes("60 - 90")) return "60-90 gg";
  if (t.includes("30-60") || t.includes("30 - 60")) return "30-60 gg";
  if (t.includes("30")) return "0-30 gg";
  return null;
}
