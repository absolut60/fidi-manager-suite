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

// ---------------------------------------------------------------------------
// ANTICIPI vs NOTE DI CREDITO - regola scaduto con clamp selettivo
// ---------------------------------------------------------------------------
// Definizioni:
//   ANTICIPO = riga scaduta con numero_documento ILIKE '%ANTICIPO%' (importo
//              positivo nel dato). Non usare key_tipo_effetto.
//   NOTA DI CREDITO = riga scaduta con importo_scadenza < 0 NON anticipo.
//
// Regola scaduto per cliente (NON modifica il dato grezzo in DB):
//   scaduto_senza_anticipi = SUM(importo_scadenza) col segno, righe NON-anticipo
//   totale_anticipi        = SUM(importo_scadenza) sulle righe anticipo
//   scaduto_finale         = max(scaduto_senza_anticipi - totale_anticipi,
//                                min(scaduto_senza_anticipi, 0))
//
// Significato del clamp selettivo:
//   - se scaduto_senza_anticipi >= 0 (no note credito o gia' compensate):
//     floor = 0  -> l'anticipo non puo' rendere negativo il totale.
//   - se scaduto_senza_anticipi < 0 (cliente a credito da note credito):
//     floor = scaduto_senza_anticipi -> resta visibile il saldo NC,
//     l'anticipo non lo peggiora oltre.
//
// Fonte di verita' TS: queste funzioni. Le RPC SQL replicano la stessa formula.

export function isAnticipo(s: { numero_documento?: string | null }): boolean {
  const nd = s.numero_documento ?? "";
  return /ANTICIPO/i.test(nd);
}

// Contributo SIGNED di una singola riga al totale per FASCIA (non clampato).
// Le anticipi contribuiscono col segno opposto, le NC col loro segno reale.
export function contributoScaduto(s: {
  importo_scadenza?: number | null;
  numero_documento?: string | null;
}): number {
  const imp = Number(s.importo_scadenza ?? 0);
  return isAnticipo(s) ? -imp : imp;
}

// Scaduto cliente con clamp selettivo: gli anticipi non rendono negativo il
// totale, ma le note di credito reali restano visibili.
export function sommaScadutoCliente(
  rows: Array<{ importo_scadenza?: number | null; numero_documento?: string | null }>,
): number {
  let scadutoSenzaAnticipi = 0;
  let totaleAnticipi = 0;
  for (const r of rows) {
    const imp = Number(r.importo_scadenza ?? 0);
    if (isAnticipo(r)) totaleAnticipi += imp;
    else scadutoSenzaAnticipi += imp;
  }
  return Math.max(scadutoSenzaAnticipi - totaleAnticipi, Math.min(scadutoSenzaAnticipi, 0));
}

// ---------------------------------------------------------------------------
// PAGATO (incassato reale) — definizione canonica
// ---------------------------------------------------------------------------
// Una riga concorre al pagato SE e SOLO SE:
//   data_pagamento_effettiva IS NOT NULL AND importo_pagato > 0
// (allineata a get_esperienza_pagamento_cliente e a classificaScadenza).
//
// Escluse:
//   - RiBa presentate ma non incassate (imp_pag>0 ma dpe IS NULL);
//   - partite tecniche (importo_scadenza = 0) — filtro applicato dai chiamanti.
//
// Nota acconti su partita Aperta: la riga puo' avere sia una quota pagata
// (importo_pagato) sia un residuo scaduto (importo_scadenza - importo_pagato).
// La quota pagata concorre al PAGATO; il residuo continua a comparire nello
// SCADUTO tramite classificaScadenza. La riga puo' quindi comparire in
// entrambe le sezioni: e' voluto (visibilita' "X di Y").
export function isPagatoReale(s: {
  data_pagamento_effettiva?: string | null;
  importo_pagato?: number | null;
}): boolean {
  if (!s.data_pagamento_effettiva) return false;
  const q = Number(s.importo_pagato ?? 0);
  return q > 0;
}


