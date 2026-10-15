/**
 * Fonte unica: come l'import anagrafica Gamma scrive email, email_2, email_3 e pec.
 * Funzione pura (nessun accesso al database), usata da `applyEmailPec` in
 * `src/lib/inngest/functions.server.ts`.
 *
 * Regole (decisione di Andrea, 15/10/2026):
 *  - Campo email: i pezzi VALIDI (splitEmailsMultiple + isEmailValida) vanno in ordine
 *    in email, email_2, email_3; oltre il terzo sono scartati con anomalia.
 *    Email singola valida → email = valore, email_2/email_3 = NULL.
 *  - Colonna email presente ma vuota → email, email_2, email_3 = NULL.
 *    Colonna email assente → nessuno dei tre campi viene toccato.
 *  - PEC solo dalla colonna PEC (mai dallo split delle email). Colonna presente e
 *    cella vuota/non valida → pec = NULL. PEC multipla → primo indirizzo valido.
 *    Colonna PEC assente → pec non toccata.
 *  - Gli invii usano SOLO clienti.email: email_2/email_3 sono solo informative.
 */
import { classificaEmail, isEmailValida, splitEmailsMultiple } from "@/lib/email-validazione";

export interface AnomaliaEmailPec {
  tipo_anomalia: string;
  campo: "email" | "pec";
  valore_attuale: string;
  valore_nuovo: string;
}

export interface EsitoEmailPec {
  /** Solo le chiavi da scrivere: chiave assente = campo non toccato. */
  campi: Partial<Record<"email" | "email_2" | "email_3" | "pec", string | null>>;
  anomalie: AnomaliaEmailPec[];
  splittate: number;
  azzerate: number;
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

  if (colonne.email) {
    const eRaw = rawEmail == null ? "" : String(rawEmail).trim();
    const eClass = classificaEmail(eRaw);
    if (eClass === "ok") {
      campi.email = eRaw;
      campi.email_2 = null;
      campi.email_3 = null;
    } else if (eClass === "vuota") {
      campi.email = null;
      campi.email_2 = null;
      campi.email_3 = null;
    } else if (eClass === "multipla") {
      const validi = splitEmailsMultiple(eRaw).filter((p) => isEmailValida(p));
      campi.email = validi[0] ?? null;
      campi.email_2 = validi[1] ?? null;
      campi.email_3 = validi[2] ?? null;
      splittate++;
      anomalie.push({
        tipo_anomalia: "multipla",
        campo: "email",
        valore_attuale: eRaw.slice(0, 500),
        valore_nuovo: "splittato_email_2_3",
      });
      if (validi.length > 3) {
        anomalie.push({
          tipo_anomalia: "multipla",
          campo: "email",
          valore_attuale: validi.slice(3).join("; ").slice(0, 500),
          valore_nuovo: "scartati_oltre_terzo",
        });
      }
    } else {
      // non_email | malformata → azzera, come oggi
      campi.email = null;
      campi.email_2 = null;
      campi.email_3 = null;
      azzerate++;
      anomalie.push({
        tipo_anomalia: eClass,
        campo: "email",
        valore_attuale: eRaw.slice(0, 500),
        valore_nuovo: "azzerato",
      });
    }
  }

  if (colonne.pec) {
    const pRaw = rawPec == null ? "" : String(rawPec).trim();
    const pClass = classificaEmail(pRaw);
    if (pClass === "ok") {
      campi.pec = pRaw;
    } else if (pClass === "vuota") {
      campi.pec = null;
    } else if (pClass === "multipla") {
      const primo = splitEmailsMultiple(pRaw).find((p) => isEmailValida(p));
      campi.pec = primo ?? null;
      splittate++;
      anomalie.push({
        tipo_anomalia: "multipla",
        campo: "pec",
        valore_attuale: pRaw.slice(0, 500),
        valore_nuovo: "tenuto_primo_valido",
      });
    } else {
      campi.pec = null;
      azzerate++;
      anomalie.push({
        tipo_anomalia: pClass,
        campo: "pec",
        valore_attuale: pRaw.slice(0, 500),
        valore_nuovo: "azzerato",
      });
    }
  }

  return { campi, anomalie, splittate, azzerate };
}
