// Classificazione UNICA per scadenze.
//
// Regola (allineata alla scheda rischio del gestionale):
// - PAGATO  = data_pagamento_effettiva valorizzata (riga incassata davvero).
//             Anche se la data_scadenza e' futura (pagamento anticipato).
// - A SCADERE = data_pagamento_effettiva IS NULL AND data_scadenza >= oggi
//             (a prescindere dallo stato Aperta/Chiusa: include le R.B./effetti
//              "Chiusa" alla presentazione ma non ancora incassati).
// - SCADUTO = stato_contabile = 'Aperta' AND data_scadenza < oggi
//             AND data_pagamento_effettiva IS NULL
//             (regola invariata: lo scaduto resta ancorato allo stato Aperta).
//
// Fallback: se mancano sia data_scadenza sia data_pagamento_effettiva, si usa
// giorni_ritardo solo per le righe Aperte; le Chiuse senza dati si considerano
// pagate.

export type CategoriaScadenza = "scaduto" | "a_scadere" | "pagato";

export function classificaScadenza(s: {
  stato_contabile?: string | null;
  data_scadenza?: string | null;
  data_pagamento_effettiva?: string | null;
  giorni_ritardo?: number | null;
  // legacy: ignorato, accettato solo per retro-compatibilita' di firma
  tempi_scadenza?: string | null;
}): CategoriaScadenza {
  // 1. Incassata davvero (anche in anticipo) -> pagato.
  if (s.data_pagamento_effettiva) return "pagato";

  // 2. Confronto con la data odierna.
  if (s.data_scadenza) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(s.data_scadenza);
    d.setHours(0, 0, 0, 0);

    if (d >= today) {
      // Futura e non incassata -> a scadere (anche se "Chiusa" tipo R.B. presentata).
      return "a_scadere";
    }
    // Data passata: scaduto solo se Aperta (regola invariata).
    if (s.stato_contabile === "Aperta") return "scaduto";
    // Data passata + Chiusa + nessun data_pagamento_effettiva -> consideriamo pagata.
    return "pagato";
  }

  // 3. Senza data scadenza: fallback su giorni_ritardo (solo per Aperte).
  if (s.stato_contabile === "Aperta") {
    const gg = Number(s.giorni_ritardo ?? 0);
    return gg > 0 ? "scaduto" : "a_scadere";
  }
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
