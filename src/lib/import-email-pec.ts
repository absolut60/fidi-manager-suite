/**
 * Fonte unica: come l'import anagrafica Gamma scrive email, email_2, email_3 e pec.
 * Funzione pura (nessun accesso al database), usata da `applyEmailPec` in
 * `src/lib/inngest/functions.server.ts`.
 *
 * Regole (decisioni di Andrea, 15/10/2026):
 *  - Correzione automatica (fonte unica `src/lib/email-correzione.ts`): prima dello
 *    split il campo passa da normalizzaCampoEmail; ogni pezzo passa da
 *    correggiIndirizzo prima di isEmailValida. Ogni pezzo corretto genera
 *    un'anomalia "email_corretta" (prima → dopo, campo dove finisce).
 *  - Campo email: i pezzi VALIDI vanno in ordine in email, email_2, email_3;
 *    oltre il terzo sono scartati con anomalia "scartati_oltre_terzo".
 *  - Pezzi con @ (o ò) che restano non validi: anomalia "email_da_verificare"
 *    ("da verificare in Gamma"). Testo senza caratteri da email accanto a indirizzi
 *    validi: scartato con anomalia (classificazione originale) "tenuto_solo_validi".
 *    Nessun pezzo valido e nessun pezzo con @: NULL e "azzerato" come prima.
 *  - Colonna email presente ma vuota → email, email_2, email_3 = NULL.
 *    Colonna email assente → nessuno dei tre campi viene toccato.
 *  - PEC solo dalla colonna PEC (mai dallo split delle email): primo indirizzo
 *    valido; cella vuota/non valida → NULL; colonna assente → non toccata.
 *  - Gli invii usano SOLO clienti.email: email_2/email_3 sono solo informative.
 */
import { classificaEmail, isEmailValida, splitEmailsMultiple } from "@/lib/email-validazione";
import { correggiIndirizzo, normalizzaCampoEmail, sembraEmail } from "@/lib/email-correzione";

type CampoEmail = "email" | "email_2" | "email_3" | "pec";

export interface AnomaliaEmailPec {
  tipo_anomalia: string;
  campo: CampoEmail;
  valore_attuale: string;
  valore_nuovo: string;
}

export interface EsitoEmailPec {
  /** Solo le chiavi da scrivere: chiave assente = campo non toccato. */
  campi: Partial<Record<CampoEmail, string | null>>;
  anomalie: AnomaliaEmailPec[];
  splittate: number;
  azzerate: number;
  corrette: number;
}

type Pezzo = { originale: string; valore: string; correzioni: string[]; valido: boolean };

function analizza(raw: string): { pezzi: Pezzo[]; normalizzato: string } {
  const normalizzato = normalizzaCampoEmail(raw);
  const pezzi = splitEmailsMultiple(normalizzato).map((p) => {
    const c = correggiIndirizzo(p);
    return { originale: p, valore: c.valore, correzioni: c.correzioni, valido: isEmailValida(c.valore) };
  });
  return { pezzi, normalizzato };
}

export function calcolaEmailPecImport(
  rawEmail: unknown,
  rawPec: unknown,
  colonne: { email: boolean; pec: boolean },
): EsitoEmailPec {
  const campi: EsitoEmailPec["campi"] = {};
  const anomalie: AnomaliaEmailPec[] = [];
  let splittate = 0;
  let azzerate = 0;
  let corrette = 0;

  /** Anomalie comuni a email e PEC per i pezzi non validi. */
  function scarti(campo: "email" | "pec", raw: string, pezzi: Pezzo[], almenoUnValido: boolean) {
    const tipoOrig = classificaEmail(raw);
    const daVerificare = pezzi.filter((p) => !p.valido && sembraEmail(p.originale));
    for (const p of daVerificare) {
      anomalie.push({ tipo_anomalia: "email_da_verificare", campo, valore_attuale: p.originale.slice(0, 500), valore_nuovo: "da verificare in Gamma" });
    }
    const testo = pezzi.filter((p) => !p.valido && !sembraEmail(p.originale));
    if (almenoUnValido && testo.length > 0) {
      anomalie.push({
        tipo_anomalia: tipoOrig === "ok" || tipoOrig === "multipla" ? "malformata" : tipoOrig,
        campo,
        valore_attuale: raw.slice(0, 500),
        valore_nuovo: "tenuto_solo_validi",
      });
    }
    if (!almenoUnValido && daVerificare.length === 0) {
      anomalie.push({ tipo_anomalia: tipoOrig, campo, valore_attuale: raw.slice(0, 500), valore_nuovo: "azzerato" });
    }
  }

  function corretta(p: Pezzo, campo: CampoEmail) {
    if (p.correzioni.length === 0) return;
    corrette++;
    anomalie.push({ tipo_anomalia: "email_corretta", campo, valore_attuale: p.originale.slice(0, 500), valore_nuovo: p.valore });
  }

  if (colonne.email) {
    const eRaw = rawEmail == null ? "" : String(rawEmail).trim();
    if (eRaw === "") {
      campi.email = null;
      campi.email_2 = null;
      campi.email_3 = null;
    } else {
      const { pezzi } = analizza(eRaw);
      const validi = pezzi.filter((p) => p.valido);
      const destinazioni: CampoEmail[] = ["email", "email_2", "email_3"];
      destinazioni.forEach((c, i) => { campi[c] = validi[i]?.valore ?? null; });
      validi.slice(0, 3).forEach((p, i) => corretta(p, destinazioni[i]));
      if (validi.length >= 2) {
        splittate++;
        anomalie.push({ tipo_anomalia: "multipla", campo: "email", valore_attuale: eRaw.slice(0, 500), valore_nuovo: "splittato_email_2_3" });
      }
      if (validi.length > 3) {
        anomalie.push({
          tipo_anomalia: "multipla",
          campo: "email",
          valore_attuale: validi.slice(3).map((p) => p.valore).join("; ").slice(0, 500),
          valore_nuovo: "scartati_oltre_terzo",
        });
      }
      if (validi.length === 0) azzerate++;
      scarti("email", eRaw, pezzi, validi.length > 0);
    }
  }

  if (colonne.pec) {
    const pRaw = rawPec == null ? "" : String(rawPec).trim();
    if (pRaw === "") {
      campi.pec = null;
    } else {
      const { pezzi } = analizza(pRaw);
      const validi = pezzi.filter((p) => p.valido);
      campi.pec = validi[0]?.valore ?? null;
      if (validi[0]) corretta(validi[0], "pec");
      if (validi.length >= 2) {
        splittate++;
        anomalie.push({ tipo_anomalia: "multipla", campo: "pec", valore_attuale: pRaw.slice(0, 500), valore_nuovo: "tenuto_primo_valido" });
      }
      if (validi.length === 0) azzerate++;
      scarti("pec", pRaw, pezzi, validi.length > 0);
    }
  }

  return { campi, anomalie, splittate, azzerate, corrette };
}
