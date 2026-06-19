// Classificazione UNICA per scadenze.
//
// Regola (specchio del gestionale):
// - SCADUTO  = stato_contabile = 'Aperta' AND data_scadenza < oggi
//              (NON guarda data_pagamento_effettiva: finche' la riga e'
//               Aperta, e' scaduto anche se c'e' un acconto/pagamento
//               registrato sulla partita).
// - PAGATO   = data_pagamento_effettiva valorizzata (riga incassata
//              davvero) e NON gia' classificata come scaduto sopra.
//              Include anche i pagamenti anticipati (scadenza futura).
// - A SCADERE = data_pagamento_effettiva IS NULL AND data_scadenza >= oggi
//              (a prescindere dallo stato Aperta/Chiusa: include le
//               R.B./effetti "Chiusa" alla presentazione ma non ancora
//               incassati).
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. SCADUTO ha la precedenza: riga Aperta + data_scadenza < oggi.
  //    Non si guarda data_pagamento_effettiva: un acconto/pagamento parziale
  //    su partita ancora Aperta resta nello scaduto (come il gestionale).
  if (s.stato_contabile === "Aperta" && s.data_scadenza) {
    const d = new Date(s.data_scadenza);
    d.setHours(0, 0, 0, 0);
    if (d < today) return "scaduto";
  }

  // 2. Incassata davvero (anche in anticipo) e non scaduta-Aperta -> pagato.
  if (s.data_pagamento_effettiva) return "pagato";

  // 3. Non incassata: futura -> a scadere (qualsiasi stato, anche "Chiusa" tipo R.B.).
  if (s.data_scadenza) {
    const d = new Date(s.data_scadenza);
    d.setHours(0, 0, 0, 0);
    if (d >= today) return "a_scadere";
    // Data passata + non Aperta + nessun DPE -> consideriamo pagata.
    return "pagato";
  }

  // 4. Senza data scadenza: fallback su giorni_ritardo (solo per Aperte).
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
